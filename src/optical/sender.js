import { LTEncoder } from './fountain.js'
import { DEFAULT_BLOCK_LEN, MAX_SOURCE_BLOCKS, fnv1a, frameToText, packFrame, randomSessionId } from './protocol.js'

export class OpticalSender {
  constructor(container, { blockLen = DEFAULT_BLOCK_LEN, sessionId = randomSessionId() } = {}) {
    if (!(container instanceof Uint8Array) || !container.length) throw new Error('Optical sender requires a packed payload.')
    this.container = container
    this.blockLen = blockLen
    this.sessionId = sessionId >>> 0 || 1
    this.encoder = new LTEncoder(container, blockLen, this.sessionId)
    if (this.encoder.k > MAX_SOURCE_BLOCKS) throw new Error('Optical payload needs too many fountain blocks.')
    this.payloadFnv = fnv1a(container)
    this.seq = 0
  }

  get sourceBlocks() { return this.encoder.k }

  nextFrameBytes() {
    const seq = this.seq >>> 0
    const block = this.encoder.encode(seq)
    const bytes = packFrame({
      sessionId: this.sessionId,
      seq,
      k: this.encoder.k,
      blockLen: this.blockLen,
      totalLen: this.container.length,
      payloadFnv: this.payloadFnv,
    }, block)
    this.seq = (seq + 1) >>> 0
    return bytes
  }

  nextFrameText() { return frameToText(this.nextFrameBytes()) }
}
