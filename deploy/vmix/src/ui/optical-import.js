import { unpackPayload } from '../optical/container.js'
import { OpticalReceiver } from '../optical/receiver.js'
import { createQrScanner, decodeQrFrame } from '../optical/qr.js'

const decoder = new TextDecoder()

function cameraMessage(error) {
  if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador não oferece acesso à câmera. Use Chrome/Chromium em HTTPS.'
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Não foi possível acessar a câmera. Permita o acesso à câmera e tente novamente.'
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'Nenhuma câmera compatível foi encontrada neste dispositivo.'
  return error?.message || 'Não foi possível iniciar a câmera.'
}

export async function openOpticalImport(host, { validateConfig, onImport }) {
  const receiver = new OpticalReceiver()
  let stream = null
  let raf = 0
  let scanner = null
  let closed = false
  let decodingBusy = false
  let lastAttempt = 0
  let lastLoggedProgress = -10
  let pendingConfig = null
  let sessionId = null

  host.innerHTML = `<div class="modal-backdrop optical-backdrop"><div class="modal optical-modal"><button class="modal-close" data-optical-close>×</button><p class="eyebrow">OPTICAL IMPORT</p><h2>Importar configuração</h2><div class="optical-camera-wrap"><video data-optical-video playsinline autoplay muted></video><canvas data-optical-scan hidden></canvas><div class="optical-camera-status" data-optical-status>Aguardando câmera…</div></div><div class="optical-progress" hidden><div><span data-optical-progress-label>Recebendo configuração…</span><strong data-optical-progress-value>0%</strong></div><progress max="100" value="0" data-optical-progress></progress></div><div class="optical-received" hidden><h3>Configuração PIBvMix encontrada</h3><dl><div><dt>Recursos</dt><dd data-summary-resources>—</dd></div><div><dt>Titles</dt><dd data-summary-titles>—</dd></div><div><dt>Servidor vMix</dt><dd data-summary-vmix>—</dd></div></dl></div><div class="modal-actions"><button class="btn ghost" data-optical-close>Cancelar</button><button class="btn primary" data-optical-confirm hidden>Importar</button></div></div></div>`

  const video = host.querySelector('[data-optical-video]')
  const canvas = host.querySelector('[data-optical-scan]')
  const status = host.querySelector('[data-optical-status]')
  const progressBox = host.querySelector('.optical-progress')
  const progress = host.querySelector('[data-optical-progress]')
  const progressValue = host.querySelector('[data-optical-progress-value]')
  const receivedBox = host.querySelector('.optical-received')
  const confirmButton = host.querySelector('[data-optical-confirm]')

  const stopCamera = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    stream?.getTracks?.().forEach((track) => track.stop())
    stream = null
    if (video) { try { video.pause() } catch {}; video.srcObject = null }
    if (canvas) { canvas.width = 0; canvas.height = 0 }
  }

  const close = () => {
    if (closed) return
    closed = true
    stopCamera()
    receiver.reset()
    pendingConfig = null
    host.innerHTML = ''
    console.info('[PIBvMix][optical] import closed')
  }
  host.querySelectorAll('[data-optical-close]').forEach((button) => button.addEventListener('click', close))

  const fail = (message, error) => {
    stopCamera()
    status.textContent = message
    status.classList.add('optical-error')
    if (error) console.error('[PIBvMix][optical] import failed', error)
  }

  const finishDecoded = async (containerBytes) => {
    stopCamera()
    status.textContent = 'Validando configuração…'
    try {
      const unpacked = await unpackPayload(containerBytes)
      console.info('[PIBvMix][optical] hash verified', { originalBytes: unpacked.originalSize, transmittedBytes: unpacked.transmittedSize, compression: unpacked.compression })
      const text = decoder.decode(unpacked.bytes)
      let parsed
      try { parsed = JSON.parse(text) } catch { throw new Error('O conteúdo óptico recebido não contém JSON válido.') }
      pendingConfig = validateConfig(parsed)
      console.info('[PIBvMix][optical] config validated')
      progress.value = 100
      progressValue.textContent = '100%'
      status.textContent = 'Configuração recebida com sucesso.'
      receivedBox.hidden = false
      host.querySelector('[data-summary-resources]').textContent = String(pendingConfig.resources?.length || 0)
      host.querySelector('[data-summary-titles]').textContent = String(pendingConfig.titleSources?.length || 0)
      host.querySelector('[data-summary-vmix]').textContent = pendingConfig.vmix?.target || 'não configurado'
      confirmButton.hidden = false
    } catch (error) {
      pendingConfig = null
      fail(error?.message || 'A configuração recebida é inválida.', error)
    }
  }

  confirmButton.addEventListener('click', async () => {
    if (!pendingConfig || closed) return
    confirmButton.disabled = true
    try {
      console.info('[PIBvMix][optical] import complete')
      stopCamera()
      await onImport(pendingConfig)
    } catch (error) {
      confirmButton.disabled = false
      fail(error?.message || 'Não foi possível importar a configuração.', error)
    }
  })

  const handleText = async (text) => {
    try {
      const result = receiver.addFrameText(text)
      if (result.status === 'ignored' || result.status === 'foreign-session') return
      const stats = receiver.stats
      if (result.sessionChanged && stats?.sessionId !== sessionId) {
        sessionId = stats.sessionId
        lastLoggedProgress = -10
        console.info('[PIBvMix][optical] session detected', { sessionId, sourceBlocks: stats.sourceBlocks })
      }
      progressBox.hidden = false
      progress.value = result.progress
      progressValue.textContent = `${result.progress}%`
      status.textContent = 'Recebendo configuração…'
      if (result.progress >= lastLoggedProgress + 10) {
        lastLoggedProgress = result.progress
        console.info('[PIBvMix][optical] progress', { progress: result.progress, frames: stats?.framesNew, solved: stats?.solvedBlocks, total: stats?.sourceBlocks })
      }
      if (result.status === 'complete') {
        console.info('[PIBvMix][optical] decode complete')
        await finishDecoded(result.bytes)
      }
    } catch (error) {
      fail(error?.message || 'O fluxo óptico recebido está corrompido.', error)
    }
  }

  const loop = (now) => {
    if (closed || !stream || pendingConfig) return
    raf = requestAnimationFrame(loop)
    if (decodingBusy || now - lastAttempt < 100) return
    lastAttempt = now
    decodingBusy = true
    Promise.resolve(decodeQrFrame(scanner, video, canvas))
      .then((text) => text && handleText(text))
      .catch((error) => console.debug('[PIBvMix][optical] unreadable camera frame', error))
      .finally(() => { decodingBusy = false })
  }

  console.info('[PIBvMix][optical] import camera starting')
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable')
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    if (closed) { stream.getTracks().forEach((track) => track.stop()); return close }
    video.srcObject = stream
    try { await video.play() } catch {}
    scanner = await createQrScanner()
    if (closed) return close
    status.textContent = 'Aguardando transmissão…'
    console.info('[PIBvMix][optical] import camera started', { scanner: scanner.kind })
    raf = requestAnimationFrame(loop)
  } catch (error) {
    fail(cameraMessage(error), error)
  }

  return close
}
