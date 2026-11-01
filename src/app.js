import { createStore, initialState } from './state/store.js?v=0.2.0'
import { VmixClient, normalizeTarget } from './vmix/client.js?v=0.2.0'
import { MockVmixClient } from './vmix/mock.js?v=0.3.2'
import { parseVmixXml } from './vmix/parser.js?v=0.2.0'
import { VmixPoller } from './vmix/poller.js?v=0.2.0'
import { buildOnAirSet, getTitleSwapContext } from './vmix/safety.js?v=0.3.2'
import { isResourceFullyVerifiable, resolveTitleResource, sameTitlePreset, verifyResourceFields } from './vmix/resolver.js?v=0.3.3'
import { loadConfig, saveConfig } from './config/storage.js?v=0.2.0'
import { downloadConfig, readConfigFile } from './config/backup.js?v=0.2.0'
import { renderConfigure } from './ui/configure.js?v=0.3.4'
import { renderControl } from './ui/control.js?v=0.3.8'

const saved = loadConfig()
const store = createStore({ ...initialState, config: saved || initialState.config })
let client = null
let poller = null
let demoBackup = null
let consecutivePollFailures = 0
const commandLocks = new Map()
const root = document.querySelector('#app')

function update(mutator){ store.update(mutator) }
function toast(message,kind='info',ms=2600){ update((s)=>{s.ui.toast={message,kind};return s}); setTimeout(()=>update((s)=>{s.ui.toast=null;return s}),ms) }
function setBusy(key,on){ update((s)=>{const set=new Set(s.ui.busyInputKeys);on?set.add(key):set.delete(key);s.ui.busyInputKeys=[...set];return s}) }
function logCommand(name, detail={}) { console.info(`[PIBvMix][command] ${name}`, detail) }

function persist(config){ try { saveConfig(config) } catch(err){ toast(`Could not save locally: ${err.message}`,'error',4200) } }
function commitConfig(mutator){ update((s)=>{const cfg=structuredClone(s.config);mutator(cfg);s.config=cfg;persist(cfg);return s}) }

async function applyXml(xml){
  const parsed=parseVmixXml(xml)
  update((s)=>{s.vmixState=parsed;s.connection.status='connected';s.connection.message='';s.connection.lastUpdated=Date.now();return s})
  return parsed
}

function pollError(err){
  consecutivePollFailures++
  update((s)=>{s.connection.status=consecutivePollFailures>=3?'disconnected':'degraded';s.connection.message=err.message||String(err);return s})
}

function makePoller(){
  poller?.stop()
  poller=new VmixPoller(()=>client.fetchState(),async(xml)=>{consecutivePollFailures=0;await applyXml(xml)},pollError,store.getState().mode==='control'?500:1100)
  poller.start()
}

async function connect(){
  const target=normalizeTarget(store.getState().config.vmix.target)
  update((s)=>{s.connection.status='connecting';s.connection.message='';s.config.vmix.target=target;persist(s.config);return s})
  client=new VmixClient(target)
  try{await applyXml(await client.fetchState());makePoller();toast('Connected to vMix.','success')}
  catch(err){client=null;pollError(err);toast(`Could not connect: ${err.message}`,'error',4300)}
}

function toggleDemo(){
  if(store.getState().ui.demo){
    poller?.stop();poller=null;client=null
    update((s)=>{s.ui.demo=false;s.vmixState=null;s.connection.status='idle';if(demoBackup)s.config=demoBackup;return s});demoBackup=null;return
  }
  demoBackup=structuredClone(store.getState().config)
  client=new MockVmixClient()
  update((s)=>{s.ui.demo=true;s.connection.status='connecting';s.config={schemaVersion:2,vmix:{target:'demo'},titleSources:client.getDemoTitleSources(),resources:client.getDemoResources()};return s})
  applyXml(client.modelToXml()).then(makePoller)
}

async function refresh(){ if(!client)return; try{await applyXml(await client.fetchState())}catch(err){pollError(err)} }

