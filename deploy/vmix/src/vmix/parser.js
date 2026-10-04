function text(el, selector, fallback = '') { return el.querySelector(selector)?.textContent ?? fallback }
function attr(el, name, fallback = '') { return el?.getAttribute(name) ?? fallback }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback }

export function parseVmixXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Invalid vMix XML response.')
  const root = doc.querySelector('vmix')
  if (!root) throw new Error('Response is not a vMix API document.')

  const inputs = [...root.querySelectorAll(':scope > inputs > input')].map((el) => ({
    key: attr(el, 'key'), number: num(attr(el, 'number')), type: attr(el, 'type'),
    title: attr(el, 'title'), shortTitle: attr(el, 'shortTitle'), state: attr(el, 'state'),
    text: [...el.querySelectorAll(':scope > text')].map((t) => ({ index: num(attr(t, 'index')), name: attr(t, 'name'), value: t.textContent ?? '' })),
    image: [...el.querySelectorAll(':scope > image')].map((t) => ({ index: num(attr(t, 'index')), name: attr(t, 'name'), value: t.textContent ?? '' })),
    color: [...el.querySelectorAll(':scope > color')].map((t) => ({ index: num(attr(t, 'index')), name: attr(t, 'name'), value: t.textContent ?? '' })),
    layers: [...el.querySelectorAll(':scope > overlay')].filter((x) => attr(x, 'key')).map((x) => ({ index: num(attr(x, 'index')), key: attr(x, 'key') })),
  }))
  const inputByKey = Object.fromEntries(inputs.map((x) => [x.key, x]))
  const inputKeyByNumber = Object.fromEntries(inputs.map((x) => [x.number, x.key]))
  const programNumber = num(text(root, ':scope > active'))
  const previewNumber = num(text(root, ':scope > preview'))
  const overlays = [...root.querySelectorAll(':scope > overlays > overlay')].map((el) => ({
    number: num(attr(el, 'number')), preview: attr(el, 'preview') === 'True' || attr(el, 'preview') === 'true', inputNumber: num(el.textContent, 0), inputKey: inputKeyByNumber[num(el.textContent, 0)] || null,
  }))
  const additionalMixes = [...root.querySelectorAll(':scope > mix')].map((el) => ({
    number: num(attr(el, 'number')), programNumber: num(text(el, ':scope > active')), previewNumber: num(text(el, ':scope > preview')),
  }))
  return {
    version: text(root, ':scope > version'), edition: text(root, ':scope > edition'), presetName: text(root, ':scope > preset'),
    inputs, inputByKey, inputKeyByNumber,
    mainMix: { programNumber, programKey: inputKeyByNumber[programNumber] || null, previewNumber, previewKey: inputKeyByNumber[previewNumber] || null },
    overlays, additionalMixes, rawXml: xmlText,
  }
}
