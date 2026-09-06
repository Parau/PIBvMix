import { createStore, initialState } from './state/store.js?v=0.2.0'
import { VmixClient, normalizeTarget } from './vmix/client.js?v=0.2.0'
import { MockVmixClient } from './vmix/mock.js?v=0.3.2'
import { parseVmixXml } from './vmix/parser.js?v=0.2.0'
import { VmixPoller } from './vmix/poller.js?v=0.2.0'
import { buildOnAirSet, getTitleSwapContext } from './vmix/safety.js?v=0.3.2'
import { isResourceFullyVerifiable, resolveTitleResource, sameTitlePreset, verifyResourceFields } from './vmix/resolver.js?v=0.3.3'
import { loadConfig, saveConfig } from './config/storage.js?v=0.2.0'
import { downloadConfig, readConfigFile } from './config/backup.js?v=0.2.0'
import { renderConfigure } from './ui/configure.js?v=0.3.3'
import { renderControl } from './ui/control.js?v=0.3.3'

const saved = loadConfig()
const store = createStore({ ...initialState, config: saved || initialState.config })
let client = null
let poller = null
let demoBackup = null
let consecutivePollFailures = 0
const commandLocks = new Map()
const root = document.querySelector('#app')
const newId = () => crypto.randomUUID?.() || `r-${Date.now()}-${Math.random().toString(16).slice(2)}`
const SWAP_TRANSITION_TIMEOUT_MS = 5000

function logCommand(event, details = {}) { console.info(`[PIBvMix][command] ${event}`, details) }
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
  consecutivePollFailures = 0
  update((s) => {
    s.vmixState = parsed
    s.connection.status = 'connected'; s.connection.message = ''; s.connection.lastUpdated = Date.now()
    if (parsed.presetName) s.config.vmix.lastPresetName = parsed.presetName
    return s
  })
  return parsed
}

