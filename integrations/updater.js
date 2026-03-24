const { app, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

let mainWindowRef = null
let updaterInitialized = false

function send(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data)
  }
}

function setupAutoUpdater(mainWindow) {
  mainWindowRef = mainWindow
  if (!app.isPackaged) return
  if (updaterInitialized) return
  updaterInitialized = true

  // Configura descarga e instalacion automatica al cerrar la app.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send('update:checking'))
  autoUpdater.on('update-available', (info) => send('update:available', info))
  autoUpdater.on('update-not-available', () => send('update:not-available'))
  autoUpdater.on('download-progress', (p) => send('update:progress', p))
  autoUpdater.on('update-downloaded', (info) => send('update:downloaded', info))
  autoUpdater.on('error', (err) => send('update:error', err?.message || 'error'))

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }, 3000)

  ipcMain.handle('update:check', () => {
    return autoUpdater.checkForUpdatesAndNotify().catch(() => null)
  })

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
    return true
  })
}

module.exports = { setupAutoUpdater }
