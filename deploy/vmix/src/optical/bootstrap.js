import { loadConfig, saveConfig } from '../config/storage.js?v=0.2.0'
import { validateConfig } from '../config/backup.js?v=0.3.5'
import { openOpticalExport } from '../ui/optical-export.js?v=0.3.5'
import { openOpticalImport } from '../ui/optical-import.js?v=0.3.5'

function opticalHost(root) { return root.querySelector('#modal-root') }

function enhanceBackupMenus(root) {
  const actions = root.querySelector('.backup-actions')
  if (!actions || actions.dataset.opticalEnhanced === '1') return
  const exportFile = actions.querySelector('[data-action="export"]')
  const importFile = actions.querySelector('.file-label')
  if (!exportFile || !importFile) return
  actions.dataset.opticalEnhanced = '1'

  exportFile.classList.add('backup-menu-item')
  exportFile.textContent = 'Arquivo'
  const importInput = importFile.querySelector('input')
  importFile.classList.add('backup-menu-item')
  importFile.textContent = 'Arquivo'
  if (importInput) importFile.append(importInput)

  const exportMenu = document.createElement('details')
  exportMenu.className = 'backup-menu'
  exportMenu.innerHTML = '<summary class="btn ghost">Export ▾</summary><div class="backup-menu-popover"></div>'
  exportMenu.querySelector('.backup-menu-popover').append(exportFile)
  const opticalExport = document.createElement('button')
  opticalExport.className = 'btn ghost backup-menu-item'
  opticalExport.type = 'button'
  opticalExport.dataset.opticalExport = '1'
  opticalExport.textContent = 'Transferência óptica'
  exportMenu.querySelector('.backup-menu-popover').append(opticalExport)

  const importMenu = document.createElement('details')
  importMenu.className = 'backup-menu'
  importMenu.innerHTML = '<summary class="btn ghost">Import ▾</summary><div class="backup-menu-popover"></div>'
  importMenu.querySelector('.backup-menu-popover').append(importFile)
  const opticalImport = document.createElement('button')
  opticalImport.className = 'btn ghost backup-menu-item'
  opticalImport.type = 'button'
  opticalImport.dataset.opticalImport = '1'
  opticalImport.textContent = 'Transferência óptica'
  importMenu.querySelector('.backup-menu-popover').append(opticalImport)

  actions.append(exportMenu, importMenu)

  opticalExport.addEventListener('click', async () => {
    exportMenu.open = false
    const host = opticalHost(root)
    const config = loadConfig()
    if (!host || !config) {
      console.error('[PIBvMix][optical] export failed: no persisted configuration')
      return
    }
    await openOpticalExport(host, config)
  })

  opticalImport.addEventListener('click', async () => {
    importMenu.open = false
    const host = opticalHost(root)
    if (!host) return
    await openOpticalImport(host, {
      validateConfig,
      onImport: async (config) => {
        const validated = validateConfig(config)
        saveConfig(validated)
        location.reload()
      },
    })
  })
}

const root = document.querySelector('#app')
if (root) {
  const observer = new MutationObserver(() => enhanceBackupMenus(root))
  observer.observe(root, { childList: true, subtree: true })
  enhanceBackupMenus(root)
}
