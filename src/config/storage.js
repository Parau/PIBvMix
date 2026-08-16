export const STORAGE_KEY = 'pibvmix:v2:config'
export function loadConfig(storage = localStorage) {
  try { const raw = storage.getItem(STORAGE_KEY); if (!raw) return null; const x = JSON.parse(raw); return x?.schemaVersion === 2 ? x : null } catch { return null }
}
export function saveConfig(config, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(config))
}
