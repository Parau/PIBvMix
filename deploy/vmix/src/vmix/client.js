export function normalizeTarget(value) {
  let raw = String(value || '').trim()
  if (!raw) throw new Error('Enter the vMix address.')
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`
  const url = new URL(raw)
  if (!url.port) url.port = '8088'
  url.pathname = url.pathname.replace(/\/api\/?$/i, '').replace(/\/$/, '') || ''
  url.search = ''
  url.hash = ''
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
  return url.origin + path
}

function withTimeout(ms) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(new DOMException('Timeout', 'AbortError')), ms)
  return { signal: controller.signal, cancel: () => clearTimeout(id) }
}

export class VmixClient {
  constructor(target, { timeoutMs = 2000 } = {}) {
    this.target = normalizeTarget(target)
    this.timeoutMs = timeoutMs
  }
  apiUrl(params = null) {
    const url = new URL(`${this.target}/api/`)
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && url.searchParams.set(k, String(v)))
    return url
  }
  async request(url) {
    const timer = withTimeout(this.timeoutMs)
    try {
      const response = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: timer.signal })
      if (!response.ok) throw new Error(`vMix HTTP ${response.status}`)
      return await response.text()
    } finally { timer.cancel() }
  }
  fetchState() { return this.request(this.apiUrl()) }
  command(functionName, params = {}) { return this.request(this.apiUrl({ Function: functionName, ...params })) }
  async testConnection() { return this.fetchState() }
}
