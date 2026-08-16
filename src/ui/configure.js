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
    if (filter === 'selected') return resources.some((r) => r.inputKey === input.key)
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
            const title = isTitleCandidate(input); const selected = resources.some((r) => r.inputKey === input.key)
            return `<article class="input-item ${selected?'selected':''}">
              <div class="type-icon">${resourceIcon(input.type)}</div><div class="input-copy"><strong>${e(input.shortTitle || input.title)}</strong><span>#${input.number} · ${e(input.type)}${title ? ' · Title/Lower' : ''}</span></div>
              ${title ? `<button class="btn mini ${selected?'accent':''}" data-import-title="${e(input.key)}">${selected ? 'Presets' : 'Import CSV'}</button>` : `<label class="select-box"><input type="checkbox" data-select-input="${e(input.key)}" ${selectedKeys.has(input.key)?'checked':''}><span></span></label>`}
            </article>`
          }).join('')}
          ${filter === 'unavailable' && unavailable.length ? unavailable.map((r)=>`<article class="input-item unavailable"><div class="type-icon">!</div><div class="input-copy"><strong>${e(r.label)}</strong><span>Missing GUID ${e(r.inputKey)}</span></div></article>`).join('') : ''}
        </div>
      </div>

      <div class="panel selected-panel">
        <div class="panel-head"><div><p class="eyebrow">CONTROL PALETTE</p><h2>Selected resources</h2><p>Arrange the exact order you want during the broadcast.</p></div><span class="count">${resources.length}</span></div>
        <div class="selected-list" id="selected-list">
          ${resources.length ? resources.map((r, index) => {
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

async function showCsvDialog(host, input, ctx) {
  const source = ctx.state.config.titleSources.find((x) => x.inputKey === input.key)
  host.innerHTML = `<div class="modal-backdrop"><div class="modal"><button class="modal-close">×</button><p class="eyebrow">TITLE PRESETS</p><h2>${e(input.shortTitle || input.title)}</h2><p>Choose the CSV exported from this vMix Title. Each row can become its own fast Control resource.</p><label class="drop-file"><span>${icon('upload')}</span><strong>Choose Title Preset CSV</strong><small>The file is read locally and never uploaded.</small><input type="file" accept=".csv,text/csv" hidden></label>${source?`<div class="resync-note">${source.csv.rowCount} presets currently imported from <strong>${e(source.csv.fileName)}</strong>.</div>`:''}<div id="csv-preview"></div></div></div>`
  host.querySelector('.modal-close').onclick = () => host.innerHTML = ''
  host.querySelector('.drop-file').onclick = () => host.querySelector('.drop-file input').click()
  host.querySelector('.drop-file input').onchange = async (ev) => {
    const file = ev.target.files[0]; if (!file) return
    if (file.size > 1_000_000) return alert('CSV is larger than the v1 safety limit (1 MB).')
    try {
      const raw = await file.text(); const rows = parseCsv(raw); if (!rows.length) throw new Error('CSV contains no preset rows.')
      const fieldNames = input.text?.slice(0, Math.max(...rows.map((r) => r.length))).map((x) => x.name) || []
      const preview = host.querySelector('#csv-preview')
      preview.innerHTML = `<div class="csv-summary"><strong>${rows.length} preset rows found</strong><span>${e(file.name)}</span></div><div class="csv-rows">${rows.map((r,i)=>`<label class="csv-row"><input type="checkbox" data-row="${i}" checked><span class="preset-index">${i}</span><span class="csv-label">${e(labelForRow(r,i))}</span><small>${e(r.join(' · '))}</small></label>`).join('')}</div><div class="modal-actions"><button class="btn ghost" id="select-none">Select none</button><button class="btn primary" id="accept-csv">Add selected to Control</button></div>`
      preview.querySelector('#select-none').onclick = () => preview.querySelectorAll('[data-row]').forEach((x) => x.checked = false)
      preview.querySelector('#accept-csv').onclick = async () => {
        const chosen = [...preview.querySelectorAll('[data-row]:checked')].map((x) => Number(x.dataset.row))
        const metadata = { fileName: file.name, importedAt: new Date().toISOString(), rowCount: rows.length, sha256: await sha256(raw) }
        const resources = chosen.map((i) => ({ id: id(), type: 'titlePreset', label: labelForRow(rows[i], i), inputKey: input.key, presetIndex: i, csvRow: rows[i], verification: { mode: fieldNames.length >= rows[i].length ? 'verifiedFields' : 'indexOnly', fieldNames: fieldNames.slice(0, rows[i].length) } }))
        ctx.actions.replaceTitleResources(input.key, resources, metadata)
        host.innerHTML = ''
      }
    } catch (err) { host.querySelector('#csv-preview').innerHTML = `<p class="error-box">${e(err.message)}</p>` }
  }
}
