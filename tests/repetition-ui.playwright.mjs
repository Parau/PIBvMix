import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto('http://127.0.0.1:4173/?demo=1', { waitUntil: 'networkidle' })
  await page.waitForSelector('.connection-chip.connected')
  assert.equal(await page.locator('.brand-version').textContent(), 'v0.3.4')

  const videoItem = page.locator('.input-item').filter({ hasText: 'Opening Video' }).first()
  await videoItem.waitFor()
  assert.equal(await videoItem.locator('[data-input-quantity]').inputValue(), '1')
  await videoItem.locator('[data-input-quantity-inc]').click()

  const videoItemAfter = page.locator('.input-item').filter({ hasText: 'Opening Video' }).first()
  await videoItemAfter.waitFor()
  assert.equal(await videoItemAfter.locator('[data-input-quantity]').inputValue(), '2')
  assert.equal(await page.locator('.selected-item').filter({ hasText: 'Opening Video' }).count(), 2)

  const ids = await page.locator('.selected-item').filter({ hasText: 'Opening Video' }).evaluateAll((nodes) => nodes.map((node) => node.dataset.resourceId))
  assert.equal(new Set(ids).size, 2)

  const lowerItem = page.locator('.input-item').filter({ hasText: 'Lower Thirds' }).first()
  await lowerItem.getByRole('button', { name: 'Presets' }).click()
  await page.waitForSelector('.modal-backdrop')

  const firstRow = page.locator('.preset-edit-row').first()
  const copyBox = await firstRow.locator('.preset-edit-copy').boundingBox()
  const controlsBox = await firstRow.locator('.preset-row-controls').boundingBox()
  const nameBox = await firstRow.locator('.preset-name-input').boundingBox()
  assert.ok(copyBox && controlsBox && nameBox)
  assert.ok(copyBox.right <= controlsBox.x + 1, `preset content overlaps controls: copy right ${copyBox.right}, controls x ${controlsBox.x}`)
  assert.ok(nameBox.width >= 250, `preset name input is too narrow: ${nameBox.width}`)
  assert.equal(await firstRow.locator('[data-preset-quantity]').inputValue(), '1')
  await firstRow.locator('[data-preset-quantity-inc]').click()
  assert.equal(await firstRow.locator('[data-preset-quantity]').inputValue(), '2')

  await page.locator('.modal-close').click()
  await page.getByRole('button', { name: 'Go to Control →' }).click()

  const videoCards = page.locator('.resource-card').filter({ hasText: 'Opening Video' })
  assert.equal(await videoCards.count(), 2)
  await videoCards.first().click()
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('.resource-card')].filter((node) => node.textContent.includes('Opening Video'))
    return cards.length === 2 && cards.every((node) => node.textContent.includes('PREVIEW'))
  }, null, { timeout: 5000 })

  console.log('PLAYWRIGHT repetition UI: PASS')
} finally {
  await browser.close()
}