async function waitFor(predicate, timeout=1700, interval=75){
  const deadline=Date.now()+timeout
  let last=store.getState().vmixState
  while(Date.now()<deadline){
    try{last=await applyXml(await client.fetchState());if(predicate(last))return last}catch{}
    await new Promise((resolve)=>setTimeout(resolve,interval))
  }
  throw new Error('vMix did not confirm the requested state in time.')
}

function overlayInputKey(state, overlayNumber) { return state?.overlays?.find((overlay) => overlay.number === overlayNumber)?.inputKey || null }
const SWAP_TRANSITION_TIMEOUT_MS = 3200

async function tryRestoreSwappedLower(key, overlayNumber, originalResource) {
  try {
    if (originalResource) {
      logCommand('SWAP restore original preset', { inputKey:key, overlayNumber, presetIndex:originalResource.presetIndex, label:originalResource.label })
      await client.command('SelectTitlePreset',{Input:key,Value:originalResource.presetIndex})
      await waitFor((s)=>verifyResourceFields(s.inputByKey[key],originalResource),1800,75)
    }
    let state = await applyXml(await client.fetchState())
    if (overlayInputKey(state, overlayNumber) && overlayInputKey(state, overlayNumber) !== key) return false
    if (!overlayInputKey(state, overlayNumber)) {
      logCommand('SWAP restore overlay in', { inputKey:key, overlayNumber })
      await client.command(`OverlayInput${overlayNumber}In`,{Input:key})
      await waitFor((s)=>overlayInputKey(s,overlayNumber)===key,SWAP_TRANSITION_TIMEOUT_MS,75)
    }
    return true
  } catch (restoreErr) {
    console.error('[PIBvMix][command] SWAP restore failed', { inputKey:key, overlayNumber, error:restoreErr })
    return false
  }
}

async function tryRestoreProgramLower(key, originalResource, renderPaused) {
  try {
    if (originalResource) {
      logCommand('SWAP restore original Program preset', { inputKey:key, presetIndex:originalResource.presetIndex, label:originalResource.label })
      await client.command('SelectTitlePreset',{Input:key,Value:originalResource.presetIndex})
      await waitFor((s)=>verifyResourceFields(s.inputByKey[key],originalResource),1800,75)
    }
    if (renderPaused) {
      logCommand('SWAP restore ResumeRender', { inputKey:key })
      await client.command('ResumeRender',{Input:key})
    }
    return true
  } catch (restoreErr) {
    console.error('[PIBvMix][command] SWAP Program restore failed', { inputKey:key, error:restoreErr })
    return false
  }
}

