import { packPayload } from '../optical/container.js'
import { OpticalSender } from '../optical/sender.js'
import { renderQrText } from '../optical/qr.js'

const encoder = new TextEncoder()
const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`

export async function openOpticalExport(host, config) {
  let closed = false
  let timer = null
  let canvas = null
  const close = () => {
    closed = true
    if (timer) clearTimeout(timer)
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    host.innerHTML = ''
    console.info('[PIBvMix][optical] export closed')
  }

  host.innerHTML = `<div class="modal-backdrop optical-backdrop"><div class="modal optical-modal"><button class="modal-close" data-optical-close>×</button><p class="eyebrow">OPTICAL EXPORT</p><h2>Transferindo configuração</h2><div class="optical-status" data-optical-status>Preparando configuração…</div><div class="optical-stats" hidden><div><span>Original</span><strong data-optical-original>—</strong></div><div><span>Transmitido</span><strong data-optical-transmitted>—</strong></div><div><span>Compressão</span><strong data-optical-compression>—</strong></div></div><div class="optical-qr-stage" hidden><canvas data-optical-qr aria-label="Animated optical transfer QR code"></canvas></div><p class="optical-hint" data-optical-hint>Aponte a câmera do tablet para o QR. A transmissão se repete continuamente e não possui último frame.</p><div class="modal-actions"><button class="btn ghost" data-optical-close>Fechar</button></div></div></div>`
  host.querySelectorAll('[data-optical-close]').forEach((button) => button.addEventListener('click', close))
  const status = host.querySelector('[data-optical-status]')
  const stats = host.querySelector('.optical-stats')
  const stage = host.querySelector('.optical-qr-stage')
  canvas = host.querySelector('[data-optical-qr]')

  console.info('[PIBvMix][optical] export start')
  try {
    const json = JSON.stringify(config)
    const original = encoder.encode(json)
    const packed = await packPayload(original)
    if (closed) return close
    const sender = new OpticalSender(packed.container)
    console.info('[PIBvMix][optical] packed', { originalBytes: packed.originalSize, transmittedBytes: packed.transmittedSize, containerBytes: packed.containerSize, compression: packed.compression, sourceBlocks: sender.sourceBlocks, sessionId: sender.sessionId })
    host.querySelector('[data-optical-original]').textContent = formatBytes(packed.originalSize)
    host.querySelector('[data-optical-transmitted]').textContent = formatBytes(packed.transmittedSize)
    host.querySelector('[data-optical-compression]').textContent = packed.compression === 'gzip' ? 'gzip' : 'sem compressão'
    stats.hidden = false
    stage.hidden = false
    status.textContent = 'Transmitindo…'

    const frameIntervalMs = 125 // 8 QR/s: conservative screen-to-camera default.
    const tick = async () => {
      if (closed) return
      try {
        const text = sender.nextFrameText()
        await renderQrText(canvas, text, { size: 560 })
        if (!closed) timer = setTimeout(tick, frameIntervalMs)
      } catch (error) {
        if (!closed) {
          status.textContent = error?.message || 'Não foi possível gerar o QR Code.'
          status.classList.add('error-box')
          console.error('[PIBvMix][optical] export failed', error)
        }
      }
    }
    await tick()
  } catch (error) {
    if (!closed) {
      status.textContent = error?.message || 'Não foi possível preparar a transferência óptica.'
      status.classList.add('error-box')
      console.error('[PIBvMix][optical] export failed', error)
    }
  }
  return close
}
