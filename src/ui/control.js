import { buildOnAirSet, getTitleSwapContext } from '../vmix/safety.js?v=0.3.2'
import { effectiveVerification, isResourceFullyVerifiable, resolveTitleResource, sameTitlePreset } from '../vmix/resolver.js?v=0.3.3'
import { resourceIcon, icon } from './icons.js?v=0.2.0'

const e = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
const appVersion = document.querySelector('meta[name="pibvmix-version"]')?.content || ''
let lastTitleDiagnosticsFingerprint = ''

// Local display preferences never enter the resource configuration or its exports.
const viewStorageKey = 'pibvmix:ui:control-view'
const viewOptions = {
  columns: { label: 'Colunas', values: { auto: 'Auto', 1: '1', 2: '2', 3: '3' } },
  size: { label: 'Tamanho', values: { compact: 'Compacto', normal: 'Normal', large: 'Grande' } },
  text: { label: 'Texto', values: { single: '1 linha', double: '2 linhas', full: 'Completo' } },
}
let viewPreferences = { columns: 'auto', size: 'normal', text: 'single' }
try {
  const saved = JSON.parse(localStorage.getItem(viewStorageKey))
  for (const key of Object.keys(viewOptions)) {
    if (Object.hasOwn(viewOptions[key].values, saved?.[key])) viewPreferences[key] = String(saved[key])
  }
} catch { /* Keep defaults when storage is unavailable or malformed. */ }

function viewControls() {
  return Object.entries(viewOptions).map(([key, option]) => `<div class="control-view-group" role="group" aria-label="${option.label}"><span>${option.label}</span><div class="segmented compact">${Object.entries(option.values).sort(([a], [b]) => a === 'auto' ? -1 : b === 'auto' ? 1 : 0).map(([value, label]) => `<button type="button" data-view-option="${key}" data-view-value="${value}" aria-pressed="${viewPreferences[key] === value}" class="${viewPreferences[key] === value ? 'active' : ''}">${label}</button>`).join('')}</div></div>`).join('')
}

function applyView(root) {
  const main = root.querySelector('.control-main')
  for (const [key, value] of Object.entries(viewPreferences)) main.dataset[key] = value
  root.querySelectorAll('[data-view-option]').forEach((button) => {
    const selected = viewPreferences[button.dataset.viewOption] === button.dataset.viewValue
    button.classList.toggle('active', selected)
    button.setAttribute('aria-pressed', String(selected))
  })
}

