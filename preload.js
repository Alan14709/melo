const { contextBridge, ipcRenderer } = require('electron')

const isValidChannel = (channel) => typeof channel === 'string' && channel.trim().length > 0
const DEBUG_BRIDGE_ENABLED = process.env.MELO_DISABLE_DEBUG_IPC !== '1'
  && (process.env.MELO_ENABLE_DEBUG_IPC === '1' || process.defaultApp === true)
const REMOVE_ALL_LISTENERS_ALLOWLIST = new Set([
  'melo:polling-mode',
])

function subscribeIpc(channel, listener) {
  if (!isValidChannel(channel) || typeof listener !== 'function') {
    return () => {}
  }

  ipcRenderer.on(channel, listener)
  return () => {
    try {
      ipcRenderer.removeListener(channel, listener)
    } catch (_) {}
  }
}

function safeRemoveAllListeners(channel) {
  if (!isValidChannel(channel)) return false
  if (!REMOVE_ALL_LISTENERS_ALLOWLIST.has(channel)) {
    reportError(new Error(`remove_all_listeners_blocked:${channel}`), 'preload.removeAllListeners')
    return false
  }

  try {
    ipcRenderer.removeAllListeners(channel)
    return true
  } catch (_) {
    return false
  }
}

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
let _pollMode = 'foreground'
let _lastPlaybackState = 'unknown'

function computePollIntervalMs() {
  const inBackground = _pollMode === 'background' || document.hidden
  if (inBackground) return 6500

  if (_lastPlaybackState === 'playing') return 2200
  if (_lastPlaybackState === 'paused') return 3800
  return 5000
}

function stopPolling() {
  if (_pollTimer) {
    clearTimeout(_pollTimer)
    _pollTimer = null
  }
}

function schedulePolling() {
  stopPolling()
  _pollIntervalMs = computePollIntervalMs()
  // Pequeño jitter para evitar picos sincronizados entre vistas/procesos.
  const jitterMs = Math.floor(Math.random() * 240)
  _pollTimer = setTimeout(runPollingTick, _pollIntervalMs + jitterMs)
}

function runPollingTick() {
  if (_pollInFlight) {
    schedulePolling()
    return
  }

  _pollInFlight = true
  try {
    const data = readMediaSession()
    _lastPlaybackState = String(data?.state || 'unknown')
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
    _pollMode = 'background'
    stopPolling()
    return
  }
  _pollMode = 'foreground'
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
    _pollMode = mode === 'background' ? 'background' : 'foreground'
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
    const listener = (_e, data) => {
      // Actualizar metadata tambien desde el listener de renderer.
      updateMediaSessionMetadata(data)
      cb(data)
    }
    return subscribeIpc('media:update', listener)
  },
  onServiceActive: (cb) => {
    return subscribeIpc('service:active', (_e, data) => cb(data))
  },
  onCommandPaletteToggle: (cb) => {
    return subscribeIpc('command-palette:toggle', (_e, data) => cb(data))
  },
  onShortcut: (cb) => {
    return subscribeIpc('shortcut:event', (_e, data) => cb(data))
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
    if (process.env.NODE_ENV !== 'production') {
      console.log('SWITCH SERVICE CALLED', { serviceId, url })
    }
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
  ...(DEBUG_BRIDGE_ENABLED ? {
    debugButtons: () => {
      return safeInvoke('debug:buttons')
    },
    debug: {
      getMetrics: () => safeInvoke('debug:metrics'),
      onMetricsUpdate: (cb) => subscribeIpc('metrics:update', (_e, data) => cb(data)),
      getHealth: () => safeInvoke('debug:health'),
      crashView: (serviceId) => safeInvoke('debug:crash-view', { serviceId }),
      validateLoadCancellation: () => safeInvoke('debug:validate-load-cancellation'),
      validateHealth: () => safeInvoke('debug:validate-health'),
      runStress: (opts) => safeInvoke('debug:run-stress', opts),
      runSmoke: () => safeInvoke('debug:run-smoke'),
    },
  } : {}),
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
  notification: {
    show: ({ title, body, silent = true } = {}) => {
      return safeInvoke('notification:show', { title, body, silent })
    },
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
    onChange: (cb) => subscribeIpc('network:status', (_e, data) => cb(data)),
  },
  health: {
    getStatus: () => safeInvoke('health:get-status'),
    onChange: (cb) => subscribeIpc('health:status', (_e, data) => cb(data)),
  },
  fallback: {
    getStatus: () => safeInvoke('fallback:status'),
    onChange: (cb) => subscribeIpc('fallback:status', (_e, data) => cb(data)),
    retryManual: () => safeInvoke('fallback:retry-manual'),
    safeMode: () => safeInvoke('fallback:safe-mode'),
  },
  gpuInfo: {
    getStatus: () => safeInvoke('gpu:info'),
    onChange: (cb) => subscribeIpc('gpu:status', (_e, data) => cb(data)),
  },
  update: {
    onChecking: (cb) => subscribeIpc('update:checking', cb),
    onAvailable: (cb) => subscribeIpc('update:available', (_e, d) => cb(d)),
    onNotAvailable: (cb) => subscribeIpc('update:not-available', cb),
    onProgress: (cb) => subscribeIpc('update:progress', (_e, d) => cb(d)),
    onDownloaded: (cb) => subscribeIpc('update:downloaded', (_e, d) => cb(d)),
    onError: (cb) => subscribeIpc('update:error', (_e, d) => cb(d)),
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
    return safeRemoveAllListeners(channel)
  }
})
