const { contextBridge, ipcRenderer } = require('electron')

const isValidChannel = (channel) => typeof channel === 'string' && channel.trim().length > 0

function normalizeBridgeError(error, origin) {
  return {
    message: error?.message || String(error || 'unknown_error'),
    stack: error?.stack || null,
    origin,
    timestamp: new Date().toISOString(),
  }
}

function reportError(error, origin = 'preload') {
  try {
    ipcRenderer.send('melo:reportError', { error: normalizeBridgeError(error, origin), origin })
  } catch (_) {}
}

// Wrapper seguro para invocaciones IPC con manejo uniforme de errores.
const safeInvoke = async (channel, ...args) => {
  if (!isValidChannel(channel)) return null
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (err) {
    console.error(`[Preload] Error en ${channel}:`, err.message)
    reportError(err, `invoke:${channel}`)
    return null
  }
}

// Wrapper seguro para envios IPC fire-and-forget.
const safeSend = (channel, ...args) => {
  if (!isValidChannel(channel)) return
  try {
    ipcRenderer.send(channel, ...args)
  } catch (err) {
    console.error(`[Preload] Error enviando ${channel}:`, err.message)
    reportError(err, `send:${channel}`)
  }
}

const SERVICE_HOSTS = new Set([
  'music.apple.com',
  'open.spotify.com',
  'music.youtube.com',
  'listen.tidal.com',
  'www.deezer.com',
])

const isServiceContext = SERVICE_HOSTS.has(window.location.hostname)

// Configurar Media Session para controles multimedia del sistema operativo.
function setupMediaSession() {
  safeSend('health:mediaSession', { available: Boolean(navigator.mediaSession) })
  if (!navigator.mediaSession) return

  const handlers = {
    play: () => safeSend('player:action', 'play'),
    pause: () => safeSend('player:action', 'play'),
    nexttrack: () => safeSend('player:action', 'next'),
    previoustrack: () => safeSend('player:action', 'previous'),
    seekto: (details) => {
      if (details?.seekTime != null) {
        safeSend('player:seek-to', details.seekTime)
      }
    },
  }

  Object.entries(handlers).forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch (_) {}
  })
}

// Actualizar metadata del sistema cuando cambia la cancion.
function updateMediaSessionMetadata({ title, artist, album, artwork } = {}) {
  if (!navigator.mediaSession) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Melo',
      artist: artist || '',
      album: album || '',
      artwork: artwork ? [{ src: artwork }] : [],
    })
  } catch (_) {}
}

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
    if (data?.title) safeSend('media:update', data)
  } catch (_) {
  } finally {
    _pollInFlight = false
    schedulePolling()
  }
}

// Inicializar Media Session cuando el DOM esta listo.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMediaSession, { once: true })
} else {
  setupMediaSession()
}

// Mantener metadata del sistema sincronizada al recibir updates del main.
ipcRenderer.on('media:update', (_e, data) => {
  if (!data?.title) return
  updateMediaSessionMetadata(data)
})

function startPolling() {
  if (!isServiceContext || _pollTimer) return
  schedulePolling()
}