async function swapResource(id) {
  const resource=store.getState().config.resources.find((r)=>r.id===id); if(!resource || !client || resource.type!=='titlePreset') return
  const key=resource.inputKey
  if (commandLocks.has(key)) return
  commandLocks.set(key,true)
  setBusy(key,true)
  let overlayNumber = null
  let lowerWasTakenOut = false
  let programRenderPaused = false
  let originalResource = null
  let swapStrategy = null
  try {
    let state=store.getState().vmixState
    if(!state || Date.now()-(store.getState().connection.lastUpdated||0)>650) state=await applyXml(await client.fetchState())
    const input=state.inputByKey[key]; if(!input) throw new Error('Resource is unavailable in the current vMix production.')
    if(!buildOnAirSet(state).has(key)) throw new Error('This Lower is no longer ON AIR.')

    const related = store.getState().config.resources.filter((r)=>r.type==='titlePreset'&&r.inputKey===key)
    const resolution=resolveTitleResource(input,related)
    if(resolution.status!=='exact' || !resolution.resource) throw new Error('The current preset could not be identified safely.')
    if(sameTitlePreset(resolution.resource,resource)) throw new Error('This preset is already CURRENT.')
    if(!isResourceFullyVerifiable(input,resolution.resource) || !isResourceFullyVerifiable(input,resource)) throw new Error('This Title cannot be verified safely enough for SWAP.')
    originalResource=resolution.resource

    const context=getTitleSwapContext(state,key)
    if(!context.eligible) throw new Error('This Lower is ON AIR, but its live path is not safe for an automatic SWAP.')
    swapStrategy=context.reason

    if(context.reason==='direct-program'){
      logCommand('SWAP Program PauseRender',{inputKey:key,presetIndex:resource.presetIndex,label:resource.label})
      await client.command('PauseRender',{Input:key})
      programRenderPaused=true
      state=await applyXml(await client.fetchState())
      if(state.mainMix.programKey!==key || !buildOnAirSet(state).has(key)) throw new Error('The Title left Program while preparing the swap.')
      logCommand('SWAP Program select target preset',{inputKey:key,presetIndex:resource.presetIndex,label:resource.label})
      await client.command('SelectTitlePreset',{Input:key,Value:resource.presetIndex})
      state=await waitFor((s)=>verifyResourceFields(s.inputByKey[key],resource),1800,75)
      if(state.mainMix.programKey!==key || !buildOnAirSet(state).has(key)) throw new Error('The Title left Program while loading the target preset.')
      logCommand('SWAP Program ResumeRender',{inputKey:key})
      await client.command('ResumeRender',{Input:key})
      programRenderPaused=false
      await waitFor((s)=>s.mainMix.programKey===key && verifyResourceFields(s.inputByKey[key],resource),SWAP_TRANSITION_TIMEOUT_MS,75)
      logCommand('SWAP Program complete',{inputKey:key,presetIndex:resource.presetIndex,label:resource.label})
      toast(`${resource.label} is CURRENT and ON AIR.`,'success')
      return
    }

    overlayNumber=context.overlayNumber
    if(overlayNumber===null) throw new Error('The live Overlay could not be identified safely.')
    logCommand('SWAP overlay out',{inputKey:key,overlayNumber})
    await client.command(`OverlayInput${overlayNumber}Out`)
    lowerWasTakenOut=true
    state=await waitFor((s)=>!overlayInputKey(s,overlayNumber) && !buildOnAirSet(s).has(key),SWAP_TRANSITION_TIMEOUT_MS,75)

    if(overlayInputKey(state,overlayNumber)) throw new Error('The Overlay did not become free.')
    logCommand('SWAP select target preset',{inputKey:key,overlayNumber,presetIndex:resource.presetIndex,label:resource.label})
    await client.command('SelectTitlePreset',{Input:key,Value:resource.presetIndex})
    state=await waitFor((s)=>verifyResourceFields(s.inputByKey[key],resource),1800,75)

    if(buildOnAirSet(state).has(key)) throw new Error('The Lower became ON AIR unexpectedly while preparing the swap.')
    if(overlayInputKey(state,overlayNumber)) throw new Error('The Overlay was occupied while preparing the swap.')

    state=await applyXml(await client.fetchState())
    if(!verifyResourceFields(state.inputByKey[key],resource)) throw new Error('The target preset changed before it could return ON AIR.')
    if(buildOnAirSet(state).has(key) || overlayInputKey(state,overlayNumber)) throw new Error('The vMix state changed before the Lower could return ON AIR.')

    logCommand('SWAP overlay in',{inputKey:key,overlayNumber})
    await client.command(`OverlayInput${overlayNumber}In`,{Input:key})
    await waitFor((s)=>overlayInputKey(s,overlayNumber)===key && verifyResourceFields(s.inputByKey[key],resource),SWAP_TRANSITION_TIMEOUT_MS,75)
    lowerWasTakenOut=false
    logCommand('SWAP complete',{inputKey:key,overlayNumber,presetIndex:resource.presetIndex,label:resource.label})
    toast(`${resource.label} is CURRENT and ON AIR.`,'success')
  } catch(err) {
    console.error('[PIBvMix][command] SWAP failed',{inputKey:key,target:resource.label,error:err})
    const restored=swapStrategy==='direct-program'&&originalResource
      ? await tryRestoreProgramLower(key,originalResource,programRenderPaused)
      : lowerWasTakenOut&&overlayNumber!==null&&originalResource
        ? await tryRestoreSwappedLower(key,overlayNumber,originalResource)
        : false
    const suffix=restored?' Previous Lower restored.':''
    toast(`${err.message || 'SWAP failed.'}${suffix}`,'error',5200)
  } finally {
    setBusy(key,false)
    commandLocks.delete(key)
  }
}

