import { buildOnAirSet } from '../vmix/safety.js?v=0.2.0'
import { resolveTitleResource } from '../vmix/resolver.js?v=0.2.0'
import { resourceIcon, icon } from './icons.js?v=0.2.0'

const e = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))

export function renderControl(root, ctx) {
  const { state, actions } = ctx
  const vmix = state.vmixState
  const resources = state.config.resources
  const onAir = vmix ? buildOnAirSet(vmix) : new Set()
  const titleGroups = new Map()
  for (const resource of resources) {
    if (resource.type !== 'titlePreset') continue
    if (!titleGroups.has(resource.inputKey)) titleGroups.set(resource.inputKey, [])
    titleGroups.get(resource.inputKey).push(resource)
  }
  const titleResolution = new Map([...titleGroups].map(([key, group]) => [key, resolveTitleResource(vmix?.inputByKey[key], group)]))
  const q = state.ui.query.toLowerCase()
  const filter = state.ui.filter
  const visible = resources.filter((r) => {
    const input = vmix?.inputByKey[r.inputKey]
    const type = input?.type || (r.type === 'titlePreset' ? 'title' : '')
    const match = !q || `${r.label} ${input?.shortTitle || ''} ${type}`.toLowerCase().includes(q)
    if (!match) return false
    if (filter === 'titles') return r.type === 'titlePreset'
    if (filter === 'video') return String(type).toLowerCase().includes('video')
    if (filter === 'image') return String(type).toLowerCase().includes('image')
    return true
  })

  root.innerHTML = `<header class="topbar control-topbar">
    <div class="brand"><span class="brand-mark">◆</span><strong>PIBvMix</strong></div>
    <div class="connection-chip ${e(state.connection.status)}"><span class="dot"></span>${e(state.connection.status === 'connected' ? (state.ui.demo ? 'Demo connected' : 'Connected') : state.connection.status)}</div>
    <div class="topbar-spacer"></div><button class="btn primary" data-action="configure" title="Return to resource setup. Your current palette is preserved.">← Edit resources</button>
  </header>
  <main class="control-main">
    <section class="control-tools"><div class="search-row control-search"><span>${icon('search')}</span><input id="control-search" value="${e(state.ui.query)}" placeholder="Find a resource fast…"></div><div class="segmented compact">${['all','titles','video','image'].map((f)=>`<button data-filter="${f}" class="${filter===f?'active':''}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}</div></section>
    ${!vmix ? `<div class="control-empty"><div class="spinner"></div><strong>${state.connection.status === 'disconnected' ? 'vMix disconnected' : 'Loading vMix state…'}</strong><span>Resource controls stay disabled until a valid live state is known.</span></div>` : `<section class="resource-grid">${visible.map((r) => card(r, vmix, onAir, state, titleResolution)).join('')}</section>`}
  </main>
  ${state.ui.toast ? `<div class="toast ${e(state.ui.toast.kind || '')}">${e(state.ui.toast.message)}</div>` : ''}`
  bind(root, ctx)
}

function card(r, vmix, onAir, state, titleResolution) {
  const input = vmix.inputByKey[r.inputKey]
  const missing = !input
  const offline = state.connection.status === 'disconnected'
  const busy = state.ui.busyInputKeys.includes(r.inputKey)
  const blocked = r.type === 'titlePreset' && onAir.has(r.inputKey)
  let status = 'READY', cls = 'ready'
  if (missing) { status = 'UNAVAILABLE'; cls = 'unavailable' }
  else if (offline) { status = 'OFFLINE'; cls = 'unavailable' }
  else if (busy) { status = 'SENDING…'; cls = 'sending' }
  else if (blocked) { status = 'ON AIR'; cls = 'onair' }
  else if (vmix.mainMix.previewKey === r.inputKey) {
    if (r.type === 'titlePreset') {
      const resolved = titleResolution.get(r.inputKey)
      if (resolved?.status === 'exact' && resolved.resource?.id === r.id) { status = 'PREVIEW'; cls = 'preview' }
    } else { status = 'PREVIEW'; cls = 'preview' }
  }
  if (vmix.mainMix.programKey === r.inputKey && r.type !== 'titlePreset') { status = 'PROGRAM'; cls = 'program' }
  const typeName = r.type === 'titlePreset' ? 'Title' : input?.type || 'Input'
  return `<button class="resource-card ${cls}" data-resource="${e(r.id)}" ${missing || offline || blocked || busy ? 'disabled':''}>
    <div class="resource-symbol">${resourceIcon(input?.type || (r.type==='titlePreset'?'title':''))}</div>
    <div class="resource-copy"><strong>${e(r.label)}</strong><span>${e(typeName)}${r.type==='titlePreset'?` · Preset ${r.presetIndex}`:''}</span></div>
    <span class="state-badge ${cls}">${status}</span>
  </button>`
}

function bind(root, ctx) {
  root.querySelector('[data-action="configure"]')?.addEventListener('click', ctx.actions.toConfigure)
  root.querySelector('#control-search')?.addEventListener('input', (ev) => ctx.actions.setQuery(ev.target.value))
  root.querySelectorAll('[data-filter]').forEach((x) => x.addEventListener('click', () => ctx.actions.setFilter(x.dataset.filter)))
  root.querySelectorAll('[data-resource]').forEach((x) => x.addEventListener('click', () => ctx.actions.sendResource(x.dataset.resource)))
}
