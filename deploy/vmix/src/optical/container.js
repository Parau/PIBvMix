import { MAX_CONTAINER_BYTES } from './protocol.js'

export const MAX_PAYLOAD_BYTES = 2_000_000
const CONTAINER_MAGIC = new Uint8Array([0x50, 0x56, 0x4d, 0x43]) // PVMC
const CONTAINER_VERSION = 1
const CONTAINER_HEADER_LEN = 48

async function digest(bytes) {
  const stable = Uint8Array.from(bytes)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', stable))
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzipBounded(bytes, maxBytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress gzip optical payloads.')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes || total > MAX_PAYLOAD_BYTES) {
      await reader.cancel()
      throw new Error('The optical payload expands beyond the PIBvMix safety limit.')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out
}

export async function packPayload(bytes, { compression = 'auto' } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Optical payload must be bytes.')
  if (!bytes.length) throw new Error('The PIBvMix configuration is empty.')
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error('PIBvMix optical configuration is larger than the 2 MB safety limit.')

  const canGzip = compression !== 'none' && typeof CompressionStream !== 'undefined'
  let compressed = null
  if (canGzip && bytes.length >= 512) {
    try { compressed = await gzip(bytes) } catch { compressed = null }
  }
  const useGzip = compressed && compressed.length + 32 < bytes.length
  const transmitted = useGzip ? compressed : bytes
  const sha256 = await digest(bytes)
  const out = new Uint8Array(CONTAINER_HEADER_LEN + transmitted.length)
  if (out.length > MAX_CONTAINER_BYTES) throw new Error('Packed optical payload exceeds the safety limit.')
  const view = new DataView(out.buffer)
  out.set(CONTAINER_MAGIC, 0)
  view.setUint8(4, CONTAINER_VERSION)
  view.setUint8(5, useGzip ? 1 : 0)
  view.setUint16(6, CONTAINER_HEADER_LEN, true)
  view.setUint32(8, bytes.length, true)
  view.setUint32(12, transmitted.length, true)
  out.set(sha256, 16)
  out.set(transmitted, CONTAINER_HEADER_LEN)
  return {
    container: out,
    compression: useGzip ? 'gzip' : 'none',
    originalSize: bytes.length,
    transmittedSize: transmitted.length,
    containerSize: out.length,
    sha256,
  }
}

export async function unpackPayload(container) {
  if (!(container instanceof Uint8Array) || container.length < CONTAINER_HEADER_LEN) throw new Error('The recovered optical container is incomplete.')
  if (container.length > MAX_CONTAINER_BYTES) throw new Error('The recovered optical container exceeds the safety limit.')
  for (let i = 0; i < CONTAINER_MAGIC.length; i++) if (container[i] !== CONTAINER_MAGIC[i]) throw new Error('The recovered optical container is invalid.')
  const view = new DataView(container.buffer, container.byteOffset, container.byteLength)
  if (view.getUint8(4) !== CONTAINER_VERSION || view.getUint16(6, true) !== CONTAINER_HEADER_LEN) throw new Error('Unsupported optical container version.')
  const compressionByte = view.getUint8(5)
  if (compressionByte > 1) throw new Error('Unsupported optical compression mode.')
  const originalSize = view.getUint32(8, true)
  const transmittedSize = view.getUint32(12, true)
  if (!originalSize || originalSize > MAX_PAYLOAD_BYTES || !transmittedSize || CONTAINER_HEADER_LEN + transmittedSize !== container.length) {
    throw new Error('The recovered optical payload length does not match its header.')
  }
  const expectedHash = container.slice(16, 48)
  const transmitted = container.slice(CONTAINER_HEADER_LEN)
  const bytes = compressionByte === 1 ? await gunzipBounded(transmitted, originalSize) : transmitted
  if (bytes.length !== originalSize) throw new Error('The recovered optical payload has an invalid length.')
  const actualHash = await digest(bytes)
  if (!actualHash.every((value, index) => value === expectedHash[index])) throw new Error('The recovered optical payload failed SHA-256 verification.')
  return {
    bytes,
    compression: compressionByte === 1 ? 'gzip' : 'none',
    originalSize,
    transmittedSize,
    sha256: expectedHash,
  }
}
