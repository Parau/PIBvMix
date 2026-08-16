import { createStore, initialState } from './state/store.js'
import { VmixClient, normalizeTarget } from './vmix/client.js'
import { MockVmixClient } from './vmix/mock.js'
import { parseVmixXml } from './vmix/parser.js'
import { VmixPoller } from './vmix/poller.js'
import { buildOnAirSet } from './vmix/safety.js'
import { verifyResourceFields } from './vmix/resolver.js'
import { loadConfig, saveConfig } from './config/storage.js'
import { downloadConfig, readConfigFile } from './config/backup.js'
import { renderConfigure } from './ui/configure.js'
import { renderControl } from './ui/control.js'

const saved = loadConfig()
const store = createStore({ ...initialState, config: saved || initialState.config })
let client = null
let poller = null
let demoBackup = null
const commandLocks = new Map()
const root = document.querySelector('#app')
const newId = () => crypto.randomUUID?.() || `r-${Date.now()}-${Math.random().toString(16).slice(2)}`

function update(fn) { store.setState((s) => fn(structuredClone(s))) }
function persist(config) { try { saveConfig(config) } catch { toast('Configuration cannot be persisted in this browser.', 'error', 5000) } }
function commitConfig(mutator) {
  update((s) => { mutator(s.config); if (!s.ui.demo) persist(s.config); return s })
}
function toast(message, kind = 'info', ms = 2200) {
  update((s) => { s.ui.toast = { message, kind }; return s })
  setTimeout(() => update((s) => { if (s.ui.toast?.message === message) s.ui.toast = null; return s }), ms)
}

async function applyXml(xml) {
  const parsed = parseVmixXml(xml)
  update((s) => {
    s.vmixState = parsed
    s.connection.status = 'connected'; s.connection.message = ''; s.connection.lastUpdated = Date.now()
    if (parsed.presetName) s.config.vmix.lastPresetName = parsed.presetName
    return s
  })
  return parsed
}

function onPollError(err) {
  update((s) => {
    const wasConnected = s.connection.status === 'connected' || s.connection.status === 'degraded'
    s.connection.status = wasConnected ? 'degraded' : 'disconnected'
    s.connection.message = err?.name === 'AbortError' ? 'vMix request timed out.' : (err?.message || 'Unable to reach vMix.')
    return s
  })
}

function startPoller() {
  poller?.stop()
  poller = new VmixPoller(() => client.fetchState(), applyXml, onPollError, store.getState().mode === 'control' ? 500 : 1100)
  poller.start()
}

async function connect(target) {
  update((s) => { s.connection = { status:'connecting', message:'', lastUpdated:null }; return s })
  try {
    client = new VmixClient(target)
    const xml = await client.testConnection(); const parsed = await applyXml(xml)
    commitConfig((cfg) => { cfg.vmix.target = normalizeTarget(target); cfg.vmix.lastPresetName = parsed.presetName || '' })
    update((s) => { s.ui.demo = false; return s })
    startPoller(); toast(`Connected to vMix ${parsed.version || ''}`, 'success')
  } catch (err) { onPollError(err) }
}

async function toggleDemo() {
  poller?.stop()
  const currentlyDemo = store.getState().ui.demo
  if (currentlyDemo) {
    client = null
    update((s) => { s.ui.demo=false; s.vmixState=null; if (demoBackup) s.config=demoBackup; s.connection={status:'idle',message:'Demo mode stopped.',lastUpdated:null}; return s })
    demoBackup = null
    return
  }
  demoBackup = structuredClone(store.getState().config)
  client = new MockVmixClient()
  update((s) => { s.ui.demo=true; s.connection={status:'connecting',message:'',lastUpdated:null}; return s })
  await applyXml(await client.fetchState())
  seedDemoResources()
  startPoller(); toast('Demo vMix loaded.', 'success')
}

function seedDemoResources() {
  const current = store.getState()
  // Demo uses a temporary palette and never overwrites the operator's persisted configuration.
  const by = current.vmixState.inputByKey
  const lower = by['lower-people']
  const peopleCatalog = [
    ['John Smith',0,['John Smith','@johnsmith']],
    ['Maria Silva',1,['Maria Silva','@mariasilva']],
    ['David Lee',2,['David Lee','@davidlee']],
    ['Ana Costa',3,['Ana Costa','@anacosta']],
  ].map(([label,presetIndex,csvRow]) => ({ label, presetIndex, csvRow, verification:{mode:'verifiedFields',fieldNames:['Name.Text','Instagram.Text']}, selected:true, resourceId:newId() }))
  const resources = peopleCatalog.map((p) => ({ id:p.resourceId, type:'titlePreset', label:p.label, inputKey:'lower-people', presetIndex:p.presetIndex, csvRow:p.csvRow, verification:p.verification }))
  for (const key of ['video-1','image-1','cam-1','cam-2','cam-wide','video-2','image-2']) {
    const input=by[key]; resources.push({id:newId(),type:'input',label:input.shortTitle||input.title,inputKey:key})
  }
  resources.splice(4,0,{id:newId(),type:'titlePreset',label:'Breaking News',inputKey:'lower-news',presetIndex:0,csvRow:['Breaking News'],verification:{mode:'verifiedFields',fieldNames:['Headline.Text']}})
  commitConfig((cfg) => {
    cfg.resources=resources
    cfg.titleSources=[{
      inputKey:'lower-people',
      inputLabelAtImport:lower.shortTitle,
      csv:{fileName:'demo-speakers.csv',rowCount:4,importedAt:new Date().toISOString(),sha256:'demo'},
      verificationMode:'verifiedFields',
      presets:peopleCatalog,
    }]
  })
}

