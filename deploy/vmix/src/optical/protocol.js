// PIBvMix optical frame protocol.
// Fountain framing follows the Decimen Optical Transfer v0.3.0 design (MIT),
// with a PIBvMix-specific versioned header and stricter size validation.
// See THIRD_PARTY_NOTICES.md.

export const FRAME_MAGIC = new Uint8Array([0x50, 0x56, 0x4d, 0x51]) // PVMQ
export const PROTOCOL_VERSION = 1
export const HEADER_LEN = 28
export const FRAME_TEXT_PREFIX = 'PVMQ1:'
export const DEFAULT_BLOCK_LEN = 512
export const MAX_BLOCK_LEN = 1024
export const MAX_SOURCE_BLOCKS = 8192
export const MAX_CONTAINER_BYTES = 2_000_128

export function randomSessionId() {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0] || 1
}

export function fnv1a(bytes) {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function splitmix32(seed) {
  let s = seed | 0
  return () => {
    s = (s + 0x9e3779b9) | 0
    let t = s ^ (s >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t ^= t >>> 15
    t = Math.imul(t, 0x735a2d97)
    t ^= t >>> 15
    return t >>> 0
  }
}

export function packFrame(header, block) {
  if (!(block instanceof Uint8Array)) throw new Error('Optical frame block must be bytes.')
  if (block.length !== header.blockLen) throw new Error('Optical frame block length mismatch.')
  const out = new Uint8Array(HEADER_LEN + block.length)
  const view = new DataView(out.buffer)
  out.set(FRAME_MAGIC, 0)
  view.setUint8(4, PROTOCOL_VERSION)
  view.setUint8(5, 0)
  view.setUint16(6, HEADER_LEN, true)
  view.setUint32(8, header.sessionId >>> 0, true)
  view.setUint32(12, header.seq >>> 0, true)
  view.setUint16(16, header.k, true)
  view.setUint16(18, header.blockLen, true)
  view.setUint32(20, header.totalLen, true)
  view.setUint32(24, header.payloadFnv >>> 0, true)
  out.set(block, HEADER_LEN)
  return out
}

export function parseFrame(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length <= HEADER_LEN) return null
  for (let i = 0; i < FRAME_MAGIC.length; i++) if (bytes[i] !== FRAME_MAGIC[i]) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint8(4) !== PROTOCOL_VERSION || view.getUint16(6, true) !== HEADER_LEN) return null
  const header = {
    sessionId: view.getUint32(8, true),
    seq: view.getUint32(12, true),
    k: view.getUint16(16, true),
    blockLen: view.getUint16(18, true),
    totalLen: view.getUint32(20, true),
    payloadFnv: view.getUint32(24, true),
  }
  if (!header.sessionId || !header.k || !header.blockLen || !header.totalLen) return null
  if (header.blockLen > MAX_BLOCK_LEN || header.k > MAX_SOURCE_BLOCKS || header.totalLen > MAX_CONTAINER_BYTES) return null
  if (header.k !== Math.ceil(header.totalLen / header.blockLen)) return null
  if (bytes.length !== HEADER_LEN + header.blockLen) return null
  return { header, block: bytes.subarray(HEADER_LEN) }
}

export function streamIdentity(header) {
  return `${header.sessionId}:${header.k}:${header.blockLen}:${header.totalLen}:${header.payloadFnv}`
}

function bytesToBinary(bytes) {
  let out = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return out
}

function binaryToBytes(binary) {
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff
  return out
}

function b64Encode(bytes) {
  if (typeof btoa === 'function') return btoa(bytesToBinary(bytes))
  return Buffer.from(bytes).toString('base64')
}

function b64Decode(text) {
  if (typeof atob === 'function') return binaryToBytes(atob(text))
  return new Uint8Array(Buffer.from(text, 'base64'))
}

export function frameToText(bytes) {
  return FRAME_TEXT_PREFIX + b64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function textToFrame(text) {
  if (typeof text !== 'string' || !text.startsWith(FRAME_TEXT_PREFIX)) return null
  const body = text.slice(FRAME_TEXT_PREFIX.length)
  if (!body || body.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(body)) return null
  const padded = body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - body.length % 4) % 4)
  try { return b64Decode(padded) } catch { return null }
}