async function sendResource(id){
  const resource=store.getState().config.resources.find((r)=>r.id===id); if(!resource || !client) return
  const key=resource.inputKey
  if(commandLocks.has(key)) return
  commandLocks.set(key,true)
  setBusy(key,true)
  logCommand('sendResource start',{id,inputKey:key,type:resource.type,presetIndex:resource.presetIndex,label:resource.label})
  try{
    let state=store.getState().vmixState
    if(!state || Date.now()-(store.getState().connection.lastUpdated||0)>650) state=await applyXml(await client.fetchState())
    const input=state.inputByKey[key]; if(!input) throw new Error('Resource is unavailable in the current vMix production.')
    if(resource.type==='titlePreset'){
      if(buildOnAirSet(state).has(key)) throw new Error('This Lower is ON AIR and cannot be changed.')
      logCommand('SelectTitlePreset',{inputKey:key,presetIndex:resource.presetIndex,label:resource.label})
      await client.command('SelectTitlePreset',{Input:key,Value:resource.presetIndex})
      if(isResourceFullyVerifiable(input,resource)){
        state=await waitFor((s)=>verifyResourceFields(s.inputByKey[key],resource),1300,75)
      }else{
        state=await applyXml(await client.fetchState())
      }
      if(buildOnAirSet(state).has(key)) throw new Error('The Lower became ON AIR before Preview could be changed.')
    }
    logCommand('PreviewInput',{inputKey:key,label:resource.label})
    await client.command('PreviewInput',{Input:key,Mix:0})
    await waitFor((s)=>s.mainMix.previewKey===key)
    logCommand('sendResource complete',{inputKey:key,label:resource.label})
    toast(`${resource.label} is in Preview.`,'success')
  }catch(err){
    console.error('[PIBvMix][command] sendResource failed',{inputKey:key,label:resource.label,error:err})
    toast(err.message || 'Command failed.','error',4200)
  }finally{setBusy(key,false);commandLocks.delete(key)}
}

function setInputQuantity(key,value){
  const quantity=clampQuantity(value)
  commitConfig((cfg)=>{
    const existing=cfg.resources.filter((r)=>r.type==='input'&&r.inputKey===key)
    if(quantity<existing.length){
      const removeIds=new Set(existing.slice(quantity).map((r)=>r.id))
      cfg.resources=cfg.resources.filter((r)=>!removeIds.has(r.id))
      return
    }
    if(quantity<=existing.length)return
    const input=store.getState().vmixState?.inputByKey[key]
    if(!input)return
    const baseLabel=existing[0]?.label||input.shortTitle||input.title||key
    for(let i=existing.length;i<quantity;i++){
      cfg.resources.push({id:newId(),type:'input',label:baseLabel,inputKey:key})
    }
  })
}

