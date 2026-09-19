import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:4173'
const key = 'pibvmix:ui:control-view'
let browser, page
const errors = []
before(async () => {
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/tests/control-view.html`)
  await page.locator('.resource-card').first().waitFor()
})
after(async () => { await browser?.close() })
const choose = (option, value) => page.locator(`[data-view-option="${option}"][data-view-value="${value}"]`).click()
const columns = () => page.locator('.resource-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)
const viewport = (width) => page.setViewportSize({ width, height: 900 })
const chromeToggle = () => page.locator('[data-action="toggle-chrome"]')
const textMetrics = () => page.locator('.resource-copy strong').first().evaluate((node) => {
  const style = getComputedStyle(node)
  return { whiteSpace: style.whiteSpace, clamp: style.webkitLineClamp, height: node.getBoundingClientRect().height,
    lineHeight: parseFloat(style.lineHeight), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
    clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }
})

test('visible version is v0.3.7 and Control starts expanded', async () => {
  assert.equal(await page.locator('.brand-version').textContent(), 'v0.3.7')
  assert.equal(await page.locator('.control-tools').count(), 1)
  assert.ok(await page.locator('.control-tools').isVisible())
  assert.equal(await chromeToggle().getAttribute('aria-expanded'), 'true')
  assert.equal(await chromeToggle().getAttribute('aria-label'), 'Ocultar controles da tela')
})
test('collapsed chrome removes toolbar space and remains accessible at every viewport', async () => {
  await viewport(800)
  const expandedHeader = await page.locator('.control-topbar').boundingBox()
  const expandedCard = await page.locator('.resource-card').first().boundingBox()
  await page.screenshot({ path: 'control-view-tablet-expanded.png' })
  await chromeToggle().click()
  const collapsedHeader = await page.locator('.control-topbar').boundingBox()
  const collapsedCard = await page.locator('.resource-card').first().boundingBox()
  assert.equal(await page.locator('.control-tools').evaluate((node) => getComputedStyle(node).display), 'none')
  assert.ok(collapsedHeader.height <= 40 && collapsedHeader.height < expandedHeader.height)
  assert.ok(collapsedCard.y < expandedCard.y - 100, `card moved from ${expandedCard.y} to ${collapsedCard.y}`)
  assert.ok(collapsedCard.y >= collapsedHeader.y + collapsedHeader.height, 'first card is not under topbar')
  assert.ok(collapsedCard.y - (collapsedHeader.y + collapsedHeader.height) <= 5, 'no phantom topbar/toolbar offset')
  assert.equal(await chromeToggle().getAttribute('aria-expanded'), 'false')
  await page.screenshot({ path: 'control-view-tablet-collapsed.png' })
  for (const width of [1280, 800, 390]) {
    await viewport(width)
    assert.ok(await chromeToggle().isVisible(), `toggle visible at ${width}px`)
    const box = await chromeToggle().boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= width, `toggle fits at ${width}px`)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}px`)
  }
  await viewport(390); await page.screenshot({ path: 'control-view-phone-collapsed.png' })
  await chromeToggle().click()
  assert.ok(await page.locator('.control-tools').isVisible())
  assert.equal(await chromeToggle().getAttribute('aria-expanded'), 'true')
})
for (const [width, expected] of [[1280, 3], [1050, 2], [800, 2], [681, 2], [680, 1], [390, 1]]) {
  test(`Auto at ${width}px uses ${expected} columns`, async () => {
    await choose('columns', 'auto'); await viewport(width)
    assert.equal(await columns(), expected)
  })
}
for (const count of [1, 2, 3]) {
  test(`manual ${count} columns overrides Auto on tablet and phone`, async () => {
    for (const width of [800, 390]) {
      await viewport(width); await choose('columns', String(count))
      assert.equal(await columns(), count)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow')
    }
  })
}
test('view and collapsed chrome preferences survive rerender and reload, without changing configuration', async () => {
  await viewport(800)
  const before = await page.evaluate(() => JSON.stringify(window.fixtureConfig))
  await choose('columns', '1'); await choose('size', 'large'); await choose('text', 'full')
  await chromeToggle().click()
  await page.evaluate(() => window.rerender())
  assert.equal(await page.evaluate(() => JSON.stringify(window.fixtureConfig)), before)
  assert.equal(await chromeToggle().getAttribute('aria-expanded'), 'false')
  assert.equal(await page.locator('.control-tools').evaluate((node) => getComputedStyle(node).display), 'none')
  await page.reload(); await page.locator('.resource-card').first().waitFor()
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key), { columns: '1', size: 'large', text: 'full', chrome: 'collapsed' })
  assert.equal(await chromeToggle().getAttribute('aria-expanded'), 'false')
  await chromeToggle().click()
  for (const [option, value] of [['columns', '1'], ['size', 'large'], ['text', 'full']]) {
    assert.equal(await page.locator(`[data-view-option="${option}"][data-view-value="${value}"]`).getAttribute('aria-pressed'), 'true')
  }
  assert.equal(await columns(), 1)
})
test('phone layout accommodates wider system font metrics', async () => {
  await viewport(390)
  await page.evaluate(() => { document.documentElement.style.fontFamily = 'Verdana, sans-serif' })
  try {
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('body *')].filter((node) => node.getBoundingClientRect().right > innerWidth).slice(0, 5).map((node) => node.className) }))
    assert.ok(overflow.width <= 390, JSON.stringify(overflow))
    const edit = await page.locator('[data-action="configure"]').boundingBox()
    assert.ok(edit.x + edit.width <= 390)
  } finally {
    await page.evaluate(() => document.documentElement.style.removeProperty('font-family'))
    await viewport(800)
  }
})
test('Compacto, Normal and Grande change actual card dimensions', async () => {
  await choose('text', 'single')
  const dimensions = []
  for (const size of ['compact', 'normal', 'large']) {
    await choose('size', size)
    dimensions.push(await page.locator('.resource-card').first().evaluate((node) => ({
      height: node.getBoundingClientRect().height, padding: parseFloat(getComputedStyle(node).paddingTop),
      icon: node.querySelector('.resource-symbol').getBoundingClientRect().width,
      font: parseFloat(getComputedStyle(node.querySelector('strong')).fontSize),
    })))
  }
  for (const metric of ['height', 'padding', 'icon', 'font']) {
    assert.ok(dimensions[0][metric] < dimensions[1][metric] && dimensions[1][metric] < dimensions[2][metric], metric)
  }
  assert.ok(dimensions[0].height >= 78)
})
test('1 linha truncates a genuinely long label', async () => {
  await choose('size', 'normal'); await choose('text', 'single')
  const m = await textMetrics()
  assert.equal(m.whiteSpace, 'nowrap'); assert.ok(m.scrollWidth > m.clientWidth)
  assert.ok(Math.abs(m.height - m.lineHeight) < 1)
})
test('2 linhas wraps and clamps after exactly two lines', async () => {
  await choose('text', 'double')
  const m = await textMetrics()
  assert.equal(m.whiteSpace, 'normal'); assert.equal(m.clamp, '2')
  assert.ok(Math.abs(m.height - 2 * m.lineHeight) < 1)
  assert.ok(m.scrollHeight > m.clientHeight)
})
test('Completo wraps freely and grows the card', async () => {
  const before = await page.locator('.resource-card').first().boundingBox()
  await choose('text', 'full')
  const m = await textMetrics()
  assert.equal(m.whiteSpace, 'normal'); assert.equal(m.clamp, 'none')
  assert.ok(m.height > 2 * m.lineHeight); assert.ok(m.scrollWidth <= m.clientWidth + 1)
  assert.ok((await page.locator('.resource-card').first().boundingBox()).height > before.height)
})
test('toolbar stays at 64px below the topbar during scroll', async () => {
  await page.evaluate(() => scrollTo(0, 1000))
  await page.waitForFunction(() => scrollY >= 1000)
  const bounds = await page.locator('.control-tools').boundingBox()
  const header = await page.locator('.control-topbar').boundingBox()
  assert.equal(Math.round(bounds.y), 64); assert.equal(Math.round(header.y + header.height), 64)
  assert.equal(await page.locator('.control-tools').evaluate((node) => getComputedStyle(node).position), 'sticky')
  await page.screenshot({ path: process.env.CONTROL_VIEW_SCREENSHOT || 'control-view-tablet.png' })
  await page.evaluate(() => scrollTo(0, 0))
})
test('grid uses row-major DOM order', async () => {
  await choose('text', 'single'); await choose('columns', '2')
  const boxes = await page.locator('.resource-card').evaluateAll((nodes) => nodes.slice(0, 4).map((node) => ({ id: node.dataset.resource, x: node.offsetLeft, y: node.offsetTop })))
  assert.deepEqual(boxes.map((b) => b.id), ['long-0', 'long-1', 'long-2', 'long-3'])
  assert.equal(boxes[0].y, boxes[1].y); assert.ok(boxes[0].x < boxes[1].x); assert.ok(boxes[2].y > boxes[0].y)
})
test('production app sends resource and updates PREVIEW after changing view', async () => {
  await page.goto(`${base}/?demo=1`)
  await page.locator('.connection-chip.connected').waitFor()
  assert.equal(await page.locator('.brand-version').textContent(), 'v0.3.7')
  await page.getByRole('button', { name: 'Go to Control →' }).click()
  await choose('columns', '1'); await choose('text', 'full')
  await page.locator('.resource-card').filter({ hasText: 'Opening Video' }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.resource-card')].some((node) => node.textContent.includes('Opening Video') && node.classList.contains('preview')))
  assert.ok(await page.locator('.resource-card.program').count() > 0)
})
for (const [fixture, current, target] of [['control-program-swap.html', 'person-1', 'person-2'], ['control-swap.html', 'john', 'maria'], ['control-effective.html', 'current', 'next']]) {
  test(`CURRENT, ON AIR and SWAP remain usable: ${fixture}`, async () => {
    await page.goto(`${base}/tests/${fixture}`)
    await page.locator(`[data-blocked-resource="${current}"]`).waitFor()
    await choose('columns', '3'); await choose('size', 'compact'); await choose('text', 'double')
    const currentCard = page.locator(`[data-blocked-resource="${current}"]`)
    assert.equal(await currentCard.locator('.current').count(), 1)
    assert.equal(await currentCard.locator('.onair').count(), 1)
    assert.equal(await currentCard.locator('[data-swap-resource]').count(), 0)
    await page.locator(`[data-swap-resource="${target}"]`).click()
    assert.deepEqual(await page.evaluate(() => window.calls), [['swap', target]])
  })
}
test('malformed preferences fall back safely and unavailable storage retains in-memory choices', async () => {
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), key)
  await page.goto(`${base}/tests/control-view.html`)
  await page.locator('.resource-card').first().waitFor()
  assert.equal(await page.locator('.control-main').getAttribute('data-columns'), 'auto')
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('storage denied') } })
  await choose('columns', '1'); await page.evaluate(() => window.rerender())
  assert.equal(await columns(), 1)
  assert.deepEqual(errors, [])
})
