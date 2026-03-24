const { contextBridge, ipcRenderer } = require('electron')

const SERVICE_HOSTS = new Set([
  'music.apple.com',
  'open.spotify.com',
  'music.youtube.com',
  'listen.tidal.com',
  'www.deezer.com',
])

const isServiceContext = SERVICE_HOSTS.has(window.location.hostname)

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

let _pollTimer = null
let _pollInFlight = false
let _pollIntervalMs = 2500

function stopPolling() {
  if (_pollTimer) {
    clearTimeout(_pollTimer)
    _pollTimer = null
  }
}

function schedulePolling() {
  stopPolling()
  _pollTimer = setTimeout(runPollingTick, _pollIntervalMs)
}

function runPollingTick() {
  if (_pollInFlight) {
    schedulePolling()
    return
  }

  _pollInFlight = true
  try {
    const data = readMediaSession()
    if (data?.title) ipcRenderer.send('media:update', data)
  } catch (_) {
  } finally {
    _pollInFlight = false
    schedulePolling()
  }
}

function startPolling() {
  if (!isServiceContext || _pollTimer) return
  schedulePolling()
}

function handleVisibilityMode() {
  _pollIntervalMs = document.hidden ? 5000 : 2500
  if (isServiceContext) schedulePolling()
}

if (isServiceContext) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPolling, { once: true })
  } else {
    startPolling()
  }

  document.addEventListener('visibilitychange', handleVisibilityMode)

  ipcRenderer.removeAllListeners('melo:polling-mode')
  ipcRenderer.on('melo:polling-mode', (_e, mode) => {
    _pollIntervalMs = mode === 'background' ? 5000 : 2500
    schedulePolling()
  })

  window.addEventListener('beforeunload', () => {
    stopPolling()
    ipcRenderer.removeAllListeners('melo:polling-mode')
  })
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
  setVolume: (vol) => {
    ipcRenderer.send('player:volume', vol)
  },
  seek: (positionSeconds) => {
    ipcRenderer.send('player:seek', positionSeconds)
  },
  getProgress: () => {
    return ipcRenderer.invoke('player:getProgress')
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
  getLastService: () => {
    return ipcRenderer.invoke('services:getLast')
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
  network: {
    getStatus: () => ipcRenderer.invoke('network:status'),
    onChange: (cb) => ipcRenderer.on('network:status', (_e, data) => cb(data)),
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
  sleep: {
    set: (opts) => ipcRenderer.invoke('sleep:set', opts),
    cancel: () => ipcRenderer.invoke('sleep:cancel'),
    status: () => ipcRenderer.invoke('sleep:status'),
    onTriggered: (cb) => ipcRenderer.on('sleep:triggered', cb),
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