function onPollError(err) {
  consecutivePollFailures += 1
  update((s) => {
    s.connection.status = s.vmixState && consecutivePollFailures === 1 ? 'degraded' : 'disconnected'
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
  poller?.stop()
  if (store.getState().ui.demo) {
    update((s) => { s.ui.demo = false; if (demoBackup) s.config = demoBackup; return s })
    demoBackup = null
  }
  consecutivePollFailures = 0
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
  const by = current.vmixState.inputByKey
  const lower = by['lower-people']
  const peopleCatalog = [
    ['John Smith',0,['John Smith','@johnsmith']],
    ['Maria Silva',1,['Maria Silva','@mariasilva']],
    ['David Lee',2,['David Lee','@davidlee']],
    ['Ana Costa',3,['Ana Costa','@anacosta']],
  ].map(([label,presetIndex,csvRow]) => ({ label, presetIndex, csvRow, verification:{mode:'verifiedFields',fieldNames:['Name.Text','Instagram.Text']}, selected:true, quantity:1, resourceId:newId() }))
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

function overlayInputKey(state, overlayNumber) {
  return state.overlays?.find((overlay) => overlay.number === overlayNumber && !overlay.preview)?.inputKey || null
}

async function tryRestoreSwappedLower(inputKey, overlayNumber, originalResource) {
  if (!originalResource) return false
  try {
    let state = await applyXml(await client.fetchState())
    const input = state.inputByKey[inputKey]
    if (!isResourceFullyVerifiable(input, originalResource)) return false
    if (overlayInputKey(state, overlayNumber) || buildOnAirSet(state).has(inputKey)) return false
    logCommand('SWAP rollback select preset', { inputKey, overlayNumber, presetIndex: originalResource.presetIndex, label: originalResource.label })
    await client.command('SelectTitlePreset', { Input: inputKey, Value: originalResource.presetIndex })
    state = await waitFor((s) => verifyResourceFields(s.inputByKey[inputKey], originalResource), 1800, 75)
    if (overlayInputKey(state, overlayNumber) || buildOnAirSet(state).has(inputKey)) return false
    logCommand('SWAP rollback overlay in', { inputKey, overlayNumber })
    await client.command(`OverlayInput${overlayNumber}In`, { Input: inputKey })
    await waitFor((s) => overlayInputKey(s, overlayNumber) === inputKey && verifyResourceFields(s.inputByKey[inputKey], originalResource), SWAP_TRANSITION_TIMEOUT_MS, 75)
    return true
  } catch (err) {
    console.error('[PIBvMix][command] SWAP rollback failed', err)
    return false
  }
}

async function tryRestoreProgramLower(inputKey, originalResource, renderAlreadyPaused) {
  if (!originalResource) return false
  let renderPaused = renderAlreadyPaused
  try {
    let state = await applyXml(await client.fetchState())
    if (state.mainMix?.programKey !== inputKey) return false
    if (!renderPaused) {
      logCommand('SWAP program rollback pause render', { inputKey })
      await client.command('PauseRender', { Input: inputKey })
      renderPaused = true
    }
    logCommand('SWAP program rollback select preset', { inputKey, presetIndex: originalResource.presetIndex, label: originalResource.label })
    await client.command('SelectTitlePreset', { Input: inputKey, Value: originalResource.presetIndex })
    state = await waitFor((s) => s.mainMix?.programKey === inputKey && verifyResourceFields(s.inputByKey[inputKey], originalResource), 1800, 75)
    logCommand('SWAP program rollback resume render', { inputKey })
    await client.command('ResumeRender', { Input: inputKey })
    renderPaused = false
    await waitFor((s) => s.mainMix?.programKey === inputKey && verifyResourceFields(s.inputByKey[inputKey], originalResource), 1800, 75)
    return true
  } catch (err) {
    console.error('[PIBvMix][command] SWAP program rollback failed', err)
    return false
  } finally {
    if (renderPaused) {
      try { await client.command('ResumeRender', { Input: inputKey }) }
      catch (err) { console.error('[PIBvMix][command] SWAP program emergency resume failed', err) }
    }
  }
}

async function swapResource(id) {
  const resource = store.getState().config.resources.find((r) => r.id === id)
  if (!resource || resource.type !== 'titlePreset' || !client) return
  const key = resource.inputKey
  if (commandLocks.has(key)) return
  commandLocks.set(key, true)
  setBusy(key, true)
  let originalResource = null
  let overlayNumber = null
  let lowerWasTakenOut = false
  let programRenderPaused = false
  let swapStrategy = null
  logCommand('SWAP start', { id, inputKey:key, presetIndex:resource.presetIndex, label:resource.label })
  try {
    let state = await applyXml(await client.fetchState())
    const input = state.inputByKey[key]
    if (!input) throw new Error('Resource is unavailable in the current vMix production.')

    const group = store.getState().config.resources.filter((r) => r.type === 'titlePreset' && r.inputKey === key)
    const resolution = resolveTitleResource(input, group)
    logCommand('SWAP current resolution', { inputKey:key, status:resolution.status, current:resolution.resource?.label || null })
    if (resolution.status !== 'exact' || !resolution.resource) throw new Error('The current Lower preset cannot be identified safely.')
    originalResource = resolution.resource
    if (sameTitlePreset(originalResource, resource)) return toast(`${resource.label} is already CURRENT.`, 'info')
    if (!isResourceFullyVerifiable(input, originalResource) || !isResourceFullyVerifiable(input, resource)) {
      throw new Error('SWAP requires all Title fields for both current and target presets to be verifiable.')
    }

    const context = getTitleSwapContext(state, key)
    logCommand('SWAP context', { inputKey:key, ...context })
    if (!context.eligible) throw new Error(`This Lower cannot be swapped safely (${context.reason}).`)
    overlayNumber = context.overlayNumber
    swapStrategy = context.reason

    if (swapStrategy === 'direct-program') {
      logCommand('SWAP program pause render', { inputKey:key })
      await client.command('PauseRender', { Input: key })
      programRenderPaused = true
      state = await applyXml(await client.fetchState())
      if (state.mainMix?.programKey !== key) throw new Error('Program changed before the preset could be selected.')

      logCommand('SWAP program select target preset', { inputKey:key, presetIndex:resource.presetIndex, label:resource.label })
      await client.command('SelectTitlePreset', { Input: key, Value: resource.presetIndex })
      state = await waitFor((s) => s.mainMix?.programKey === key && verifyResourceFields(s.inputByKey[key], resource), 1800, 75)

      logCommand('SWAP program resume render', { inputKey:key })
      await client.command('ResumeRender', { Input: key })
      programRenderPaused = false
      await waitFor((s) => s.mainMix?.programKey === key && verifyResourceFields(s.inputByKey[key], resource), 1800, 75)
      logCommand('SWAP complete', { inputKey:key, strategy:swapStrategy, presetIndex:resource.presetIndex, label:resource.label })
      return toast(`${resource.label} is CURRENT and ON AIR.`, 'success')
    }

    logCommand('SWAP overlay out', { inputKey:key, overlayNumber })
    await client.command(`OverlayInput${overlayNumber}Out`)
    lowerWasTakenOut = true
    state = await waitFor((s) => !overlayInputKey(s, overlayNumber) && !buildOnAirSet(s).has(key), SWAP_TRANSITION_TIMEOUT_MS, 75)

    if (overlayInputKey(state, overlayNumber)) throw new Error('The Overlay did not become free.')
    logCommand('SWAP select target preset', { inputKey:key, overlayNumber, presetIndex:resource.presetIndex, label:resource.label })
    await client.command('SelectTitlePreset', { Input: key, Value: resource.presetIndex })
    state = await waitFor((s) => verifyResourceFields(s.inputByKey[key], resource), 1800, 75)

    if (buildOnAirSet(state).has(key)) throw new Error('The Lower became ON AIR unexpectedly while preparing the swap.')
    if (overlayInputKey(state, overlayNumber)) throw new Error('The Overlay was occupied while preparing the swap.')

    state = await applyXml(await client.fetchState())
    if (!verifyResourceFields(state.inputByKey[key], resource)) throw new Error('The target preset changed before it could return ON AIR.')
    if (buildOnAirSet(state).has(key) || overlayInputKey(state, overlayNumber)) throw new Error('The vMix state changed before the Lower could return ON AIR.')

    logCommand('SWAP overlay in', { inputKey:key, overlayNumber })
    await client.command(`OverlayInput${overlayNumber}In`, { Input: key })
    await waitFor((s) => overlayInputKey(s, overlayNumber) === key && verifyResourceFields(s.inputByKey[key], resource), SWAP_TRANSITION_TIMEOUT_MS, 75)
    lowerWasTakenOut = false
    logCommand('SWAP complete', { inputKey:key, overlayNumber, presetIndex:resource.presetIndex, label:resource.label })
    toast(`${resource.label} is CURRENT and ON AIR.`, 'success')
  } catch (err) {
    console.error('[PIBvMix][command] SWAP failed', { inputKey:key, target:resource.label, error:err })
    const restored = swapStrategy === 'direct-program' && originalResource
      ? await tryRestoreProgramLower(key, originalResource, programRenderPaused)
      : lowerWasTakenOut && overlayNumber !== null && originalResource
        ? await tryRestoreSwappedLower(key, overlayNumber, originalResource)
        : false
    const suffix = restored ? ' Previous Lower restored.' : ''
    toast(`${err.message || 'SWAP failed.'}${suffix}`, 'error', 5200)
  } finally {
    setBusy(key, false)
    commandLocks.delete(key)
  }
}

async function sendResource(id) {
  const resource=store.getState().config.resources.find((r)=>r.id===id); if(!resource || !client) return
  const key=resource.inputKey
  if (commandLocks.has(key)) return
  commandLocks.set(key, true)
  setBusy(key,true)
  logCommand('sendResource start', { id, inputKey:key, type:resource.type, presetIndex:resource.presetIndex, label:resource.label })
  try {
    let state = store.getState().vmixState
    if (!state || Date.now()-(store.getState().connection.lastUpdated||0)>650) state = await applyXml(await client.fetchState())
    const input=state.inputByKey[key]; if(!input) throw new Error('Resource is unavailable in the current vMix production.')
    if(resource.type==='titlePreset'){
      if(buildOnAirSet(state).has(key)) throw new Error('This Lower is ON AIR and cannot be changed.')
      logCommand('SelectTitlePreset', { inputKey:key, presetIndex:resource.presetIndex, label:resource.label })
      await client.command('SelectTitlePreset',{Input:key,Value:resource.presetIndex})
      if(isResourceFullyVerifiable(input, resource)) {
        state = await waitFor((s)=>verifyResourceFields(s.inputByKey[key],resource),1300,75)
      } else {
        state = await applyXml(await client.fetchState())
      }
      if(buildOnAirSet(state).has(key)) throw new Error('The Lower became ON AIR before Preview could be changed.')
    }
    logCommand('PreviewInput', { inputKey:key, label:resource.label })
    await client.command('PreviewInput',{Input:key,Mix:0})
    await waitFor((s)=>s.mainMix.previewKey===key)
    logCommand('sendResource complete', { inputKey:key, label:resource.label })
    toast(`${resource.label} is in Preview.`, 'success')
  } catch(err){
    console.error('[PIBvMix][command] sendResource failed', { inputKey:key, label:resource.label, error:err })
    toast(err.message || 'Command failed.', 'error', 4200)
  }
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
          quantity:Number.isFinite(Number(p.quantity)) ? Number(p.quantity) : (p.selected ? 1 : 0),
          selected:Number.isFinite(Number(p.quantity)) ? Number(p.quantity) > 0 : Boolean(p.selected),
          resourceIds:p.resourceIds || (p.resourceId ? [p.resourceId] : []),
          resourceId:p.resourceId || p.resourceIds?.[0] || null,
        })),
      })
    })
    toast(`${newResources.length} Title occurrence${newResources.length === 1 ? '' : 's'} saved.`, 'success')
  },
  exportConfig(){ downloadConfig(store.getState().config) },
  async importConfig(file){ try{const cfg=await readConfigFile(file);update((s)=>{s.config=cfg;persist(cfg);return s});toast('Configuration imported.','success')}catch(err){toast(err.message,'error',4500)} },
  sendResource, swapResource,
}

