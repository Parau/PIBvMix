export function validateConfig(config) {
  if (config?.schemaVersion !== 2 || !Array.isArray(config.resources)) {
    throw new Error('Unsupported PIBvMix configuration.')
  }
  return config
}

export function downloadConfig(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pibvmix-config.json'; a.click(); URL.revokeObjectURL(a.href)
}

export async function readConfigFile(file) {
  if (file.size > 2_000_000) throw new Error('Configuration file is too large.')
  const parsed = JSON.parse(await file.text())
  return validateConfig(parsed)
}
