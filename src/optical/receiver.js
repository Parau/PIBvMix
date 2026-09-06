import { LTDecoder } from './fountain.js'
import { fnv1a, parseFrame, streamIdentity, textToFrame } from './protocol.js'

export class OpticalReceiver {
  constructor() { this.reset() }

  reset() {
    this.identity = null
    this.decoder = null
    this.header = null
    this.pendingIdentity = null
    this.pendingCount = 0
    this.completeBytes = null
  }

  startSession(header) {
    this.identity = streamIdentity(header)
    this.header = header
    this.decoder = new LTDecoder(header.k, header.blockLen, header.sessionId, header.totalLen)
    this.pendingIdentity = null
    this.pendingCount = 0
    this.completeBytes = null
  }

  considerSession(header) {
    const identity = streamIdentity(header)
    if (!this.identity) { this.startSession(header); return true }
    if (identity === this.identity) { this.pendingIdentity = null; this.pendingCount = 0; return true }
    if (identity !== this.pendingIdentity) { this.pendingIdentity = identity; this.pendingCount = 1; return false }
    this.pendingCount++
    if (this.pendingCount >= 2) { this.startSession(header); return true }
    return false
  }

  addFrameText(text) {
    const bytes = textToFrame(text)
    if (!bytes) return { status: 'ignored', progress: this.progress }
    return this.addFrameBytes(bytes)
  }

  addFrameBytes(bytes) {
    const parsed = parseFrame(bytes)
    if (!parsed) return { status: 'ignored', progress: this.progress }
    const sessionChanged = !this.identity || streamIdentity(parsed.header) !== this.identity
    if (!this.considerSession(parsed.header)) return { status: 'foreign-session', progress: this.progress }
    if (this.completeBytes) return { status: 'complete', progress: 100, bytes: this.completeBytes, sessionChanged: false }

    this.decoder.addFrame(parsed.header.seq, parsed.block)
    if (this.decoder.isComplete) {
      const assembled = this.decoder.assemble()
      if (!assembled || fnv1a(assembled) !== this.header.payloadFnv) {
        this.reset()
        throw new Error('The reconstructed optical stream failed its frame checksum.')
      }
      this.completeBytes = assembled
      return { status: 'complete', progress: 100, bytes: assembled, sessionChanged }
    }
    return { status: 'receiving', progress: this.progress, sessionChanged }
  }

  get progress() {
    if (!this.decoder) return 0
    if (this.decoder.isComplete) return 100
    const solved = this.decoder.k ? this.decoder.solvedCount / this.decoder.k : 0
    const targetFrames = Math.max(this.decoder.k, Math.ceil(this.decoder.k * 1.15))
    const collected = Math.min(1, this.decoder.framesNew / targetFrames)
    return Math.min(99, Math.floor(Math.max(solved, collected) * 100))
  }

  get stats() {
    return this.decoder ? {
      sessionId: this.header.sessionId,
      sourceBlocks: this.decoder.k,
      solvedBlocks: this.decoder.solvedCount,
      framesNew: this.decoder.framesNew,
      framesDuplicate: this.decoder.framesDup,
      progress: this.progress,
    } : null
  }
}
