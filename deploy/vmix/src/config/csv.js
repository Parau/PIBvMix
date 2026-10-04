export function parseCsv(text) {
  let src = String(text ?? '')
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1)
  const rows = []; let row = []; let cell = ''; let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else {
      if (ch === '"') quoted = true
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); if (row.some((x) => x !== '')) rows.push(row); row = []; cell = '' }
      else cell += ch
    }
  }
  if (quoted) throw new Error('Unclosed quoted field in CSV.')
  row.push(cell.replace(/\r$/, ''))
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

export function labelForRow(row, index) {
  const useful = row.map((x) => String(x).trim()).filter(Boolean)
  return useful.length ? useful.slice(0, 2).join(' — ') : `Preset ${index}`
}

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