async function refresh() {
  if (!client) return toast('Connect to vMix or use Demo mode first.', 'error')
  try { await poller?.refreshNow() || applyXml(await client.fetchState()) } catch {}
}

function setBusy(key, busy) { update((s)=>{ const set=new Set(s.ui.busyInputKeys); busy?set.add(key):set.delete(key); s.ui.busyInputKeys=[...set]; return s }) }
async function waitFor(predicate, timeoutMs=1800, step=90) {
  const deadline=Date.now()+timeoutMs
  while(Date.now()<deadline){ const parsed=await applyXml(await client.fetchState()); if(predicate(parsed)) return parsed; await new Promise(r=>setTimeout(r,step)) }
  throw new Error('vMix state did not confirm the command in time.')
}

async function sendResource(id) {
  const resource=store.getState().config.resources.find((r)=>r.id===id); if(!resource || !client) return
  const key=resource.inputKey
  if (commandLocks.has(key)) return
  commandLocks.set(key, true)
  setBusy(key,true)
  try {
    let state = store.getState().vmixState
    if (!state || Date.now()-(store.getState().connection.lastUpdated||0)>650) state = await applyXml(await client.fetchState())
    const input=state.inputByKey[key]; if(!input) throw new Error('Resource is unavailable in the current vMix production.')
    if(resource.type==='titlePreset'){
      if(buildOnAirSet(state).has(key)) throw new Error('This Lower is ON AIR and cannot be changed.')
      await client.command('SelectTitlePreset',{Input:key,Value:resource.presetIndex})
      if(resource.verification?.mode==='verifiedFields') {
        state = await waitFor((s)=>verifyResourceFields(s.inputByKey[key],resource),1300,75)
      }
      if(buildOnAirSet(state).has(key)) throw new Error('The Lower became ON AIR before Preview could be changed.')
    }
    await client.command('PreviewInput',{Input:key,Mix:0})
    await waitFor((s)=>s.mainMix.previewKey===key)
    toast(`${resource.label} is in Preview.`, 'success')
  } catch(err){ toast(err.message || 'Command failed.', 'error', 4200) }
  finally { setBusy(key,false); commandLocks.delete(key) }
}

const actions = {
  connect, toggleDemo, refresh,
  toControl(){ update((s)=>{s.mode='control';s.ui.query='';s.ui.filter='all';return s}); if(poller){poller.interval=500} },
  toConfigure(){ update((s)=>{s.mode='configure';s.ui.query='';s.ui.filter='all';return s}); if(poller){poller.interval=1100} },
  setQuery(value){ update((s)=>{s.ui.query=value;return s}) }, setFilter(value){ update((s)=>{s.ui.filter=value;return s}) },
  toggleInput(key,checked){
    commitConfig((cfg)=>{ const idx=cfg.resources.findIndex((r)=>r.type==='input'&&r.inputKey===key); if(checked&&idx<0){ const input=store.getState().vmixState.inputByKey[key]; cfg.resources.push({id:newId(),type:'input',label:input.shortTitle||input.title,inputKey:key}) } else if(!checked&&idx>=0) cfg.resources.splice(idx,1) })
  },
  removeResource(id){ commitConfig((cfg)=>{cfg.resources=cfg.resources.filter((r)=>r.id!==id)}) },
  renameResource(id,label){ commitConfig((cfg)=>{const r=cfg.resources.find((x)=>x.id===id);if(r)r.label=label.trim()||r.label}) },
  moveResource(id,delta){ commitConfig((cfg)=>{const i=cfg.resources.findIndex((r)=>r.id===id);const j=Math.max(0,Math.min(cfg.resources.length-1,i+delta));if(i>=0&&i!==j){const [r]=cfg.resources.splice(i,1);cfg.resources.splice(j,0,r)}}) },
  reorderByIds(ids){ commitConfig((cfg)=>{const map=new Map(cfg.resources.map((r)=>[r.id,r]));const next=ids.map((x)=>map.get(x)).filter(Boolean);for(const r of cfg.resources)if(!ids.includes(r.id))next.push(r);cfg.resources=next}) },
  replaceTitleResources(inputKey,newResources,metadata,catalog=[]){
    commitConfig((cfg)=>{
      cfg.resources=cfg.resources.filter((r)=>!(r.type==='titlePreset'&&r.inputKey===inputKey))
      cfg.resources.push(...newResources)
      cfg.titleSources=cfg.titleSources.filter((x)=>x.inputKey!==inputKey)
      cfg.titleSources.push({
        inputKey,
        inputLabelAtImport:store.getState().vmixState.inputByKey[inputKey]?.shortTitle||inputKey,
        csv:metadata,
        verificationMode:newResources.length && newResources.every((r)=>r.verification.mode==='verifiedFields')?'verifiedFields':'indexOnly',
        presets:catalog.map((p)=>({
          presetIndex:p.presetIndex,
          csvRow:p.csvRow || [],
          label:p.label,
          verification:p.verification || {mode:'indexOnly',fieldNames:[]},
          resourceId:p.resourceId || null,
        })),
      })
    })
    toast(`${newResources.length} Title presets selected.`, 'success')
  },
  exportConfig(){ downloadConfig(store.getState().config) },
  async importConfig(file){ try{const cfg=await readConfigFile(file);update((s)=>{s.config=cfg;persist(cfg);return s});toast('Configuration imported.','success')}catch(err){toast(err.message,'error',4500)} },
  sendResource,
}

function render(state) { state.mode==='control' ? renderControl(root,{state,actions}) : renderConfigure(root,{state,actions}) }
store.subscribe(render); render(store.getState())

if (new URLSearchParams(location.search).get('demo') === '1') toggleDemo()
