const BASE_PATH = '/control-palette/'

const e = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))

export function canUseServerPalette() {
  const host = location.hostname
  return location.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)
}

function normalizeEntries(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') return { name: entry }
      return entry && typeof entry === 'object' ? entry : null
    })
    .filter(Boolean)
    .filter((entry) => !entry.is_dir)
    .filter((entry) => typeof entry.name === 'string' && /^[^/\\]+\.json$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

async function listServerPalettes() {
  const response = await fetch(BASE_PATH, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Local palette directory returned HTTP ${response.status}.`)
  let listing
  try { listing = await response.json() }
  catch { throw new Error('Local palette directory did not return a valid file list.') }
  return normalizeEntries(listing)
}

async function loadPalette(entry, actions) {
  const url = new URL(`${BASE_PATH}${encodeURIComponent(entry.name)}`, location.origin)
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not load ${entry.name} (HTTP ${response.status}).`)
  const text = await response.text()
  let parsed
  try { parsed = JSON.parse(text) }
  catch { throw new Error(`${entry.name} is not valid JSON.`) }
  if (parsed?.schemaVersion !== 2 || !Array.isArray(parsed.resources)) {
    throw new Error(`${entry.name} is not a supported PIBvMix configuration.`)
  }
  const file = new File([text], entry.name, { type: 'application/json' })
  await actions.importConfig(file)
}

export async function showServerPaletteDialog(host, actions) {
  host.innerHTML = `<div class="modal-backdrop"><div class="modal"><button class="modal-close" data-server-close>×</button><p class="eyebrow">CONTROL PALETTE</p><h2>Import from local server</h2><p>Choose a PIBvMix configuration copied to <code>deploy/control-palette</code>.</p><div id="server-palette-list"><div class="empty"><strong>Reading local palettes…</strong><span>Looking for JSON configuration files.</span></div></div><div id="server-palette-error"></div><div class="modal-actions"><button class="btn ghost" data-server-close>Cancel</button></div></div></div>`

  const close = () => { host.innerHTML = '' }
  host.querySelectorAll('[data-server-close]').forEach((button) => button.addEventListener('click', close))
  const listHost = host.querySelector('#server-palette-list')
  const errorHost = host.querySelector('#server-palette-error')

  try {
    const entries = await listServerPalettes()
    if (!entries.length) {
      listHost.innerHTML = `<div class="empty"><strong>No saved palettes found</strong><span>Export a PIBvMix configuration on the PC and copy the JSON file to deploy/control-palette.</span></div>`
      return
    }

    listHost.innerHTML = `<div class="csv-rows">${entries.map((entry, index) => `<div class="csv-row"><div><strong>${e(entry.name)}</strong>${Number.isFinite(Number(entry.size)) ? `<small>${e(entry.size)} bytes</small>` : ''}</div><button class="btn mini" data-server-palette="${index}">Import</button></div>`).join('')}</div>`
    listHost.querySelectorAll('[data-server-palette]').forEach((button) => button.addEventListener('click', async () => {
      const entry = entries[Number(button.dataset.serverPalette)]
      if (!entry) return
      button.disabled = true
      errorHost.innerHTML = ''
      try {
        await loadPalette(entry, actions)
        close()
      } catch (error) {
        button.disabled = false
        errorHost.innerHTML = `<p class="error-box">${e(error?.message || 'Could not import this palette.')}</p>`
      }
    }))
  } catch (error) {
    listHost.innerHTML = ''
    errorHost.innerHTML = `<p class="error-box">${e(error?.message || 'Local palette directory is not available.')}</p><p>Start PIBvMix with <code>deploy\\iniciar-remote-vmix.bat</code> and try again.</p>`
  }
}
