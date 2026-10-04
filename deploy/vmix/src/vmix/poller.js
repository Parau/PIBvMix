export class VmixPoller {
  constructor(fetchState, onState, onError, interval = 500) {
    this.fetchState = fetchState; this.onState = onState; this.onError = onError; this.interval = interval
    this.timer = null; this.inFlight = null; this.stopped = true
  }
  async refreshNow() {
    if (this.inFlight) return this.inFlight
    this.inFlight = Promise.resolve().then(this.fetchState).then(this.onState).catch((e) => { this.onError?.(e); throw e }).finally(() => { this.inFlight = null })
    return this.inFlight
  }
  start() {
    this.stopped = false
    const loop = async () => { if (this.stopped) return; try { await this.refreshNow() } catch {} finally { if (!this.stopped) this.timer = setTimeout(loop, this.interval) } }
    loop()
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.timer = null }
}
