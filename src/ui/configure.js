import { isTitleCandidate } from '../vmix/safety.js'
import { parseCsv, labelForRow, sha256 } from '../config/csv.js'
import { resourceIcon, icon } from './icons.js'

const e = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
const id = () => crypto.randomUUID?.() || `r-${Date.now()}-${Math.random()}`

export function renderConfigure(root, ctx) {
  const { state, actions } = ctx
  const vmix = state.vmixState
  const resources = state.config.resources
  const selectedKeys = new Set(resources.filter((r) => r.type === 'input').map((r) => r.inputKey))
  const query = state.ui.query.toLowerCase()
  const filter = state.ui.filter
  const inputs = (vmix?.inputs || []).filter((input) => {
    const title = isTitleCandidate(input)
    const match = !query || `${input.title} ${input.shortTitle} ${input.number}`.toLowerCase().includes(query)
    if (!match) return false
    if (filter === 'titles') return title
    if (filter === 'other') return !title
    if (filter === 'selected') return resources.some((r) => r.inputKey === input.key) || state.config.titleSources.some((s) => s.inputKey === input.key)
    if (filter === 'unavailable') return false
    return true
  })
  const unavailable = resources.filter((r) => vmix && !vmix.inputByKey[r.inputKey])

  root.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">◆</span><strong>PIBvMix</strong></div>
    <div class="connection-chip ${e(state.connection.status)}"><span class="dot"></span>${e(state.connection.status === 'connected' ? (state.ui.demo ? 'Demo connected' : 'Connected') : state.connection.status)}</div>
    <div class="topbar-spacer"></div>
    <button class="btn ghost" data-action="control">Control</button>
  </header>
  <main class="configure-layout">
    <section class="hero-strip">
      <div><p class="eyebrow">RESOURCE SETUP</p><h1>Build your live resource palette</h1><p>Choose vMix inputs and turn each Lower preset into a fast, independent resource.</p></div>
      <div class="connection-box">
        <label>vMix address</label><div class="input-row"><input id="vmix-target" value="${e(state.config.vmix.target || '')}" placeholder="192.168.1.50:8088"><button class="btn primary" data-action="connect">${state.connection.status === 'connecting' ? 'Connecting…' : 'Connect'}</button></div>
        <div class="connection-actions"><button class="link-btn" data-action="demo">${state.ui.demo ? 'Leave Demo mode' : 'Use Demo mode'}</button><button class="link-btn" data-action="refresh">Refresh inputs</button></div>
        ${state.connection.message ? `<p class="inline-message">${e(state.connection.message)}</p>` : ''}
        <details class="connection-help"><summary>Connection checklist</summary><div>vMix Web Controller enabled · LAN-only enabled · Enhanced Web/TCP API security disabled · blank Web Controller password for v1 · allow Local Network Access in Chrome/Edge.</div></details>
      </div>
    </section>

    <section class="config-grid">
      <div class="panel inputs-panel">
        <div class="panel-head"><div><p class="eyebrow">AVAILABLE INPUTS</p><h2>${vmix ? e(vmix.presetName || 'Current production') : 'Connect to vMix'}</h2></div><span class="count">${vmix?.inputs.length || 0}</span></div>
        <div class="search-row"><span>${icon('search')}</span><input id="resource-search" value="${e(state.ui.query)}" placeholder="Search inputs…"></div>
        <div class="segmented">${['all','titles','other','selected','unavailable'].map((f) => `<button data-filter="${f}" class="${filter===f?'active':''}">${f === 'other' ? 'Other' : f[0].toUpperCase()+f.slice(1)}</button>`).join('')}</div>
        <div class="input-list">
          ${!vmix ? `<div class="empty"><strong>Connect or start Demo mode</strong><span>PIBvMix will read the resources from the production currently open in vMix.</span></div>` : inputs.map((input) => {
            const title = isTitleCandidate(input)
            const hasResources = resources.some((r) => r.inputKey === input.key)
            const hasPresetCatalog = title && state.config.titleSources.some((s) => s.inputKey === input.key)
            const configured = hasResources || hasPresetCatalog
            return `<article class="input-item ${configured?'selected':''}">
              <div class="type-icon">${resourceIcon(input.type)}</div><div class="input-copy"><strong>${e(input.shortTitle || input.title)}</strong><span>#${input.number} · ${e(input.type)}${title ? ' · Title/Lower' : ''}</span></div>
              ${title ? `<button class="btn mini ${configured?'accent':''}" data-import-title="${e(input.key)}">${configured ? 'Presets' : 'Import CSV'}</button>` : `<label class="select-box"><input type="checkbox" data-select-input="${e(input.key)}" ${selectedKeys.has(input.key)?'checked':''}><span></span></label>`}
            </article>`
          }).join('')}
          ${filter === 'unavailable' && unavailable.length ? unavailable.map((r)=>`<article class="input-item unavailable"><div class="type-icon">!</div><div class="input-copy"><strong>${e(r.label)}</strong><span>Missing GUID ${e(r.inputKey)}</span></div></article>`).join('') : ''}
        </div>
      </div>

      <div class="panel selected-panel">
        <div class="panel-head"><div><p class="eyebrow">CONTROL PALETTE</p><h2>Selected resources</h2><p>Arrange the exact order you want during the broadcast.</p></div><span class="count">${resources.length}</span></div>
        <div class="selected-list" id="selected-list">
          ${resources.length ? resources.map((r) => {
            const input = vmix?.inputByKey[r.inputKey]; const missing = vmix && !input
            return `<article class="selected-item ${missing?'unavailable':''}" draggable="true" data-resource-id="${e(r.id)}">
              <span class="drag">${icon('grip')}</span><div class="type-icon small">${resourceIcon(input?.type || (r.type==='titlePreset'?'title':''))}</div>
              <div class="selected-copy"><input value="${e(r.label)}" data-rename="${e(r.id)}"><span>${r.type === 'titlePreset' ? `${e(input?.shortTitle || 'Title')} · Preset ${r.presetIndex}` : e(input?.shortTitle || input?.title || 'Unavailable input')}${missing?' · UNAVAILABLE':''}</span></div>
              <div class="move-actions"><button title="Move up" data-move-up="${e(r.id)}">${icon('up')}</button><button title="Move down" data-move-down="${e(r.id)}">${icon('down')}</button><button title="Remove" data-remove="${e(r.id)}">${icon('close')}</button></div>
            </article>`
          }).join('') : `<div class="empty"><strong>Your Control palette is empty</strong><span>Select normal inputs or import a Title Preset CSV.</span></div>`}
        </div>
        <div class="panel-footer"><div class="backup-actions"><button class="btn ghost" data-action="export">${icon('download')} Export</button><label class="btn ghost file-label">${icon('upload')} Import<input type="file" id="config-import" accept="application/json" hidden></label></div><button class="btn primary large" data-action="control" ${resources.length?'':'disabled'}>Go to Control →</button></div>
      </div>
    </section>
  </main><div id="modal-root"></div>`

  bindConfigure(root, ctx)
}

function bindConfigure(root, ctx) {
  const { state, actions } = ctx
  root.querySelector('[data-action="connect"]')?.addEventListener('click', () => actions.connect(root.querySelector('#vmix-target').value))
  root.querySelector('[data-action="demo"]')?.addEventListener('click', actions.toggleDemo)
  root.querySelector('[data-action="refresh"]')?.addEventListener('click', actions.refresh)
  root.querySelectorAll('[data-action="control"]').forEach((x) => x.addEventListener('click', actions.toControl))
  root.querySelector('[data-action="export"]')?.addEventListener('click', actions.exportConfig)
  root.querySelector('#config-import')?.addEventListener('change', (ev) => ev.target.files[0] && actions.importConfig(ev.target.files[0]))
  root.querySelector('#resource-search')?.addEventListener('input', (ev) => actions.setQuery(ev.target.value))
  root.querySelectorAll('[data-filter]').forEach((x) => x.addEventListener('click', () => actions.setFilter(x.dataset.filter)))
  root.querySelectorAll('[data-select-input]').forEach((x) => x.addEventListener('change', () => actions.toggleInput(x.dataset.selectInput, x.checked)))
  root.querySelectorAll('[data-import-title]').forEach((x) => x.addEventListener('click', () => showCsvDialog(root.querySelector('#modal-root'), state.vmixState.inputByKey[x.dataset.importTitle], ctx)))
  root.querySelectorAll('[data-remove]').forEach((x) => x.addEventListener('click', () => actions.removeResource(x.dataset.remove)))
  root.querySelectorAll('[data-move-up]').forEach((x) => x.addEventListener('click', () => actions.moveResource(x.dataset.moveUp, -1)))
  root.querySelectorAll('[data-move-down]').forEach((x) => x.addEventListener('click', () => actions.moveResource(x.dataset.moveDown, 1)))
  root.querySelectorAll('[data-rename]').forEach((x) => x.addEventListener('change', () => actions.renameResource(x.dataset.rename, x.value)))
  bindDrag(root.querySelector('#selected-list'), actions.reorderByIds)
}

function bindDrag(list, apply) {
  if (!list) return
  let dragged = null
  list.querySelectorAll('[draggable="true"]').forEach((item) => {
    item.addEventListener('dragstart', () => { dragged = item.dataset.resourceId; item.classList.add('dragging') })
    item.addEventListener('dragend', () => { item.classList.remove('dragging'); dragged = null; apply([...list.querySelectorAll('[data-resource-id]')].map((x) => x.dataset.resourceId)) })
    item.addEventListener('dragover', (ev) => { ev.preventDefault(); const target = ev.currentTarget; if (!dragged || target.dataset.resourceId === dragged) return; const source = list.querySelector(`[data-resource-id="${CSS.escape(dragged)}"]`); const box = target.getBoundingClientRect(); list.insertBefore(source, ev.clientY < box.top + box.height/2 ? target : target.nextSibling) })
  })
}

function fieldNamesFor(input, catalog) {
  const detected = (input.text || []).map((field) => field.name).filter(Boolean)
  const catalogNames = catalog.find((p) => p.verification?.fieldNames?.length)?.verification.fieldNames || []
  return detected.length ? detected : catalogNames
}

function renderFieldMapping(fieldNames, maxColumns) {
  if (!maxColumns) return ''
  const labels = Array.from({ length: maxColumns }, (_, i) => fieldNames[i] || `CSV column ${i + 1}`)
  return `<div class="csv-summary"><strong>Fields detected from vMix</strong><span>${labels.map((name, i) => `${i + 1}. ${e(name)} ← CSV ${i + 1}`).join(' · ')}</span></div>`
}

function renderPresetValues(p, fieldNames) {
  const row = p.csvRow || []
  if (!row.length) return `Preset ${p.presetIndex}`
  const names = p.verification?.fieldNames?.length ? p.verification.fieldNames : fieldNames
  return row.map((value, i) => `${e(names[i] || `CSV column ${i + 1}`)}: ${e(value)}`).join(' · ')
}

async function showCsvDialog(host, input, ctx) {
  const source = ctx.state.config.titleSources.find((x) => x.inputKey === input.key)
  const existingResources = ctx.state.config.resources.filter((r) => r.type === 'titlePreset' && r.inputKey === input.key)
  const existingByIndex = new Map(existingResources.map((r) => [r.presetIndex, r]))

  let metadata = source?.csv || null
  let catalog = source?.presets?.length
    ? source.presets.map((p) => ({ ...p, selected: existingByIndex.has(p.presetIndex), resourceId: existingByIndex.get(p.presetIndex)?.id || p.resourceId || null, label: existingByIndex.get(p.presetIndex)?.label || p.label }))
    : existingResources.map((r) => ({ presetIndex: r.presetIndex, csvRow: r.csvRow || [], label: r.label, verification: r.verification || { mode: 'indexOnly', fieldNames: [] }, selected: true, resourceId: r.id }))

  host.innerHTML = `<div class="modal-backdrop"><div class="modal"><button class="modal-close">×</button><p class="eyebrow">TITLE PRESETS</p><h2>${e(input.shortTitle || input.title)}</h2><p>vMix provides the field names for this Lower. The CSV provides each preset's values in the same order. Choose which presets appear in Control and give each button a short name.</p><div id="preset-manager"></div><details class="preset-import" ${catalog.length ? '' : 'open'}><summary>${catalog.length ? 'Import / re-sync CSV' : 'Import Title Preset CSV'}</summary><label class="drop-file"><span>${icon('upload')}</span><strong>Choose Title Preset CSV</strong><small>The file is read locally and never uploaded.</small><input type="file" accept=".csv,text/csv" hidden></label></details><div id="csv-error"></div></div></div>`

  host.querySelector('.modal-close').onclick = () => host.innerHTML = ''
  const dropFile = host.querySelector('.drop-file')
  dropFile.onclick = (ev) => { if (ev.target.tagName !== 'INPUT') dropFile.querySelector('input').click() }

  const renderCatalog = () => {
    const manager = host.querySelector('#preset-manager')
    if (!catalog.length) {
      const detected = (input.text || []).map((field) => field.name).filter(Boolean)
      manager.innerHTML = `${detected.length ? renderFieldMapping(detected, detected.length) : ''}<div class="empty"><strong>No presets imported yet</strong><span>Choose the CSV exported from this vMix Title to load the people/titles.</span></div>`
      return
    }

    const fieldNames = fieldNamesFor(input, catalog)
    const maxColumns = Math.max(0, ...catalog.map((p) => (p.csvRow || []).length))
    manager.innerHTML = `${renderFieldMapping(fieldNames, maxColumns)}<div class="csv-summary"><strong>${catalog.length} presets available</strong><span>${e(metadata?.fileName || 'Current configuration')}</span></div><div class="csv-rows">${catalog.map((p, i) => `<div class="csv-row preset-edit-row"><input type="checkbox" data-preset-selected="${i}" ${p.selected ? 'checked' : ''}><span class="preset-index">${p.presetIndex}</span><div class="preset-edit-copy"><small>${renderPresetValues(p, fieldNames)}</small><label><small>Control button name</small><input class="preset-name-input" data-preset-label="${i}" value="${e(p.label || labelForRow(p.csvRow || [], p.presetIndex))}" aria-label="Control button name for preset ${p.presetIndex}"></label></div></div>`).join('')}</div><div class="modal-actions"><button class="btn ghost" id="select-all">Select all</button><button class="btn ghost" id="select-none">Select none</button><button class="btn primary" id="apply-presets">Save presets</button></div>`

    manager.querySelector('#select-all').onclick = () => manager.querySelectorAll('[data-preset-selected]').forEach((x) => x.checked = true)
    manager.querySelector('#select-none').onclick = () => manager.querySelectorAll('[data-preset-selected]').forEach((x) => x.checked = false)
    manager.querySelector('#apply-presets').onclick = () => {
      const updatedCatalog = catalog.map((p, i) => ({
        ...p,
        selected: manager.querySelector(`[data-preset-selected="${i}"]`).checked,
        label: manager.querySelector(`[data-preset-label="${i}"]`).value.trim() || labelForRow(p.csvRow || [], p.presetIndex),
      }))
      const resources = updatedCatalog.filter((p) => p.selected).map((p) => ({
        id: p.resourceId || id(),
        type: 'titlePreset',
        label: p.label,
        inputKey: input.key,
        presetIndex: p.presetIndex,
        csvRow: p.csvRow || [],
        verification: p.verification || { mode: 'indexOnly', fieldNames: [] },
      }))
      ctx.actions.replaceTitleResources(input.key, resources, metadata || { fileName: 'Current configuration', importedAt: new Date().toISOString(), rowCount: updatedCatalog.length, sha256: 'legacy' }, updatedCatalog)
      host.innerHTML = ''
    }
  }

  renderCatalog()

  dropFile.querySelector('input').onchange = async (ev) => {
    const file = ev.target.files[0]; if (!file) return
    if (file.size > 1_000_000) {
      host.querySelector('#csv-error').innerHTML = `<p class="error-box">CSV is larger than the v1 safety limit (1 MB).</p>`
      return
    }
    try {
      const raw = await file.text()
      const rows = parseCsv(raw)
      if (!rows.length) throw new Error('CSV contains no preset rows.')
      const maxColumns = Math.max(...rows.map((r) => r.length))
      const fieldNames = input.text?.slice(0, maxColumns).map((x) => x.name).filter(Boolean) || []
      const previousByIndex = new Map(catalog.map((p) => [p.presetIndex, p]))
      catalog = rows.map((row, presetIndex) => {
        const previous = previousByIndex.get(presetIndex)
        const sameRow = previous && JSON.stringify(previous.csvRow) === JSON.stringify(row)
        return {
          presetIndex,
          csvRow: row,
          label: sameRow ? previous.label : labelForRow(row, presetIndex),
          verification: { mode: fieldNames.length >= row.length ? 'verifiedFields' : 'indexOnly', fieldNames: fieldNames.slice(0, row.length) },
          selected: previous ? previous.selected : true,
          resourceId: sameRow ? previous.resourceId : null,
        }
      })
      metadata = { fileName: file.name, importedAt: new Date().toISOString(), rowCount: rows.length, sha256: await sha256(raw) }
      host.querySelector('#csv-error').innerHTML = ''
      renderCatalog()
      host.querySelector('.preset-import').open = false
    } catch (err) {
      host.querySelector('#csv-error').innerHTML = `<p class="error-box">${e(err.message)}</p>`
    }
  }
}
