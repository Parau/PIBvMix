const QR_ENCODER_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/+esm'
const QR_DECODER_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm'

let qrFactoryPromise = null
let jsQrPromise = null

async function qrFactory() {
  if (globalThis.qrcode) return globalThis.qrcode
  if (!qrFactoryPromise) qrFactoryPromise = import(QR_ENCODER_URL).then((module) => module.default || module.qrcode || module)
  return qrFactoryPromise
}

export async function renderQrText(canvas, text, { size = 520, margin = 4 } = {}) {
  const factory = await qrFactory()
  if (typeof factory !== 'function') throw new Error('QR encoder could not be loaded.')
  const qr = factory(0, 'L')
  qr.addData(text, 'Byte')
  qr.make()
  const modules = qr.getModuleCount()
  const total = modules + margin * 2
  const scale = Math.max(1, Math.floor(size / total))
  const px = total * scale
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d', { alpha: false })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, px, px)
  ctx.fillStyle = '#000'
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) ctx.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale)
    }
  }
  return { modules, pixels: px }
}

export async function createQrScanner() {
  if (typeof BarcodeDetector !== 'undefined') {
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] })
      return { kind: 'barcode', detector }
    } catch {}
  }
  if (!jsQrPromise) jsQrPromise = import(QR_DECODER_URL).then((module) => module.default || module)
  const decode = await jsQrPromise
  if (typeof decode !== 'function') throw new Error('QR decoder could not be loaded.')
  return { kind: 'jsqr', decode }
}

export async function decodeQrFrame(scanner, video, canvas) {
  if (scanner.kind === 'barcode') {
    try {
      const results = await scanner.detector.detect(video)
      return results?.[0]?.rawValue || null
    } catch { return null }
  }
  const width = video.videoWidth || 0
  const height = video.videoHeight || 0
  if (width < 2 || height < 2) return null
  const maxWidth = 720
  const scale = Math.min(1, maxWidth / width)
  const outWidth = Math.max(2, Math.round(width * scale))
  const outHeight = Math.max(2, Math.round(height * scale))
  if (canvas.width !== outWidth) canvas.width = outWidth
  if (canvas.height !== outHeight) canvas.height = outHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, outWidth, outHeight)
  const image = ctx.getImageData(0, 0, outWidth, outHeight)
  const result = scanner.decode(image.data, outWidth, outHeight, { inversionAttempts: 'dontInvert' })
  return result?.data || null
}