const actions={
  connect,toggleDemo,refresh,
  toControl(){update((s)=>{s.mode='control';s.ui.query='';s.ui.filter='all';return s});if(poller){poller.interval=500}},
  toConfigure(){update((s)=>{s.mode='configure';s.ui.query='';s.ui.filter='all';return s});if(poller){poller.interval=1100}},
  setQuery(value){update((s)=>{s.ui.query=value;return s})},setFilter(value){update((s)=>{s.ui.filter=value;return s})},
  setInputQuantity,
  toggleInput(key,checked){setInputQuantity(key,checked?1:0)},
  removeResource(id){commitConfig((cfg)=>{cfg.resources=cfg.resources.filter((r)=>r.id!==id)})},
  renameResource(id,label){commitConfig((cfg)=>{const r=cfg.resources.find((x)=>x.id===id);if(r)r.label=label.trim()||r.label})},
  moveResource(id,delta){commitConfig((cfg)=>{const i=cfg.resources.findIndex((r)=>r.id===id);const j=Math.max(0,Math.min(cfg.resources.length-1,i+delta));if(i>=0&&i!==j){const [r]=cfg.resources.splice(i,1);cfg.resources.splice(j,0,r)}})},
  reorderByIds(ids){commitConfig((cfg)=>{const map=new Map(cfg.resources.map((r)=>[r.id,r]));const next=ids.map((x)=>map.get(x)).filter(Boolean);for(const r of cfg.resources)if(!ids.includes(r.id))next.push(r);cfg.resources=next})},
  replaceTitleResources(inputKey,newResources,metadata,catalog=[]){
    commitConfig((cfg)=>{
      cfg.resources=cfg.resources.filter((r)=>!(r.type==='titlePreset'&&r.inputKey===inputKey))
      cfg.resources.push(...newResources)
      cfg.titleSources=cfg.titleSources.filter((x)=>x.inputKey!==inputKey)
      cfg.titleSources.push({
        inputKey,
        inputLabelAtImport:store.getState().vmixState.inputByKey[inputKey]?.shortTitle||inputKey,
        csv:metadata,
        verificationMode:newResources.length&&newResources.every((r)=>r.verification.mode==='verifiedFields')?'verifiedFields':'indexOnly',
        presets:catalog.map((p)=>({
          presetIndex:p.presetIndex,
          csvRow:p.csvRow||[],
          label:p.label,
          verification:p.verification||{mode:'indexOnly',fieldNames:[]},
          quantity:Number.isFinite(Number(p.quantity))?Number(p.quantity):(p.selected?1:0),
          selected:Number.isFinite(Number(p.quantity))?Number(p.quantity)>0:Boolean(p.selected),
          resourceIds:p.resourceIds||(p.resourceId?[p.resourceId]:[]),
          resourceId:p.resourceId||p.resourceIds?.[0]||null,
        })),
      })
    })
    toast(`${newResources.length} Title occurrence${newResources.length===1?'':'s'} saved.`,'success')
  },
  exportConfig(){downloadConfig(store.getState().config)},
  async importConfig(file){try{const cfg=await readConfigFile(file);update((s)=>{s.config=cfg;persist(cfg);return s});toast('Configuration imported.','success')}catch(err){toast(err.message,'error',4500)}},
  sendResource,swapResource,
}

let lastRenderFingerprint=''
function renderFingerprint(state){
  const vmix=state.vmixState
  return JSON.stringify({
    mode:state.mode,
    connection:{status:state.connection.status,message:state.connection.message},
    config:state.config,
    ui:{query:state.ui.query,filter:state.ui.filter,demo:state.ui.demo,busyInputKeys:state.ui.busyInputKeys,toast:state.ui.toast},
    vmix:vmix?{
      version:vmix.version,presetName:vmix.presetName,mainMix:vmix.mainMix,overlays:vmix.overlays,additionalMixes:vmix.additionalMixes,
      inputs:vmix.inputs.map((input)=>({
        key:input.key,number:input.number,type:input.type,title:input.title,shortTitle:input.shortTitle,
        text:input.text,image:input.image,color:input.color,layers:input.layers,
      })),
    }:null,
  })
}

function render(state){
  if(state.mode==='configure'&&root.querySelector('.modal-backdrop')){
    queueMicrotask(()=>{if(!root.querySelector('.modal-backdrop'))render(store.getState())})
    return
  }
  const fingerprint=renderFingerprint(state)
  if(fingerprint===lastRenderFingerprint)return
  lastRenderFingerprint=fingerprint
  state.mode==='control'?renderControl(root,{state,actions}):renderConfigure(root,{state,actions})
}
store.subscribe(render);render(store.getState())

if(new URLSearchParams(location.search).get('demo')==='1')toggleDemo()
