const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function createMockModel() {
  return {
    version: '29.0.0.1', edition: 'Pro', presetName: 'PIBvMix Demo Production', active: 1, preview: 4,
    overlays: [{ number: 1, inputNumber: 7 }],
    inputs: [
      { key: 'cam-1', number: 1, type: 'Capture', title: 'Camera 1', shortTitle: 'Camera 1', layers: [], text: [] },
      { key: 'cam-2', number: 2, type: 'Capture', title: 'Camera 2', shortTitle: 'Camera 2', layers: [], text: [] },
      { key: 'video-1', number: 3, type: 'Video', title: 'Opening Video', shortTitle: 'Opening Video', layers: [], text: [] },
      { key: 'image-1', number: 4, type: 'Image', title: 'Company Logo', shortTitle: 'Company Logo', layers: [], text: [] },
      { key: 'lower-people', number: 5, type: 'GT', title: 'Lower Thirds.gtzip', shortTitle: 'Lower Thirds', layers: [], text: [
        { index: 0, name: 'Name.Text', value: 'John Smith' }, { index: 1, name: 'Role.Text', value: 'CEO' },
      ], presets: [['John Smith', 'CEO'], ['Maria Silva', 'CFO'], ['David Lee', 'CTO'], ['Ana Costa', 'Host']] },
      { key: 'lower-news', number: 6, type: 'GT', title: 'Announcement.gtzip', shortTitle: 'Announcement', layers: [], text: [{ index: 0, name: 'Headline.Text', value: 'Breaking News' }], presets: [['Breaking News'], ['Coming Up Next'], ['Thank You']] },
      { key: 'composition', number: 7, type: 'Mix', title: 'Program Composition', shortTitle: 'Program Composition', layers: [{ index: 0, key: 'lower-news' }], text: [] },
      { key: 'cam-wide', number: 8, type: 'Capture', title: 'Stage Wide', shortTitle: 'Stage Wide', layers: [], text: [] },
      { key: 'video-2', number: 9, type: 'Video', title: 'Interview VT', shortTitle: 'Interview VT', layers: [], text: [] },
      { key: 'image-2', number: 10, type: 'Image', title: 'Event Logo', shortTitle: 'Event Logo', layers: [], text: [] },
    ],
  }
}

export function modelToXml(model) {
  const inputs = model.inputs.map((i) => `<input key="${esc(i.key)}" number="${i.number}" type="${esc(i.type)}" title="${esc(i.title)}" shortTitle="${esc(i.shortTitle)}" state="Running">${
    (i.layers || []).map((l) => `<overlay index="${l.index}" key="${esc(l.key)}" />`).join('')}${
    (i.text || []).map((t) => `<text index="${t.index}" name="${esc(t.name)}">${esc(t.value)}</text>`).join('')}</input>`).join('')
  const overlays = model.overlays.map((o) => `<overlay number="${o.number}">${o.inputNumber || ''}</overlay>`).join('')
  return `<?xml version="1.0" encoding="utf-8"?><vmix><version>${esc(model.version)}</version><edition>${esc(model.edition)}</edition><preset>${esc(model.presetName)}</preset><inputs>${inputs}</inputs><overlays>${overlays}</overlays><preview>${model.preview}</preview><active>${model.active}</active></vmix>`
}

export class MockVmixClient {
  constructor({ latencyMs = 45 } = {}) { this.target = 'mock://vmix'; this.model = createMockModel(); this.latencyMs = latencyMs; this.failNext = false }
  delay() { return new Promise((r) => setTimeout(r, this.latencyMs)) }
  async fetchState() { await this.delay(); if (this.failNext) { this.failNext = false; throw new Error('Simulated vMix network error') } return modelToXml(this.model) }
  async testConnection() { return this.fetchState() }
  async command(functionName, params = {}) {
    await this.delay()
    if (this.failNext) { this.failNext = false; throw new Error('Simulated vMix HTTP 500') }
    const inputRef = params.Input
    const input = this.model.inputs.find((x) => x.key === inputRef || x.number === Number(inputRef) || x.shortTitle === inputRef || x.title === inputRef)
    if (!input) throw new Error('vMix HTTP 500: input not found')
    if (functionName === 'PreviewInput') this.model.preview = input.number
    else if (functionName === 'SelectTitlePreset') {
      const index = Number(params.Value)
      const row = input.presets?.[index]
      if (!row) throw new Error('vMix HTTP 500: preset not found')
      input.text.forEach((field, i) => { field.value = row[i] ?? '' })
    } else throw new Error(`Unsupported mock command: ${functionName}`)
    return 'OK'
  }
}
