import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { packPayload } from '../src/optical/container.js'
import { OpticalSender } from '../src/optical/sender.js'

const STORAGE_KEY = 'pibvmix:v2:config'
const enc = new TextEncoder()

const originalConfig = { schemaVersion: 2, vmix: { target: 'http://old-vmix:8088' }, titleSources: [], resources: [{ id: 'old', type: 'input', inputKey: 'old', label: 'Old' }] }
const incomingConfig = { schemaVersion: 2, vmix: { target: 'http://192.168.25.2:8088' }, titleSources: [{ inputKey: 'lower-1', presets: [] }], resources: Array.from({ length: 18 }, (_, i) => ({ id: `new-${i}`, type: 'input', inputKey: `input-${i}`, label: `Novo ${i}` })) }

async function frameTexts(config, multiplier = 5) {
  const packed = await packPayload(enc.encode(JSON.stringify(config)), { compression: 'none' })
  const sender = new OpticalSender(packed.container, { sessionId: 0x76543210 })
  return Array.from({ length: sender.sourceBlocks * multiplier + 16 }, () => sender.nextFrameText())
}

const incomingFrames = await frameTexts(incomingConfig)
const partialConfig = { ...incomingConfig, resources: Array.from({ length: 120 }, (_, i) => ({ id: `partial-${i}`, type: 'input', inputKey: `p-${i}`, label: `Partial ${i} ${'x'.repeat(40)}` })) }
const partialAllFrames = await frameTexts(partialConfig, 1)
const partialFrames = partialAllFrames.slice(0, 3)

function initScript({ config, frames }) {
  // addInitScript runs again after location.reload(). Seed the old config only
  // once so the test can verify the value persisted by the optical import.
  if (!sessionStorage.getItem('__pibvmixOpticalSeeded')) {
    localStorage.setItem('pibvmix:v2:config', JSON.stringify(config))
    sessionStorage.setItem('__pibvmixOpticalSeeded', '1')
  }
  window.__qrMakeCount = 0
  window.qrcode = () => ({
    addData() {},
    make() { window.__qrMakeCount++ },
    getModuleCount() { return 21 },
    isDark(row, col) { return row < 7 && col < 7 || ((row * 13 + col * 7) % 5 === 0) },
  })
  window.__opticalFrames = [...frames]
  window.__cameraStops = 0
  class MockBarcodeDetector {
    constructor() {}
    async detect() {
      const rawValue = window.__opticalFrames.shift()
      return rawValue ? [{ rawValue }] : []
    }
  }
  window.BarcodeDetector = MockBarcodeDetector
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { window.__cameraStops++ } }] }) } })
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return this.__mockStream || null }, set(value) { this.__mockStream = value } })
  HTMLMediaElement.prototype.play = async function () {}
  HTMLMediaElement.prototype.pause = function () {}
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(initScript, { config: originalConfig, frames: incomingFrames })
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  assert.equal(await page.locator('.brand-version').textContent(), 'v0.3.5')

  // Existing file paths remain visible beside the new optical choices.
  await page.getByText('Export ▾', { exact: true }).click()
  assert.ok(await page.locator('.backup-menu').first().getByText('Arquivo', { exact: true }).count())
  await page.locator('[data-optical-export]').click()
  await page.waitForSelector('[data-optical-qr]')
  await page.waitForFunction(() => document.querySelector('[data-optical-qr]')?.width > 0)
  const beforeClose = await page.evaluate(() => window.__qrMakeCount)
  assert.ok(beforeClose > 0)
  await page.locator('[data-optical-close]').last().click()
  await page.waitForTimeout(400)
  assert.equal(await page.evaluate(() => window.__qrMakeCount), beforeClose, 'QR loop continued after closing export modal')

  await page.getByText('Import ▾', { exact: true }).click()
  assert.ok(await page.locator('.backup-menu').nth(1).getByText('Arquivo', { exact: true }).count())
  await page.locator('[data-optical-import]').click()
  await page.waitForSelector('[data-optical-progress]')
  await page.waitForSelector('[data-optical-confirm]:not([hidden])', { timeout: 8000 })
  const beforeConfirm = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)
  assert.deepEqual(beforeConfirm, originalConfig, 'optical receiver persisted before user confirmation')
  assert.equal(await page.locator('[data-summary-resources]').textContent(), String(incomingConfig.resources.length))
  assert.equal(await page.locator('[data-summary-titles]').textContent(), '1')
  assert.equal(await page.locator('[data-summary-vmix]').textContent(), incomingConfig.vmix.target)
  // Decoding already completed, so the camera must be stopped before the user decides.
  assert.ok(await page.evaluate(() => window.__cameraStops) >= 1)

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('[data-optical-confirm]').click(),
  ])
  const afterConfirm = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)
  assert.deepEqual(afterConfirm, incomingConfig)
  await page.close()

  // Cancellation during an incomplete session preserves config and stops camera.
  const cancelPage = await browser.newPage({ viewport: { width: 1024, height: 800 } })
  await cancelPage.addInitScript(initScript, { config: originalConfig, frames: partialFrames })
  await cancelPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await cancelPage.getByText('Import ▾', { exact: true }).click()
  await cancelPage.locator('[data-optical-import]').click()
  await cancelPage.waitForFunction(() => Number(document.querySelector('[data-optical-progress]')?.value || 0) > 0, null, { timeout: 5000 })
  const pct = await cancelPage.locator('[data-optical-progress]').getAttribute('value')
  assert.ok(Number(pct) < 100)
  await cancelPage.locator('[data-optical-close]').last().click()
  assert.deepEqual(await cancelPage.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY), originalConfig)
  assert.ok(await cancelPage.evaluate(() => window.__cameraStops) >= 1)
  assert.equal(await cancelPage.locator('.modal-backdrop').count(), 0)
  await cancelPage.close()

  console.log('PLAYWRIGHT optical UI: PASS')
} finally {
  await browser.close()
}
