import test from 'node:test'
import assert from 'node:assert/strict'
import { packPayload, unpackPayload, MAX_PAYLOAD_BYTES } from '../src/optical/container.js'
import { OpticalSender } from '../src/optical/sender.js'
import { OpticalReceiver } from '../src/optical/receiver.js'
import { frameToText, packFrame, parseFrame } from '../src/optical/protocol.js'
import { validateConfig, readConfigFile } from '../src/config/backup.js'

const enc = new TextEncoder()
const dec = new TextDecoder()
const makeConfig = (count = 8, labelSize = 20) => ({
  schemaVersion: 2,
  vmix: { target: 'http://192.168.25.2:8088', lastPresetName: 'Produção São José' },
  titleSources: [{ inputKey: 'lower-ç', presets: [{ presetIndex: 0, label: 'João — Apresentação' }] }],
  resources: Array.from({ length: count }, (_, i) => ({ id: `r-${i}`, type: i % 3 ? 'input' : 'titlePreset', inputKey: `input-${i % 17}`, presetIndex: i % 5, label: `Recurso ${i} ${'á'.repeat(labelSize)}` })),
})

function shuffle(items, seed = 0x12345678) {
  let s = seed >>> 0
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 3266489917) >>> 0; return s }
  for (let i = items.length - 1; i > 0; i--) { const j = rnd() % (i + 1); [items[i], items[j]] = [items[j], items[i]] }
  return items
}

function recoverWithLoss(container, lossPercent, { startAt = 0, duplicates = true } = {}) {
  const sender = new OpticalSender(container, { sessionId: 0x12345678 })
  for (let i = 0; i < startAt; i++) sender.nextFrameBytes()
  const frames = []
  const max = sender.sourceBlocks * 8 + 64
  for (let i = 0; i < max; i++) {
    const frame = sender.nextFrameBytes()
    const keep = ((i * 73 + 19) % 100) >= lossPercent
    if (keep) {
      frames.push(frame)
      if (duplicates && i % 11 === 0) frames.push(frame)
    }
  }
  shuffle(frames)
  const receiver = new OpticalReceiver()
  let complete = null
  for (const frame of frames) {
    const result = receiver.addFrameBytes(frame)
    if (result.status === 'complete') { complete = result.bytes; break }
  }
  assert.ok(complete, `fountain decoder did not complete with ${lossPercent}% loss`)
  assert.deepEqual(complete, container)
  return receiver
}

test('opaque container round-trips JSON bytes without gzip and preserves UTF-8', async () => {
  const config = makeConfig(12, 35)
  const bytes = enc.encode(JSON.stringify(config))
  const packed = await packPayload(bytes, { compression: 'none' })
  assert.equal(packed.compression, 'none')
  const unpacked = await unpackPayload(packed.container)
  assert.deepEqual(unpacked.bytes, bytes)
  assert.deepEqual(JSON.parse(dec.decode(unpacked.bytes)), config)
})

test('opaque container uses gzip only when it reduces the payload', async () => {
  const bytes = enc.encode(JSON.stringify(makeConfig(500, 80)))
  const packed = await packPayload(bytes)
  if (typeof CompressionStream !== 'undefined') {
    assert.equal(packed.compression, 'gzip')
    assert.ok(packed.transmittedSize < packed.originalSize)
  }
  const unpacked = await unpackPayload(packed.container)
  assert.deepEqual(unpacked.bytes, bytes)
})

test('container rejects corruption before configuration can be imported', async () => {
  const bytes = enc.encode(JSON.stringify(makeConfig(50, 20)))
  const packed = await packPayload(bytes, { compression: 'none' })
  const corrupt = packed.container.slice()
  corrupt[corrupt.length - 3] ^= 0x55
  await assert.rejects(() => unpackPayload(corrupt), /SHA-256/)
})

test('fountain recovers ordered, shuffled, duplicated and lost frames', async () => {
  const packed = await packPayload(enc.encode(JSON.stringify(makeConfig(250, 35))), { compression: 'none' })
  recoverWithLoss(packed.container, 0, { duplicates: false })
  recoverWithLoss(packed.container, 30)
  recoverWithLoss(packed.container, 50)
  recoverWithLoss(packed.container, 35, { startAt: 97 })
})

test('receiver treats a clearly new session safely and ignores a single stray frame', async () => {
  const packedA = await packPayload(enc.encode(JSON.stringify(makeConfig(20, 10))), { compression: 'none' })
  const packedB = await packPayload(enc.encode(JSON.stringify(makeConfig(21, 11))), { compression: 'none' })
  const a = new OpticalSender(packedA.container, { sessionId: 111 })
  const b = new OpticalSender(packedB.container, { sessionId: 222 })
  const receiver = new OpticalReceiver()
  receiver.addFrameBytes(a.nextFrameBytes())
  assert.equal(receiver.stats.sessionId, 111)
  receiver.addFrameBytes(b.nextFrameBytes())
  assert.equal(receiver.stats.sessionId, 111)
  receiver.addFrameBytes(a.nextFrameBytes())
  assert.equal(receiver.stats.sessionId, 111)
  receiver.addFrameBytes(b.nextFrameBytes())
  receiver.addFrameBytes(b.nextFrameBytes())
  assert.equal(receiver.stats.sessionId, 222)
})

test('protocol rejects inconsistent length headers defensively', () => {
  const block = new Uint8Array(512)
  const frame = packFrame({ sessionId: 1, seq: 0, k: 1, blockLen: 512, totalLen: 1000, payloadFnv: 0 }, block)
  assert.equal(parseFrame(frame), null)
})

test('PIBvMix validation is shared by file and optical imports', async () => {
  const config = makeConfig(3, 2)
  assert.equal(validateConfig(config), config)
  assert.throws(() => validateConfig({ schemaVersion: 3, resources: [] }), /Unsupported/)
  assert.throws(() => validateConfig({ schemaVersion: 2 }), /Unsupported/)
  const file = { size: JSON.stringify(config).length, async text() { return JSON.stringify(config) } }
  assert.deepEqual(await readConfigFile(file), config)
})

test('full optical smoke returns the exact configuration object', async () => {
  const original = makeConfig(700, 30)
  const packed = await packPayload(enc.encode(JSON.stringify(original)))
  const sender = new OpticalSender(packed.container, { sessionId: 0xabcdef01 })
  const receiver = new OpticalReceiver()
  const frames = []
  for (let i = 0; i < sender.sourceBlocks * 5 + 40; i++) {
    const frame = sender.nextFrameBytes()
    if (i % 4 !== 0) frames.push(frame)
    if (i % 29 === 0) frames.push(frame)
  }
  shuffle(frames, 0x91e10da5)
  let recovered
  for (const frame of frames) {
    const result = receiver.addFrameText(frameToText(frame))
    if (result.status === 'complete') { recovered = result.bytes; break }
  }
  assert.ok(recovered)
  const unpacked = await unpackPayload(recovered)
  const decoded = validateConfig(JSON.parse(dec.decode(unpacked.bytes)))
  assert.deepEqual(decoded, JSON.parse(JSON.stringify(original)))
})

test('representative 500 KB and 1 MB payloads remain stable under pack/unpack', async () => {
  for (const target of [500_000, 1_000_000]) {
    const bytes = new Uint8Array(target)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + (i >>> 8)) & 0xff
    const packed = await packPayload(bytes)
    const unpacked = await unpackPayload(packed.container)
    assert.deepEqual(unpacked.bytes, bytes)
  }
  assert.equal(MAX_PAYLOAD_BYTES, 2_000_000)
})