let lastRenderFingerprint = ''
function renderFingerprint(state) {
  const vmix = state.vmixState
  return JSON.stringify({
    mode: state.mode,
    connection: { status: state.connection.status, message: state.connection.message },
    config: state.config,
    ui: { query: state.ui.query, filter: state.ui.filter, demo: state.ui.demo, busyInputKeys: state.ui.busyInputKeys, toast: state.ui.toast },
    vmix: vmix ? {
      version: vmix.version, presetName: vmix.presetName, mainMix: vmix.mainMix, overlays: vmix.overlays, additionalMixes: vmix.additionalMixes,
      inputs: vmix.inputs.map((input) => ({
        key: input.key, number: input.number, type: input.type, title: input.title, shortTitle: input.shortTitle,
        text: input.text, image: input.image, color: input.color, layers: input.layers,
      })),
    } : null,
  })
}

function render(state) {
  if (state.mode === 'configure' && root.querySelector('.modal-backdrop')) {
    queueMicrotask(() => { if (!root.querySelector('.modal-backdrop')) render(store.getState()) })
    return
  }
  const fingerprint = renderFingerprint(state)
  if (fingerprint === lastRenderFingerprint) return
  lastRenderFingerprint = fingerprint
  state.mode==='control' ? renderControl(root,{state,actions}) : renderConfigure(root,{state,actions})
}
store.subscribe(render); render(store.getState())

if (new URLSearchParams(location.search).get('demo') === '1') toggleDemo()