function logTitleDiagnostics(vmix, titleGroups, titleResolution, titleSwapContext, onAir) {
  if (!vmix) return
  const diagnostics = [...titleGroups].map(([key, group]) => {
    const input = vmix.inputByKey[key]
    const resolution = titleResolution.get(key)
    const swap = titleSwapContext.get(key)
    return {
      inputKey: key,
      input: input?.shortTitle || input?.title || key,
      program: vmix.mainMix?.programKey === key,
      preview: vmix.mainMix?.previewKey === key,
      onAir: onAir.has(key),
      fields: {
        text: Object.fromEntries((input?.text || []).map((field) => [field.name, field.value])),
        image: Object.fromEntries((input?.image || []).map((field) => [field.name, field.value])),
        color: Object.fromEntries((input?.color || []).map((field) => [field.name, field.value])),
      },
      resolution: {
        status: resolution?.status || 'none',
        currentId: resolution?.resource?.id || null,
        currentLabel: resolution?.resource?.label || null,
        currentPresetIndex: resolution?.resource?.presetIndex ?? null,
      },
      swap: swap || { eligible: false, reason: 'missing-state' },
      resources: group.map((resource) => ({
        id: resource.id,
        label: resource.label,
        presetIndex: resource.presetIndex,
        storedMode: resource.verification?.mode || null,
        effectiveVerification: effectiveVerification(input, resource),
        csvRow: resource.csvRow || [],
      })),
    }
  })
  const fingerprint = JSON.stringify(diagnostics)
  if (fingerprint === lastTitleDiagnosticsFingerprint) return
  lastTitleDiagnosticsFingerprint = fingerprint
  console.info('[PIBvMix][title-state]', diagnostics)
  for (const item of diagnostics) {
    if ((item.preview || item.onAir) && item.resolution.status !== 'exact') {
      console.warn('[PIBvMix][title-unresolved]', item)
    }
  }
}

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
  const titleSwapContext = new Map([...titleGroups].map(([key]) => [key, getTitleSwapContext(vmix, key)]))
  logTitleDiagnostics(vmix, titleGroups, titleResolution, titleSwapContext, onAir)
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
    <div class="brand"><span class="brand-mark">◆</span><strong>PIBvMix</strong>${appVersion ? `<small class="brand-version">v${e(appVersion)}</small>` : ''}</div>
    <div class="connection-chip ${e(state.connection.status)}"><span class="dot"></span>${e(state.connection.status === 'connected' ? (state.ui.demo ? 'Demo connected' : 'Connected') : state.connection.status)}</div>
    <div class="topbar-spacer"></div><button class="btn primary" data-action="configure" title="Return to resource setup. Your current palette is preserved.">← Edit resources</button>
  </header>
  <main class="control-main">
    <section class="control-tools" aria-label="Resource tools"><div class="control-find"><div class="search-row control-search"><span>${icon('search')}</span><input id="control-search" value="${e(state.ui.query)}" placeholder="Find a resource fast…"></div><div class="segmented compact">${['all','titles','video','image'].map((f)=>`<button data-filter="${f}" class="${filter===f?'active':''}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}</div></div><div class="control-view-options">${viewControls()}</div></section>
    ${!vmix ? `<div class="control-empty"><div class="spinner"></div><strong>${state.connection.status === 'disconnected' ? 'vMix disconnected' : 'Loading vMix state…'}</strong><span>Resource controls stay disabled until a valid live state is known.</span></div>` : `<section class="resource-grid">${visible.map((r) => card(r, vmix, onAir, state, titleResolution, titleSwapContext)).join('')}</section>`}
  </main>
  ${state.ui.toast ? `<div class="toast ${e(state.ui.toast.kind || '')}">${e(state.ui.toast.message)}</div>` : ''}`
  applyView(root)
  bind(root, ctx)
}

function card(r, vmix, onAir, state, titleResolution, titleSwapContext) {
  const input = vmix.inputByKey[r.inputKey]
  const missing = !input
  const offline = state.connection.status === 'disconnected'
  const busy = state.ui.busyInputKeys.includes(r.inputKey)
  const blocked = r.type === 'titlePreset' && onAir.has(r.inputKey)
  const resolution = r.type === 'titlePreset' ? titleResolution.get(r.inputKey) : null
  const isResolvedPreset = r.type === 'titlePreset' && resolution?.status === 'exact' && sameTitlePreset(resolution.resource, r)
  const isCurrent = blocked && isResolvedPreset
  const swapContext = r.type === 'titlePreset' ? titleSwapContext.get(r.inputKey) : null
  const currentVerifiable = resolution?.resource ? isResourceFullyVerifiable(input, resolution.resource) : false
  const targetVerifiable = r.type === 'titlePreset' ? isResourceFullyVerifiable(input, r) : false
  const canSwap = blocked && !offline && !busy && !isCurrent && swapContext?.eligible && resolution?.status === 'exact' && currentVerifiable && targetVerifiable
  let status = 'READY', cls = 'ready'
  if (missing) { status = 'UNAVAILABLE'; cls = 'unavailable' }
  else if (offline) { status = 'OFFLINE'; cls = 'unavailable' }
  else if (busy) { status = 'SENDING…'; cls = 'sending' }
  else if (blocked) { status = 'ON AIR'; cls = 'onair' }
  else if (vmix.mainMix.previewKey === r.inputKey) {
    if (r.type === 'titlePreset') {
      if (isResolvedPreset) { status = 'PREVIEW'; cls = 'preview' }
    } else { status = 'PREVIEW'; cls = 'preview' }
  }
  if (vmix.mainMix.programKey === r.inputKey && r.type !== 'titlePreset') { status = 'PROGRAM'; cls = 'program' }
  const typeName = r.type === 'titlePreset' ? 'Title' : input?.type || 'Input'
  const content = `<div class="resource-symbol">${resourceIcon(input?.type || (r.type==='titlePreset'?'title':''))}</div>
    <div class="resource-copy"><strong>${e(r.label)}</strong><span>${e(typeName)}${r.type==='titlePreset'?` · Preset ${r.presetIndex}`:''}</span></div>`

  if (blocked && !missing && !offline && !busy) {
    const swapTitle = swapContext?.reason === 'direct-program'
      ? 'Freeze the live Title render, load and verify this preset, then resume rendering.'
      : 'Transition the current Lower out, load this preset, verify it, then transition it back in.'
    const badges = `<div class="state-badges">${isCurrent ? '<span class="state-badge current">CURRENT</span>' : ''}${canSwap ? `<button class="state-badge swap" type="button" data-swap-resource="${e(r.id)}" title="${e(swapTitle)}">SWAP</button>` : ''}<span class="state-badge onair">ON AIR</span></div>`
    return `<article class="resource-card onair blocked-card" data-blocked-resource="${e(r.id)}">${content}${badges}</article>`
  }

  return `<button class="resource-card ${cls}" data-resource="${e(r.id)}" ${missing || offline || blocked || busy ? 'disabled':''}>
    ${content}<span class="state-badge ${cls}">${status}</span>
  </button>`
}

function bind(root, ctx) {
  root.querySelectorAll('[data-view-option]').forEach((button) => button.addEventListener('click', () => {
    viewPreferences[button.dataset.viewOption] = button.dataset.viewValue
    try { localStorage.setItem(viewStorageKey, JSON.stringify(viewPreferences)) } catch { /* Retain in memory for rerenders. */ }
    applyView(root)
  }))
  root.querySelector('[data-action="configure"]')?.addEventListener('click', ctx.actions.toConfigure)
  root.querySelector('#control-search')?.addEventListener('input', (ev) => ctx.actions.setQuery(ev.target.value))
  root.querySelectorAll('[data-filter]').forEach((x) => x.addEventListener('click', () => ctx.actions.setFilter(x.dataset.filter)))
  root.querySelectorAll('[data-resource]').forEach((x) => x.addEventListener('click', () => ctx.actions.sendResource(x.dataset.resource)))
  root.querySelectorAll('[data-swap-resource]').forEach((x) => x.addEventListener('click', (ev) => { ev.stopPropagation(); ctx.actions.swapResource(x.dataset.swapResource) }))
}
