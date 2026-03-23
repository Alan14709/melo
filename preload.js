const { contextBridge, ipcRenderer } = require('electron')

// Leer Media Session en modo solo-lectura.
function readMediaSession() {
  try {
    const meta = navigator.mediaSession?.metadata
    return {
      title: meta?.title ?? null,
      artist: meta?.artist ?? null,
      album: meta?.album ?? null,
      artwork: meta?.artwork?.[0]?.src ?? null,
      state: navigator.mediaSession?.playbackState ?? 'none',
    }
  } catch {
    return null
  }
}

// Polling cada 800ms para enviar metadata al proceso principal.
let _poll = null
function startPolling() {
  if (_poll) return
  _poll = setInterval(() => {
    try {
      const data = readMediaSession()
      if (data?.title) ipcRenderer.send('media:update', data)
    } catch (_) {}
  }, 800)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPolling)
} else {
  startPolling()
}

contextBridge.exposeInMainWorld('melo', {
  onMediaUpdate: (cb) => {
    ipcRenderer.on('media:update', (_e, data) => cb(data))
  },
  onServiceActive: (cb) => {
    ipcRenderer.on('service:active', (_e, data) => cb(data))
  },
  playerAction: (action) => {
    ipcRenderer.send('player:action', action)
  },
  switchService: (serviceId, url, service) => {
    ipcRenderer.send('service:switch', { serviceId, url, service })
  },
  hideBrowserView: () => {
    ipcRenderer.send('browserview:hide')
  },
  showBrowserView: () => {
    ipcRenderer.send('browserview:show')
  },
  miniToggle: () => {
    ipcRenderer.send('mini:toggle')
  },
  getConnectedServices: () => {
    return ipcRenderer.invoke('services:connected')
  },
  debugButtons: () => {
    return ipcRenderer.invoke('debug:buttons')
  },
  discordToggle: (enabled, clientId) => {
    return ipcRenderer.invoke('discord:toggle', { enabled, clientId })
  },
  discordStatus: () => {
    return ipcRenderer.invoke('discord:status')
  },
  lastfmConfigure: (cfg) => {
    return ipcRenderer.invoke('lastfm:configure', cfg)
  },
  lastfmAuth: () => {
    return ipcRenderer.invoke('lastfm:auth')
  },
  lastfmGetSession: (token) => {
    return ipcRenderer.invoke('lastfm:getSession', token)
  },
  getSettings: () => {
    return ipcRenderer.invoke('settings:get')
  },
  saveSettings: (key, value) => {
    return ipcRenderer.invoke('settings:save', { key, value })
  },
  stats: {
    getHistory: (opts) => ipcRenderer.invoke('stats:getHistory', opts),
    getSummary: () => ipcRenderer.invoke('stats:getSummary'),
    getWrapped: (range) => ipcRenderer.invoke('stats:getWrapped', range),
    export: () => ipcRenderer.invoke('stats:export'),
    clear: () => ipcRenderer.invoke('stats:clear'),
  },
  update: {
    onChecking: (cb) => ipcRenderer.on('update:checking', cb),
    onAvailable: (cb) => ipcRenderer.on('update:available', (_e, d) => cb(d)),
    onNotAvailable: (cb) => ipcRenderer.on('update:not-available', cb),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_e, d) => cb(d)),
    onDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, d) => cb(d)),
    onError: (cb) => ipcRenderer.on('update:error', (_e, d) => cb(d)),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
  },
  windowAction: (action) => {
    return ipcRenderer.invoke('window:action', action)
  },
  notify: (opts) => {
    return ipcRenderer.invoke('notification:show', opts)
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
})