function handleVisibilityMode() {
  // Reducir consumo: detener polling al quedar inactivo y reanudar al volver.
  if (document.hidden) {
    stopPolling()
    return
  }
  _pollIntervalMs = 2500
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

// Captura global de errores de renderer para enviarlos al proceso main.
window.onerror = (_message, _source, _lineno, _colno, error) => {
  const nextError = error || new Error('window_onerror_without_error_object')
  if (window.melo?.reportError) window.melo.reportError(nextError)
  else reportError(nextError, 'window.onerror')
}

window.onunhandledrejection = (event) => {
  const nextError = event?.reason || new Error('unhandled_rejection_without_reason')
  if (window.melo?.reportError) window.melo.reportError(nextError)
  else reportError(nextError, 'window.onunhandledrejection')
}

contextBridge.exposeInMainWorld('melo', {
  // API explicita para reportar errores desde UI de forma segura.
  reportError: (error) => {
    reportError(error, 'renderer_bridge')
  },
  onMediaUpdate: (cb) => {
    ipcRenderer.on('media:update', (_e, data) => {
      // Actualizar metadata tambien desde el listener de renderer.
      updateMediaSessionMetadata(data)
      cb(data)
    })
  },
  onServiceActive: (cb) => {
    ipcRenderer.on('service:active', (_e, data) => cb(data))
  },
  playerAction: (action) => {
    safeSend('player:action', action)
  },
  setVolume: (vol) => {
    safeSend('player:volume', vol)
  },
  seek: (positionSeconds) => {
    safeSend('player:seek', positionSeconds)
  },
  getProgress: () => {
    return safeInvoke('player:getProgress')
  },
  switchService: (serviceId, url, service) => {
    safeSend('service:switch', { serviceId, url, service })
  },
  hideBrowserView: () => {
    safeSend('browserview:hide')
  },
  showBrowserView: () => {
    safeSend('browserview:show')
  },
  miniToggle: () => {
    safeSend('mini:toggle')
  },
  getConnectedServices: () => {
    return safeInvoke('services:connected')
  },
  getLastService: () => {
    return safeInvoke('services:getLast')
  },
  debugButtons: () => {
    return safeInvoke('debug:buttons')
  },
  debug: {
    getMetrics: () => safeInvoke('debug:metrics'),
    onMetricsUpdate: (cb) => ipcRenderer.on('metrics:update', (_e, data) => cb(data)),
    getHealth: () => safeInvoke('debug:health'),
    crashView: (serviceId) => safeInvoke('debug:crash-view', { serviceId }),
    validateLoadCancellation: () => safeInvoke('debug:validate-load-cancellation'),
    validateHealth: () => safeInvoke('debug:validate-health'),
    runStress: (opts) => safeInvoke('debug:run-stress', opts),
    runSmoke: () => safeInvoke('debug:run-smoke'),
  },
  discordToggle: (enabled, clientId) => {
    return safeInvoke('discord:toggle', { enabled, clientId })
  },
  discordStatus: () => {
    return safeInvoke('discord:status')
  },
  lastfmConfigure: (cfg) => {
    return safeInvoke('lastfm:configure', cfg)
  },
  lastfmAuth: () => {
    return safeInvoke('lastfm:auth')
  },
  lastfmGetSession: (token) => {
    return safeInvoke('lastfm:getSession', token)
  },
  getSettings: () => {
    return safeInvoke('settings:get')
  },
  saveSettings: (key, value) => {
    return safeInvoke('settings:save', { key, value })
  },
  stats: {
    getHistory: (opts) => safeInvoke('stats:getHistory', opts),
    getSummary: () => safeInvoke('stats:getSummary'),
    getWrapped: (range) => safeInvoke('stats:getWrapped', range),
    export: () => safeInvoke('stats:export'),
    clear: () => safeInvoke('stats:clear'),
  },
  network: {
    getStatus: () => safeInvoke('network:status'),
    onChange: (cb) => ipcRenderer.on('network:status', (_e, data) => cb(data)),
  },
  health: {
    getStatus: () => safeInvoke('debug:health'),
    onChange: (cb) => ipcRenderer.on('health:status', (_e, data) => cb(data)),
  },
  fallback: {
    getStatus: () => safeInvoke('fallback:status'),
    onChange: (cb) => ipcRenderer.on('fallback:status', (_e, data) => cb(data)),
    retryManual: () => safeInvoke('fallback:retry-manual'),
    safeMode: () => safeInvoke('fallback:safe-mode'),
  },
  update: {
    onChecking: (cb) => ipcRenderer.on('update:checking', cb),
    onAvailable: (cb) => ipcRenderer.on('update:available', (_e, d) => cb(d)),
    onNotAvailable: (cb) => ipcRenderer.on('update:not-available', cb),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_e, d) => cb(d)),
    onDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, d) => cb(d)),
    onError: (cb) => ipcRenderer.on('update:error', (_e, d) => cb(d)),
    check: () => safeInvoke('update:check'),
    install: () => safeInvoke('update:install'),
  },
  windowAction: (action) => {
    return safeInvoke('window:action', action)
  },
  notify: (opts) => {
    return safeInvoke('notification:show', opts)
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
})
