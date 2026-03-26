const {
  app,
  components,
  BrowserWindow,
  BrowserView,
  ipcMain,
  globalShortcut,
  Notification,
  session,
  shell,
  Tray,
  Menu,
  dialog,
  nativeImage,
  net,
} = require('electron')
const path = require('path')
const fs = require('fs')
const Store = require('electron-store')
const discord = require('./integrations/discord')
const lastfm = require('./integrations/lastfm')
const { notifyTrackChange } = require('./integrations/notifications')
const { startMpris, stopMpris } = require('./integrations/mpris')
const { setupAutoUpdater } = require('./integrations/updater')
const { adapterManager } = require('./services/adapters/AdapterManager')
const { BrowserViewAdapter } = require('./services/adapters/BrowserViewAdapter')
const { playbackState } = require('./services/adapters/PlaybackState')
const { RetryManager } = require('./services/RetryManager')
const { HealthMonitor } = require('./services/HealthMonitor')
const {
  enableAutostart,
  disableAutostart,
} = require('./services/autostart')
const logger = require('./services/Logger')

// Modo debug de produccion activable por variable de entorno.
const DEBUG_MODE = process.env.DEBUG === '1' || process.env.DEBUG === 'true'
if (DEBUG_MODE) logger.setLevel('debug')

const RENDERER_FALLBACK_FLAGS = {
  gpu: '--melo-gpu-fallback',
  sandbox: '--melo-no-sandbox-fallback',
}
const rendererFallbackState = {
  relaunchScheduled: false,
}
const performanceMetrics = {
  appStartAt: Date.now(),
  mainWindowCreatedAt: null,
  rendererReadyAt: null,
  startupDurationMs: null,
  switchLatencyTotalMs: 0,
  switchLatencyMaxMs: 0,
  switchLatencySamples: 0,
  memorySamples: [],
}
const fallbackMetrics = {
  gpuFallbacksTriggered: 0,
  noSandboxFallbacksTriggered: 0,
  fallbackExhausted: 0,
  launchFailures: 0,
  launchSuccesses: 0,
  incidents: [],
  lastIncident: null,
}
const fallbackStatus = {
  phase: 'idle',
  stage: null,
  message: null,
  mitigated: false,
  updatedAt: new Date().toISOString(),
}

const SETTINGS_DEFAULTS = {
  mediaKeysEnabled: true,
  notificationsEnabled: true,
  statsEnabled: true,
  trayEnabled: true,
  closeBehavior: 'tray',
  autostartEnabled: false,
  startMinimized: true,
  immersiveEnabled: false,
  overlayControlsEnabled: true,
  overlayPosition: 'bottom',
  hasShownTrayHint: false,
}

const MEDIA_SHORTCUTS = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack']

function updateFallbackStatus(patch = {}) {
  Object.assign(fallbackStatus, patch, { updatedAt: new Date().toISOString() })
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('fallback:status', { ...fallbackStatus })
  }
}

function recordFallbackIncident(event, payload = {}) {
  const incident = {
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  }
  if (event === 'gpu_fallback_triggered') fallbackMetrics.gpuFallbacksTriggered += 1
  if (event === 'no_sandbox_fallback_triggered') fallbackMetrics.noSandboxFallbacksTriggered += 1
  if (event === 'fallback_exhausted') fallbackMetrics.fallbackExhausted += 1
  if (event === 'launch_failure') fallbackMetrics.launchFailures += 1
  if (event === 'launch_success') fallbackMetrics.launchSuccesses += 1

  fallbackMetrics.lastIncident = incident
  fallbackMetrics.incidents.push(incident)
  if (fallbackMetrics.incidents.length > 80) {
    fallbackMetrics.incidents.shift()
  }

  healthMonitor?.recordRendererEvent?.(event, payload)
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function getRuntimeDiagnostics(extra = {}) {
  return {
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    packaged: app.isPackaged,
    sessionType: process.env.XDG_SESSION_TYPE || '',
    display: process.env.DISPLAY || '',
    waylandDisplay: process.env.WAYLAND_DISPLAY || '',
    xdgRuntimeDir: process.env.XDG_RUNTIME_DIR || '',
    gpuFallbackActive: hasFlag(RENDERER_FALLBACK_FLAGS.gpu) || process.env.MELO_GPU_FALLBACK === '1',
    sandboxFallbackActive: hasFlag(RENDERER_FALLBACK_FLAGS.sandbox) || process.env.MELO_NO_SANDBOX_FALLBACK === '1',
    linuxCompatMode: process.env.MELO_LINUX_COMPAT_MODE === '1',
    argv: process.argv,
    ...extra,
  }
}

function scheduleRendererFallbackRelaunch(source, details = {}) {
  const reason = details?.reason || 'unknown'
  if (reason !== 'launch-failed') return false
  if (rendererFallbackState.relaunchScheduled) return false

  const args = process.argv.slice(1)
  const hasGpuFallback = hasFlag(RENDERER_FALLBACK_FLAGS.gpu)
  const hasSandboxFallback = hasFlag(RENDERER_FALLBACK_FLAGS.sandbox)

  if (!hasGpuFallback) {
    args.push(RENDERER_FALLBACK_FLAGS.gpu)
    recordFallbackIncident('gpu_fallback_triggered', {
      source,
      reason,
      serviceId: details?.serviceId || null,
      targetUrl: details?.targetUrl || null,
    })
    updateFallbackStatus({
      phase: 'relaunching',
      stage: 'gpu',
      mitigated: false,
      message: 'Relaunching renderer with GPU fallback...',
    })
  } else if (!hasSandboxFallback) {
    args.push(RENDERER_FALLBACK_FLAGS.sandbox)
    recordFallbackIncident('no_sandbox_fallback_triggered', {
      source,
      reason,
      serviceId: details?.serviceId || null,
      targetUrl: details?.targetUrl || null,
    })
    updateFallbackStatus({
      phase: 'relaunching',
      stage: 'no-sandbox',
      mitigated: false,
      message: 'Entering safe mode (no-sandbox fallback)...',
    })
  } else {
    recordFallbackIncident('fallback_exhausted', {
      source,
      reason,
      serviceId: details?.serviceId || null,
      targetUrl: details?.targetUrl || null,
    })
    updateFallbackStatus({
      phase: 'exhausted',
      stage: 'no-sandbox',
      mitigated: false,
      message: 'Renderer fallback exhausted. Manual action required.',
    })
    logger.error('RendererFallback', 'fallback_exhausted', getRuntimeDiagnostics({
      source,
      reason,
      details,
    }))
    return false
  }

  rendererFallbackState.relaunchScheduled = true
  logger.warn('RendererFallback', 'relaunch_scheduled', getRuntimeDiagnostics({
    source,
    reason,
    details,
    nextArgs: args,
  }))

  setTimeout(() => {
    try {
      app.relaunch({ args })
      app.exit(0)
    } catch (error) {
      logger.error('RendererFallback', 'relaunch_failed', normalizeErrorPayload(error, source))
      rendererFallbackState.relaunchScheduled = false
    }
  }, 500)

  return true
}

function normalizeErrorPayload(err, origin) {
  return {
    message: err?.message || String(err || 'unknown_error'),
    stack: err?.stack || null,
    origin,
    timestamp: new Date().toISOString(),
  }
}

// Capturar errores globales para evitar caidas silenciosas en produccion.
process.on('uncaughtException', (err, origin) => {
  logger.error('Main', 'uncaught_exception', normalizeErrorPayload(err, origin || 'main'))
})

process.on('unhandledRejection', (reason) => {
  logger.error('Main', 'unhandled_rejection', normalizeErrorPayload(reason, 'promise'))
})

// Forzar una sola instancia para evitar conflictos de audio y WebContents.
if (!app.requestSingleInstanceLock()) {
  logger.warn('Main', 'second_instance_blocked')
  app.quit()
  process.exit(0)
}

// Configuracion de Widevine para DRM.
app.commandLine.appendSwitch('enable-features', 'WidevineCdm')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.commandLine.appendSwitch(
  'unsafely-treat-insecure-origin-as-secure',
  'http://localhost:5173'
)
const verboseLoggingEnabled = DEBUG_MODE || process.env.MELO_VERBOSE_LOGGING === '1'
if (verboseLoggingEnabled) {
  app.commandLine.appendSwitch('enable-logging')
  app.commandLine.appendSwitch('v', '1')
}


const gpuFallbackActive = hasFlag(RENDERER_FALLBACK_FLAGS.gpu)
  || process.env.MELO_GPU_FALLBACK === '1'
  || process.env.MELO_LINUX_COMPAT_MODE === '1'
const sandboxFallbackActive = hasFlag(RENDERER_FALLBACK_FLAGS.sandbox)
  || process.env.MELO_NO_SANDBOX_FALLBACK === '1'

if (process.platform === 'linux') {
  // Detectar Wayland y forzar XWayland por compatibilidad.
  const isWayland = process.env.WAYLAND_DISPLAY
    || process.env.XDG_SESSION_TYPE === 'wayland'
  const linuxCompatMode = process.env.MELO_LINUX_COMPAT_MODE === '1'
  if (isWayland) {
    app.commandLine.appendSwitch('ozone-platform', 'x11')
    logger.info('Main', 'wayland_detected', { mode: 'x11' })
  }

  if (sandboxFallbackActive || linuxCompatMode) {
    app.commandLine.appendSwitch('no-sandbox')
    app.commandLine.appendSwitch('disable-setuid-sandbox')
  }
  if (gpuFallbackActive) {
    // Fallback controlado para hosts Linux con problemas de GPU/renderer.
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-gpu-compositing')
    logger.warn('Main', 'gpu_fallback_enabled', getRuntimeDiagnostics({
      linuxCompatMode,
      sandboxFallbackActive,
    }))
  }
}

if (process.platform === 'darwin') {
  // Habilitar soporte de captura de audio moderno en macOS.
  app.commandLine.appendSwitch('enable-features', 'ScreenCaptureKitAudio')
}

if (gpuFallbackActive) {
  app.disableHardwareAcceleration()
}

// Cargar flags adicionales por sistema operativo.
try {
  const flagsFile = path.join(__dirname, 'electron-flags.json')
  if (fs.existsSync(flagsFile)) {
    const flags = JSON.parse(fs.readFileSync(flagsFile, 'utf8'))
    const platformFlags = flags[process.platform] || []
    platformFlags.forEach((flag) => {
      // Aceptar switches con valor para evitar flags mal parseados.
      const normalized = String(flag || '').replace(/^--/, '')
      const [key, ...rest] = normalized.split('=')
      const value = rest.length ? rest.join('=') : undefined
      if (!key) return
      if (value === undefined) app.commandLine.appendSwitch(key)
      else app.commandLine.appendSwitch(key, value)
    })
  }
} catch (_) {}

// Variables globales.
let mainWindow = null
let activeView = null
const views = {}
const webContentsToService = new Map()
const store = new Store()
const history = new Store({ name: 'history' })

let miniWindow = null
let tray = null
let trayCurrentTrack = null
let lastTrayTrackId = null
let isQuitting = false
let launchStartsMinimized = false

let lastScrobbled = null
let scrobbleTimeout = null
let currentTrackStart = null
let currentTrackData = null
let currentVolumeLevel = Math.max(0, Math.min(1, Number(store.get('volumeLevel', 1))))
// Controlar frecuencia de eventos de media para reducir ruido en renderer.
let _lastMediaTitle = null
let _lastProgressUpdate = 0
const PROGRESS_UPDATE_INTERVAL = 2000
const MEDIA_UPDATE_DEBOUNCE_MS = 350
let pendingActiveMedia = null
let pendingMediaTimer = null
let lastProcessedTrackKey = null
let processMetricsTimer = null
let metricsBroadcastTimer = null
let networkStatusTimer = null
let isOnline = true
let isCleaningUp = false
let isExecutingScript = false
let switchQueue = Promise.resolve()
let pendingSwitchCount = 0
const loadAbortControllers = new Map()
const crashedServices = new Set()
const viewMetrics = {
  switches: 0,
  crashes: 0,
  recoveries: 0,
  viewsCreated: 0,
  viewsDestroyed: 0,
  loadCancelled: 0,
  loadFailures: 0,
  ghostViewViolations: 0,
  maxViewCount: 0,
  startTime: Date.now(),
}
let healthMonitor = null
const retryManager = new RetryManager(logger)
const DEBUG_PLAYER = process.env.MELO_DEBUG_PLAYER === '1' || !app.isPackaged

function buildTrackKey(data, serviceId) {
  return [
    String(data?.title || '').trim(),
    String(data?.artist || '').trim(),
    String(data?.album || '').trim(),
    String(serviceId || '').trim(),
  ].join('|')
}

function scheduleActiveMediaFlush(serviceId, data, flushFn) {
  pendingActiveMedia = { serviceId, data }
  clearTimeout(pendingMediaTimer)
  pendingMediaTimer = setTimeout(() => {
    const pending = pendingActiveMedia
    pendingActiveMedia = null
    if (!pending || typeof flushFn !== 'function') return
    flushFn(pending.serviceId, pending.data)
  }, MEDIA_UPDATE_DEBOUNCE_MS)
}

const PLAYER_STATE = {
  NOT_LOADED: 'NOT_LOADED',
  LOADING: 'LOADING',
  READY: 'READY',
  ERROR: 'ERROR',
}

const playerController = {
  state: PLAYER_STATE.NOT_LOADED,
  activeServiceId: null,
  queue: Promise.resolve(),

  log(...args) {
    if (DEBUG_PLAYER) {
      logger.debug('PlayerController', 'trace', { args })
    }
  },

  setState(nextState, reason = '') {
    if (this.state === nextState) return
    this.state = nextState
    this.log('state ->', nextState, reason)
  },

  canExecute(requireReady = true) {
    return !requireReady || this.state === PLAYER_STATE.READY
  },

  enqueue(task) {
    this.queue = this.queue
      .then(task)
      .catch((err) => {
        this.log('queue error:', err?.message || err)
      })
    return this.queue
  },
}

// Timing condicional para diagnostico de performance sin costo en modo normal.
async function measureIfDebug(action, fn) {
  if (!DEBUG_MODE) return fn()
  const startedAt = Date.now()
  try {
    return await fn()
  } finally {
    logger.debug('Performance', action, { durationMs: Date.now() - startedAt })
  }
}

const SERVICES = {
  appleMusic: {
    id: 'appleMusic',
    name: 'Apple Music',
    url: 'https://music.apple.com',
    color: '#fc3c44',
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com',
    color: '#1db954',
  },
  youtubeMusic: {
    id: 'youtubeMusic',
    name: 'YT Music',
    url: 'https://music.youtube.com',
    color: '#ff0000',
  },
  tidal: {
    id: 'tidal',
    name: 'Tidal',
    url: 'https://listen.tidal.com',
    color: '#00ffff',
  },
  deezer: {
    id: 'deezer',
    name: 'Deezer',
    url: 'https://www.deezer.com',
    color: '#a238ff',
  },
}

const ALLOWED_SERVICE_ORIGINS = new Set(
  Object.values(SERVICES).map((service) => new URL(service.url).origin)
)

function executeInWebContents(webContents, script, {
  requireReady = true,
  retries = 2,
  label = 'script',
  timeoutMs = 2000,
} = {}) {
  return playerController.enqueue(async () => {
    if (!webContents || webContents.isDestroyed()) return null
    if (!playerController.canExecute(requireReady)) return null

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        if (isExecutingScript) return null
        isExecutingScript = true
        // Guard de cancelacion: cortar ejecucion si el WebContents se destruye.
        const execution = webContents.executeJavaScript(script)
        const timeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('execute_timeout')), timeoutMs)
        })
        const result = await Promise.race([execution, timeout])
        isExecutingScript = false
        if (attempt > 1) {
          playerController.log(`${label} recovered on retry #${attempt - 1}`)
        }
        return result
      } catch (err) {
        isExecutingScript = false
        if (!webContents || webContents.isDestroyed()) return null
        playerController.log(`${label} failed attempt ${attempt}:`, err?.message || err)
        if (attempt > retries) throw err
      }
    }
    return null
  })
}

function getContentBounds() {
  if (!mainWindow) return { x: 0, y: 45, width: 1200, height: 633 }
  const b = mainWindow.getContentBounds()
  const immersiveEnabled = store.get('immersiveEnabled', SETTINGS_DEFAULTS.immersiveEnabled) === true
  const SIDEBAR_WIDTH = 220
  const TOP_HEIGHT = 45
  const BOTTOM_HEIGHT = 72

  let x = immersiveEnabled ? 0 : SIDEBAR_WIDTH
  let y = TOP_HEIGHT
  let width = Math.max(360, b.width - x)
  let height = Math.max(200, b.height - TOP_HEIGHT - BOTTOM_HEIGHT)

  return { x, y, width, height }
}

function logProcessMetrics(tag = 'metrics') {
  if (!DEBUG_PLAYER) return
  try {
    const mem = process.memoryUsage()
    const mb = (v) => Math.round((v / 1024 / 1024) * 10) / 10
    const metricsCount = app.getAppMetrics().length
    logger.debug('Main', 'process_metrics', {
      tag,
      rssMb: mb(mem.rss),
      heapUsedMb: mb(mem.heapUsed),
      appMetrics: metricsCount,
    })
  } catch (_) {}
}

function startMetricsReporter(intervalMs = 5000) {
  if (metricsBroadcastTimer) clearInterval(metricsBroadcastTimer)
  metricsBroadcastTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('metrics:update', getViewMetrics())
  }, intervalMs)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getViewMetrics() {
  const count = Object.keys(views).length
  const launchAttempts = fallbackMetrics.launchSuccesses + fallbackMetrics.launchFailures
  return {
    ...viewMetrics,
    activeService: playerController.activeServiceId,
    viewCount: count,
    queueLength: pendingSwitchCount,
    uptimeMs: Date.now() - viewMetrics.startTime,
    fallbackMetrics: {
      ...fallbackMetrics,
      launchAttempts,
      launchSuccessRate: launchAttempts > 0
        ? Math.round((fallbackMetrics.launchSuccesses / launchAttempts) * 10000) / 10000
        : null,
    },
    performance: {
      ...performanceMetrics,
      avgSwitchLatencyMs: performanceMetrics.switchLatencySamples > 0
        ? Math.round((performanceMetrics.switchLatencyTotalMs / performanceMetrics.switchLatencySamples) * 100) / 100
        : null,
      memorySamples: performanceMetrics.memorySamples.slice(-20),
    },
    retryMetrics: retryManager.getMetrics(),
    healthMetrics: healthMonitor?.getMetrics?.() || null,
    environment: getRuntimeDiagnostics(),
  }
}

function trackViewCount() {
  const count = Object.keys(views).length
  viewMetrics.maxViewCount = Math.max(viewMetrics.maxViewCount, count)
  if (count > 1) viewMetrics.ghostViewViolations += 1
}

function cancelPendingLoad(serviceId) {
  const controller = loadAbortControllers.get(serviceId)
  if (!controller) return
  const view = views[serviceId]
  try {
    if (view?.webContents && !view.webContents.isDestroyed()) {
      view.webContents.stop()
    }
  } catch (_) {}

  viewMetrics.loadCancelled += 1
  controller.abort()
  loadAbortControllers.delete(serviceId)
}

function createLoadController(serviceId) {
  cancelPendingLoad(serviceId)
  const controller = new AbortController()
  loadAbortControllers.set(serviceId, controller)
  return controller
}

function loadURLWithTimeout(webContents, url, abortSignal, timeoutMs = 10000) {
  if (abortSignal.aborted) {
    return Promise.reject(new Error('load_cancelled'))
  }

  return new Promise((resolve, reject) => {
    let completed = false
    let timeoutId = null

    const finish = (error, result) => {
      if (completed) return
      completed = true
      if (timeoutId) clearTimeout(timeoutId)
      abortSignal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(result)
    }

    const onAbort = () => finish(new Error('load_cancelled'))

    abortSignal.addEventListener('abort', onAbort, { once: true })
    timeoutId = setTimeout(() => {
      finish(new Error(`load_timeout_${timeoutMs}ms`))
    }, timeoutMs)

    webContents.loadURL(url)
      .then((result) => finish(null, result))
      .catch((error) => finish(error))
  })
}

function setupViewLifecycleHandlers(view, serviceId, url) {
  view.webContents.on('crashed', () => {
    handleViewCrash(serviceId, url, 'crashed').catch(() => {})
  })

  view.webContents.on('render-process-gone', (_event, details) => {
    const diagnostics = {
      serviceId,
      targetUrl: url,
      currentUrl: view.webContents.getURL(),
      processId: view.webContents.getOSProcessId?.() || null,
      reason: details?.reason || 'unknown',
      exitCode: details?.exitCode,
      metadata: details || null,
    }
    if (diagnostics.reason === 'launch-failed') {
      recordFallbackIncident('launch_failure', diagnostics)
    }
    logger.error('BrowserView', 'render_process_gone', diagnostics)
    scheduleRendererFallbackRelaunch('browserview', diagnostics)
    handleViewCrash(serviceId, url, 'render-process-gone').catch(() => {})
  })

  view.webContents.on('unresponsive', () => {
    logger.warn('BrowserView', 'unresponsive', { serviceId })
  })

  view.webContents.removeAllListeners('did-fail-load')
  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    playerController.setState(PLAYER_STATE.ERROR, `did-fail-load ${serviceId}`)
    viewMetrics.loadFailures += 1
    logger.error('BrowserView', 'did_fail_load', {
      serviceId,
      errorCode,
      errorDescription,
    })
  })
}

async function handleViewCrash(serviceId, url, reason) {
  viewMetrics.crashes += 1
  logger.error('BrowserView', 'crash_detected', { serviceId, reason })

  if (playerController.activeServiceId !== serviceId || crashedServices.has(serviceId)) {
    logger.info('BrowserView', 'recovery_skipped', {
      serviceId,
      isActive: playerController.activeServiceId === serviceId,
      alreadyRecovering: crashedServices.has(serviceId),
    })
    return
  }

  crashedServices.add(serviceId)

  try {
    destroyBrowserViewInstance(views[serviceId], serviceId)
    await sleep(1000)

    if (playerController.activeServiceId === serviceId) {
      await enqueueServiceSwitch(serviceId, url, SERVICES[serviceId])
      viewMetrics.recoveries += 1
      logger.info('BrowserView', 'recovery_success', { serviceId })
    } else {
      logger.info('BrowserView', 'recovery_cancelled', { serviceId })
    }
  } catch (error) {
    logger.error('BrowserView', 'recovery_failed', {
      serviceId,
      message: error?.message || 'unknown_error',
    })
  } finally {
    crashedServices.delete(serviceId)
  }
}

function startMemoryMonitoring(intervalMs = 30000) {
  if (processMetricsTimer) clearInterval(processMetricsTimer)

  processMetricsTimer = setInterval(async () => {
    try {
      const info = await process.getProcessMemoryInfo()
      const usage = process.memoryUsage()
      const toMb = (v) => Math.round((Number(v || 0) / 1024 / 1024) * 10) / 10
      const heapUsage = info.private ? null : (usage.heapUsed / Math.max(1, usage.heapTotal))

      logger.debug('Memory', 'snapshot', {
        privateMb: toMb(info.private),
        residentSetMb: toMb(info.residentSet),
        heapUsedMb: toMb(usage.heapUsed),
        heapTotalMb: toMb(usage.heapTotal),
        rssMb: toMb(usage.rss),
      })

      performanceMetrics.memorySamples.push({
        timestamp: new Date().toISOString(),
        rssMb: toMb(usage.rss),
        heapUsedMb: toMb(usage.heapUsed),
      })
      if (performanceMetrics.memorySamples.length > 120) {
        performanceMetrics.memorySamples.shift()
      }

      if (heapUsage != null && heapUsage > 0.9) {
        logger.warn('Memory', 'high_usage', {
          heapUsagePct: Math.round(heapUsage * 1000) / 10,
        })
      }
    } catch (error) {
      logger.warn('Memory', 'snapshot_failed', {
        message: error?.message || 'unknown_error',
      })
    }
  }, intervalMs)
}

async function getMemorySnapshotMb() {
  const processInfo = await process.getProcessMemoryInfo().catch(() => ({}))
  const usage = process.memoryUsage()
  const toMb = (value) => Math.round((Number(value || 0) / 1024 / 1024) * 100) / 100
  return {
    residentSetMb: toMb(processInfo.residentSet || usage.rss),
    privateMb: toMb(processInfo.private),
    rssMb: toMb(usage.rss),
    heapUsedMb: toMb(usage.heapUsed),
    heapTotalMb: toMb(usage.heapTotal),
  }
}

function ensureTestResultsDir() {
  const dir = path.join(__dirname, 'test-results')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (_) {}
  return dir
}

function writeTestReport(name, report) {
  const dir = ensureTestResultsDir()
  const filePath = path.join(dir, `${name}.json`)
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8')
  return filePath
}

function getServiceLoop() {
  return ['spotify', 'youtubeMusic', 'appleMusic', 'tidal', 'deezer']
    .map((id) => SERVICES[id])
    .filter(Boolean)
}

function randomDelay(minMs, maxMs) {
  const min = Math.max(0, Number(minMs) || 0)
  const max = Math.max(min, Number(maxMs) || min)
  return Math.floor(min + Math.random() * (max - min + 1))
}

async function runStressValidation({ iterations = 40, minDelayMs = 50, maxDelayMs = 300 } = {}) {
  const services = getServiceLoop()
  if (!services.length) {
    throw new Error('no_services_available_for_stress_test')
  }

  const initial = await getMemorySnapshotMb()
  let peakMemoryMb = initial.rssMb

  const baseline = { ...viewMetrics }
  let loadCancellationValidated = false
  let switchAttempts = 0

  for (let idx = 0; idx < iterations; idx += 1) {
    const service = services[idx % services.length]
    switchAttempts += 1
    await enqueueServiceSwitch(service.id, service.url, service)

    if (idx % 7 === 0) {
      const first = services[(idx + 1) % services.length]
      const second = services[(idx + 2) % services.length]
      switchAttempts += 2
      const a = enqueueServiceSwitch(first.id, first.url, first)
      const b = enqueueServiceSwitch(second.id, second.url, second)
      await Promise.all([a, b])
      loadCancellationValidated = true
    }

    const snap = await getMemorySnapshotMb()
    peakMemoryMb = Math.max(peakMemoryMb, snap.rssMb)
    await sleep(randomDelay(minDelayMs, maxDelayMs))
  }

  const final = await getMemorySnapshotMb()
  const delta = {
    switches: viewMetrics.switches - baseline.switches,
    crashes: viewMetrics.crashes - baseline.crashes,
    recoveries: viewMetrics.recoveries - baseline.recoveries,
    viewsCreated: viewMetrics.viewsCreated - baseline.viewsCreated,
    viewsDestroyed: viewMetrics.viewsDestroyed - baseline.viewsDestroyed,
    loadCancelled: viewMetrics.loadCancelled - baseline.loadCancelled,
  }

  const report = {
    initialMemoryMB: initial.rssMb,
    finalMemoryMB: final.rssMb,
    peakMemoryMB: peakMemoryMb,
    switches: switchAttempts,
    successfulSwitches: delta.switches,
    crashes: delta.crashes,
    recoveries: delta.recoveries,
    viewsCreated: delta.viewsCreated,
    viewsDestroyed: delta.viewsDestroyed,
    loadCancelled: delta.loadCancelled,
    maxViewCount: viewMetrics.maxViewCount,
    ghostViewViolations: viewMetrics.ghostViewViolations,
    loadCancellationValidated,
    leakDetected: final.rssMb > initial.rssMb * 1.3,
    gpuFallbacksTriggered: fallbackMetrics.gpuFallbacksTriggered,
    noSandboxFallbacksTriggered: fallbackMetrics.noSandboxFallbacksTriggered,
    fallbackExhausted: fallbackMetrics.fallbackExhausted,
    launchFailures: fallbackMetrics.launchFailures,
    launchSuccesses: fallbackMetrics.launchSuccesses,
    metrics: getViewMetrics(),
  }

  report.reportPath = writeTestReport('stress-report', report)
  return report
}

async function runLoadCancellationValidation() {
  const services = getServiceLoop()
  if (services.length < 2) {
    return { success: false, reason: 'insufficient_services' }
  }

  const beforeCancelled = viewMetrics.loadCancelled
  const first = services[0]
  const second = services[1]

  const pending = enqueueServiceSwitch(first.id, first.url, first)
  const immediate = enqueueServiceSwitch(second.id, second.url, second)
  await Promise.all([pending, immediate])

  const activeCount = Object.keys(views).length
  return {
    success: true,
    cancelledLoads: viewMetrics.loadCancelled - beforeCancelled,
    activeViews: activeCount,
    noGhostViews: activeCount <= 1,
  }
}

async function runHealthValidation() {
  if (!healthMonitor) {
    return { success: false, reason: 'health_monitor_not_initialized' }
  }

  const original = {
    lastAdapterActionTime: healthMonitor.lastAdapterActionTime,
    mediaSessionAvailable: healthMonitor.mediaSessionAvailable,
    playback: playbackState.getCurrent(),
  }

  const results = {}

  playbackState.update({ isPlaying: false })
  healthMonitor.recordAdapterAction()
  results.pausedNoFalsePositive = healthMonitor.check()

  playbackState.update({ isPlaying: true })
  healthMonitor.setLastAdapterActionTime(Date.now() - 5000)
  results.adapterTimeout = healthMonitor.check()

  playbackState.update({ isPlaying: false })
  playbackState.setLastUpdateTimestamp(Date.now() - 20000)
  healthMonitor.setLastAdapterActionTime(Date.now() - 1000)
  healthMonitor.setMediaSessionAvailable(true)
  results.staleState = healthMonitor.check()

  healthMonitor.setMediaSessionAvailable(false)
  results.mediaSessionUnavailable = healthMonitor.check()

  playbackState.update({
    isPlaying: original.playback.isPlaying,
    currentTime: original.playback.currentTime,
    duration: original.playback.duration,
    trackId: original.playback.trackId,
    title: original.playback.title,
    artist: original.playback.artist,
    album: original.playback.album,
    artwork: original.playback.artwork,
    service: original.playback.service,
  })
  playbackState.setLastUpdateTimestamp(original.playback.timestamp || Date.now())
  healthMonitor.setLastAdapterActionTime(original.lastAdapterActionTime)
  healthMonitor.setMediaSessionAvailable(original.mediaSessionAvailable)

  return {
    success: true,
    results,
    passed: {
      pausedNoFalsePositive: results.pausedNoFalsePositive.status === 'healthy',
      adapterTimeout: results.adapterTimeout.reason === 'adapter_timeout',
      staleState: results.staleState.reason === 'stale_state',
      mediaSessionUnavailable: results.mediaSessionUnavailable.reason === 'no_media_session',
    },
  }
}

async function runSmokeValidation() {
  const services = getServiceLoop()
  const errors = []

  for (let idx = 0; idx < 10; idx += 1) {
    const service = services[idx % services.length]
    try {
      await enqueueServiceSwitch(service.id, service.url, service)
      await sleep(120)
    } catch (error) {
      errors.push({ phase: 'switch', serviceId: service.id, message: error?.message || 'unknown_error' })
    }
  }

  const waitForRendererReady = async (timeoutMs = 10000) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const isReady = Boolean(
        activeView
        && activeView.webContents
        && !activeView.webContents.isDestroyed()
        && playerController.state === PLAYER_STATE.READY
        && playerController.activeServiceId
      )
      if (isReady) return true
      await sleep(200)
    }
    return false
  }

  const rendererReady = await waitForRendererReady(10000)
  if (!rendererReady) {
    errors.push({ phase: 'preflight', message: 'invalid_environment_renderer_not_ready' })
  }

  for (const action of ['play', 'play', 'next']) {
    if (!rendererReady) break
    try {
      await runPlayerAction(action)
    } catch (error) {
      errors.push({ phase: 'action', action, message: error?.message || 'unknown_error' })
    }
  }

  await switchQueue.catch(() => {})

  const snapshot = await getMemorySnapshotMb()
  const report = {
    success: errors.length === 0,
    invalidEnvironment: !rendererReady,
    errors,
    memory: snapshot,
    activeViews: Object.keys(views).length,
    queueLength: pendingSwitchCount,
    gpuFallbacksTriggered: fallbackMetrics.gpuFallbacksTriggered,
    noSandboxFallbacksTriggered: fallbackMetrics.noSandboxFallbacksTriggered,
    fallbackExhausted: fallbackMetrics.fallbackExhausted,
    launchFailures: fallbackMetrics.launchFailures,
    launchSuccesses: fallbackMetrics.launchSuccesses,
    metrics: getViewMetrics(),
  }

  report.reportPath = writeTestReport('smoke-report', report)
  return report
}

// Validaciones de payload IPC para bloquear entradas invalidas temprano.
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isFiniteNumber = (value) => Number.isFinite(Number(value))

function getWindowBehaviorSettings() {
  const trayEnabled = store.get('trayEnabled', SETTINGS_DEFAULTS.trayEnabled) !== false
  const rawCloseBehavior = store.get('closeBehavior', SETTINGS_DEFAULTS.closeBehavior)
  const closeBehavior = rawCloseBehavior === 'quit' ? 'quit' : 'tray'

  if (!trayEnabled) {
    return { trayEnabled: false, closeBehavior: 'quit' }
  }

  return { trayEnabled, closeBehavior }
}

function sanitizeErrorPayload(payload) {
  const raw = payload?.error || payload
  return {
    message: raw?.message || String(raw || 'unknown_error'),
    stack: raw?.stack || null,
    origin: payload?.origin || 'renderer',
    timestamp: payload?.timestamp || new Date().toISOString(),
  }
}

function destroyBrowserViewInstance(view, serviceId = 'unknown') {
  if (!view) return
  if (serviceId) cancelPendingLoad(serviceId)

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeBrowserView(view)
    }
  } catch (_) {}

  try {
    if (view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.removeAllListeners()
      view.webContents.destroy()
    }
  } catch (_) {}

  if (serviceId && views[serviceId] === view) {
    delete views[serviceId]
    viewMetrics.viewsDestroyed += 1
    trackViewCount()
  }

  if (serviceId && views[serviceId]) {
    logger.error('BrowserView', 'destroy_verification_failed', { serviceId })
  }
}

async function cleanupAllResources() {
  if (isCleaningUp) return
  isCleaningUp = true

  // Limpieza centralizada para cierre consistente.
  logger.info('Main', 'cleanup_start')
  clearTimeout(scrobbleTimeout)
  scrobbleTimeout = null
  clearTimeout(pendingMediaTimer)
  pendingMediaTimer = null
  pendingActiveMedia = null
  for (const controller of loadAbortControllers.values()) {
    try { controller.abort() } catch (_) {}
  }
  loadAbortControllers.clear()
  crashedServices.clear()
  pendingSwitchCount = 0
  switchQueue = Promise.resolve()

  if (healthMonitor) {
    healthMonitor.shutdown()
    healthMonitor = null
  }

  stopMpris()

  playbackState.destroy()
  await adapterManager.destroyAll().catch(() => {})
  await discord.disconnectDiscord().catch(() => {})
  globalShortcut.unregisterAll()

  if (processMetricsTimer) {
    clearInterval(processMetricsTimer)
    processMetricsTimer = null
  }

  if (metricsBroadcastTimer) {
    clearInterval(metricsBroadcastTimer)
    metricsBroadcastTimer = null
  }

  if (networkStatusTimer) {
    clearInterval(networkStatusTimer)
    networkStatusTimer = null
  }

  // Evitar leaks de listeners IPC al cerrar/reiniciar app.
  ipcMain.removeAllListeners('service:switch')
  ipcMain.removeAllListeners('browserview:hide')
  ipcMain.removeAllListeners('browserview:show')
  ipcMain.removeAllListeners('player:action')
  ipcMain.removeAllListeners('player:volume')
  ipcMain.removeAllListeners('player:seek')
  ipcMain.removeAllListeners('player:seek-to')
  ipcMain.removeAllListeners('health:mediaSession')
  ipcMain.removeAllListeners('mini:toggle')
  ipcMain.removeAllListeners('media:update')
  ;[
    'service:switch',
    'services:getLast',
    'services:connected',
    'debug:buttons',
    'debug:metrics',
    'debug:health',
    'debug:crash-view',
    'debug:validate-load-cancellation',
    'debug:validate-health',
    'debug:run-stress',
    'debug:run-smoke',
    'stats:getHistory',
    'stats:getSummary',
    'network:status',
    'player:getProgress',
    'stats:getWrapped',
    'stats:export',
    'stats:clear',
    'discord:toggle',
    'discord:status',
    'lastfm:configure',
    'lastfm:auth',
    'lastfm:getSession',
    'settings:get',
    'settings:save',
    'window:action',
    'notification:show',
    'melo:reportError',
  ].forEach((channel) => {
    try { ipcMain.removeHandler(channel) } catch (_) {}
  })

  Object.entries(views).forEach(([serviceId, view]) => {
    destroyBrowserViewInstance(view, serviceId)
  })

  if (miniWindow && !miniWindow.isDestroyed()) {
    try {
      miniWindow.destroy()
    } catch (_) {}
    miniWindow = null
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.removeAllListeners()
      mainWindow.destroy()
    } catch (_) {}
    mainWindow = null
  }

  if (tray && !tray.isDestroyed()) {
    try {
      tray.destroy()
    } catch (_) {}
  }
  tray = null
  logger.info('Main', 'cleanup_complete')
}

function applyViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!activeView || !activeView.webContents) return
  if (activeView.webContents.isDestroyed()) return

  activeView.setBounds(getContentBounds())
  activeView.setAutoResize({ width: true, height: true })
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow

  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, 'assets', 'icon.png'),
    width: 1200,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      webSecurity: true,
    },
  })
  performanceMetrics.mainWindowCreatedAt = Date.now()

  // Mostrar cuando el renderer este listo para evitar blanco/parpadeo en prod.
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (launchStartsMinimized) {
      mainWindow.hide()
      mainWindow.setSkipTaskbar(true)
      return
    }
    mainWindow.show()
  })

  mainWindow.setMenuBarVisibility(false)

  if (app.isPackaged) {
    mainWindow.loadFile(
      path.join(__dirname, 'dist/renderer/index.html')
    )
  } else {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (!performanceMetrics.rendererReadyAt) {
      performanceMetrics.rendererReadyAt = Date.now()
      performanceMetrics.startupDurationMs = performanceMetrics.rendererReadyAt - performanceMetrics.appStartAt
      recordFallbackIncident('launch_success', {
        serviceId: playerController.activeServiceId || null,
        targetUrl: mainWindow?.webContents?.getURL?.() || null,
      })
      logger.info('Performance', 'startup_ready', {
        startupDurationMs: performanceMetrics.startupDurationMs,
      })
    }

    if (fallbackStatus.phase === 'relaunching' || fallbackStatus.phase === 'manual_retry') {
      updateFallbackStatus({
        phase: 'mitigated',
        mitigated: true,
        message: 'Renderer recovered successfully.',
      })
    }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('MainWindow', 'did_fail_load', { errorCode, errorDescription, validatedURL })
    if (app.isPackaged) {
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html')).catch(() => {})
      }, 1000)
    }
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    const diagnostics = getRuntimeDiagnostics({
      reason: details?.reason || 'unknown',
      exitCode: details?.exitCode,
      metadata: details || null,
    })
    if ((details?.reason || 'unknown') === 'launch-failed') {
      recordFallbackIncident('launch_failure', diagnostics)
    }
    logger.error('MainWindow', 'render_process_gone', diagnostics)
    scheduleRendererFallbackRelaunch('main-window', diagnostics)
  })

  mainWindow.on('resize', applyViewBounds)

  mainWindow.on('blur', () => {
    if (activeView?.webContents && !activeView.webContents.isDestroyed()) {
      activeView.webContents.send('melo:polling-mode', 'background')
    }
  })

  mainWindow.on('focus', () => {
    if (activeView?.webContents && !activeView.webContents.isDestroyed()) {
      activeView.webContents.send('melo:polling-mode', 'foreground')
    }
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return

    const { trayEnabled, closeBehavior } = getWindowBehaviorSettings()
    if (trayEnabled && closeBehavior === 'tray') {
      event.preventDefault()
      mainWindow.hide()
      mainWindow.setSkipTaskbar(true)
    }
  })

  mainWindow.on('closed', () => {
    Object.entries(views).forEach(([serviceId, view]) => {
      destroyBrowserViewInstance(view, serviceId)
    })
    mainWindow = null
  })

  playerController.log('mainWindow created')
  logProcessMetrics('window-created')
  return mainWindow
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.png')

    if (!fs.existsSync(iconPath)) {
      logger.warn('Tray', 'icon_not_found', { iconPath })
      return
    }

    let icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      logger.warn('Tray', 'icon_empty')
      return
    }

    icon = icon.resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('Melo')
    renderTrayMenu()

    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
        mainWindow.setSkipTaskbar(true)
        
        // Mostrar hint la primera vez que se minimiza a bandeja (Fase 6 Polish)
        const hasShownHint = store.get('hasShownTrayHint', false)
        if (!hasShownHint) {
          const { Notification } = require('electron')
          new Notification({
            title: 'Melo',
            body: 'Melo sigue ejecutándose en segundo plano. Haz clic en el icono de Melo en la bandeja para volver a abrir.',
            silent: true,
            timeoutType: 'default'
          }).show()
          store.set('hasShownTrayHint', true)
        }
      } else {
        mainWindow.setSkipTaskbar(false)
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch (err) {
    logger.error('Tray', 'create_failed', { message: err?.message || 'unknown_error' })
  }
}

function renderTrayMenu() {
  if (!tray || tray.isDestroyed()) return

  try {
    const track = trayCurrentTrack
    const hasLongTitle = (track?.title || '').length > 40
    const titleLabel = track?.title
      ? `${track.title.slice(0, 40)}${hasLongTitle ? '...' : ''}`
      : 'Sin reproduccion'
    const artistLabel = track?.artist || ''

    tray.setToolTip(track ? `Melo - ${titleLabel}` : 'Melo')

    const template = [
      {
        label: titleLabel,
        enabled: false,
      },
      ...(artistLabel
        ? [{
          label: artistLabel,
          enabled: false,
        }]
        : []),
      { type: 'separator' },
      {
        label: 'Anterior',
        click: () => runPlayerAction('previous').catch(() => {}),
      },
      {
        label: 'Play / Pause',
        click: () => runPlayerAction('play').catch(() => {}),
      },
      {
        label: 'Siguiente',
        click: () => runPlayerAction('next').catch(() => {}),
      },
      { type: 'separator' },
      {
        label: 'Mostrar Melo',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          mainWindow.setSkipTaskbar(false)
          mainWindow.show()
          mainWindow.focus()
        },
      },
      { type: 'separator' },
      {
        label: 'Salir de Melo',
        click: () => {
          isQuitting = true
          if (tray && !tray.isDestroyed()) tray.destroy()
          tray = null
          app.quit()
        },
      },
    ]

    const menu = Menu.buildFromTemplate(template)
    tray.setContextMenu(menu)
  } catch (err) {
    logger.error('Tray', 'render_menu_failed', { message: err?.message || 'unknown_error' })
  }
}

function updateTrayTrack(data) {
  if (!tray || tray.isDestroyed()) return
  const trackId = `${data?.title || ''}-${data?.artist || ''}`
  if (trackId === lastTrayTrackId) return
  lastTrayTrackId = trackId
  trayCurrentTrack = data
  renderTrayMenu()
}

function syncTrayWithSettings() {
  const trayEnabled = store.get('trayEnabled', SETTINGS_DEFAULTS.trayEnabled) !== false
  if (!trayEnabled) {
    if (tray && !tray.isDestroyed()) {
      tray.destroy()
    }
    tray = null
    return
  }

  if (!tray || tray.isDestroyed()) {
    createTray()
  }
}

function checkConnection() {
  isOnline = net.isOnline()
  return isOnline
}

// Registrar una reproduccion unica por cambio de track.
function trackPlay(data, serviceId) {
  if (!data?.title) return
  const trackId = `${data.title}-${data.artist || ''}`

  if (currentTrackData && currentTrackStart) {
    const previousTrackId = `${currentTrackData.title || ''}-${currentTrackData.artist || ''}`
    if (trackId !== previousTrackId) {
      const listenedMs = Date.now() - currentTrackStart
      if (listenedMs > 10000) {
        const plays = history.get('plays', [])
        const entry = {
          id: Date.now(),
          title: currentTrackData.title,
          artist: currentTrackData.artist || null,
          album: currentTrackData.album || null,
          artwork: currentTrackData.artwork || null,
          service: currentTrackData.serviceId,
          playedAt: currentTrackStart,
          listenedMs,
        }
        plays.unshift(entry)
        if (plays.length > 5000) plays.splice(5000)
        history.set('plays', plays)
      }
    } else {
      return
    }
  }

  currentTrackStart = Date.now()
  currentTrackData = { ...data, serviceId }
}

function buildSummary(plays) {
  if (!plays.length) return null

  const totalMs = plays.reduce((acc, p) => acc + (p.listenedMs || 0), 0)
  const totalHours = Math.floor(totalMs / 3600000)
  const totalMinutes = Math.floor((totalMs % 3600000) / 60000)

  const serviceTime = {}
  plays.forEach((p) => {
    if (!p.service) return
    serviceTime[p.service] = (serviceTime[p.service] || 0) + (p.listenedMs || 0)
  })

  const serviceStats = Object.entries(serviceTime)
    .map(([id, ms]) => ({
      id,
      name: SERVICES[id]?.name || id,
      color: SERVICES[id]?.color || '#ffffff',
      ms,
      hours: Math.floor(ms / 3600000),
      minutes: Math.floor((ms % 3600000) / 60000),
      percent: totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0,
    }))
    .sort((a, b) => b.ms - a.ms)

  const artistCount = {}
  plays.forEach((p) => {
    if (p.artist) artistCount[p.artist] = (artistCount[p.artist] || 0) + 1
  })

  const topArtists = Object.entries(artistCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  const trackCount = {}
  plays.forEach((p) => {
    const key = `${p.title}||${p.artist || ''}`
    if (!trackCount[key]) trackCount[key] = { ...p, count: 0, totalMs: 0 }
    trackCount[key].count++
    trackCount[key].totalMs += p.listenedMs || 0
  })

  const topTracks = Object.values(trackCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const activityMap = {}
  const now = Date.now()
  const yearAgo = now - 365 * 24 * 3600 * 1000
  plays
    .filter((p) => p.playedAt > yearAgo)
    .forEach((p) => {
      const day = new Date(p.playedAt).toISOString().split('T')[0]
      activityMap[day] = (activityMap[day] || 0) + 1
    })

  const hourCount = Array(24).fill(0)
  plays.forEach((p) => {
    const hour = new Date(p.playedAt).getHours()
    hourCount[hour]++
  })
  const peakHour = hourCount.indexOf(Math.max(...hourCount))

  const days = new Set(plays.map((p) => new Date(p.playedAt).toDateString()))

  return {
    totalPlays: plays.length,
    totalMs,
    totalHours,
    totalMinutes,
    serviceStats,
    topArtists,
    topTracks,
    peakHour,
    uniqueDays: days.size,
    activityMap,
    firstPlay: plays[plays.length - 1]?.playedAt,
    lastPlay: plays[0]?.playedAt,
  }
}

function createMiniPlayer() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.focus()
    return
  }

  miniWindow = new BrowserWindow({
    width: 340,
    height: 88,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  const { width, height } = require('electron').screen
    .getPrimaryDisplay().workAreaSize
  miniWindow.setPosition(width - 360, height - 108)

  if (app.isPackaged) {
    miniWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html'), {
      hash: 'mini'
    })
  } else {
    miniWindow.loadURL('http://localhost:5173/#mini')
  }

  miniWindow.on('closed', () => {
    miniWindow = null
  })
}

function toggleMiniPlayer() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.close()
    miniWindow = null
  } else {
    createMiniPlayer()
  }
}

async function createServiceView(serviceId, url) {
  const existing = views[serviceId]
  if (existing && existing.webContents && !existing.webContents.isDestroyed()) {
    const currentUrl = existing.webContents.getURL()
    if (currentUrl === url) return existing
    destroyBrowserViewInstance(existing, serviceId)
  }

  Object.entries(views).forEach(([id, view]) => {
    if (id !== serviceId) {
      destroyBrowserViewInstance(view, id)
    }
  })

  playerController.setState(PLAYER_STATE.LOADING, `create view ${serviceId}`)

  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: `persist:melo-${serviceId}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      plugins: true,
      allowRunningInsecureContent: false,
    },
  })

  view.setBackgroundColor('#0d0d0d')

  // UA Safari para maximizar compatibilidad DRM con Apple Music.
  view.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) ' +
      'AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
      'Version/17.0 Safari/605.1.15'
  )

  setupViewLifecycleHandlers(view, serviceId, url)

  view.webContents.removeAllListeners('did-start-loading')
  view.webContents.on('did-start-loading', () => {
    playerController.setState(PLAYER_STATE.LOADING, `did-start-loading ${serviceId}`)
  })

  view.webContents.on('did-finish-load', () => {
    playerController.setState(PLAYER_STATE.READY, `did-finish-load ${serviceId}`)
    applyVolumeToWebContents(view.webContents, currentVolumeLevel).catch(() => {})
    view.webContents.send(
      'melo:polling-mode',
      mainWindow?.isFocused() ? 'foreground' : 'background'
    )
  })

  view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    try {
      const target = new URL(targetUrl)
      if (ALLOWED_SERVICE_ORIGINS.has(target.origin)) {
        return { action: 'allow' }
      }
      shell.openExternal(targetUrl).catch(() => {})
      return { action: 'deny' }
    } catch (_) {
      return { action: 'deny' }
    }
  })

  view.webContents.removeAllListeners('will-navigate')
  view.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const target = new URL(targetUrl)
      if (!ALLOWED_SERVICE_ORIGINS.has(target.origin)) {
        event.preventDefault()
        shell.openExternal(targetUrl).catch(() => {})
      }
    } catch (_) {
      event.preventDefault()
    }
  })

  views[serviceId] = view
  viewMetrics.viewsCreated += 1
  trackViewCount()
  // Registrar el adaptador del servicio para enrutar acciones por vista activa.
  const adapter = new BrowserViewAdapter(serviceId, () => views[serviceId])
  adapterManager.register(serviceId, adapter)
  webContentsToService.set(view.webContents.id, serviceId)

  view.webContents.on('destroyed', () => {
    webContentsToService.delete(view.webContents.id)
    delete views[serviceId]
    if (playerController.activeServiceId === serviceId) {
      playerController.setState(PLAYER_STATE.NOT_LOADED, `destroyed ${serviceId}`)
    }
  })

  const loadController = createLoadController(serviceId)
  try {
    if (view.webContents.getURL() !== url) {
      await loadURLWithTimeout(view.webContents, url, loadController.signal, 10000)
    }
  } catch (error) {
    if (error?.message === 'load_cancelled') {
      destroyBrowserViewInstance(view, serviceId)
      throw error
    }
    viewMetrics.loadFailures += 1
    destroyBrowserViewInstance(view, serviceId)
    throw error
  } finally {
    const currentController = loadAbortControllers.get(serviceId)
    if (currentController === loadController) {
      loadAbortControllers.delete(serviceId)
    }
  }

  return view
}

function applyVolumeToWebContents(webContents, volume) {
  if (!webContents || webContents.isDestroyed()) return Promise.resolve(false)
  const safeVolume = Math.max(0, Math.min(1, Number(volume)))

  return executeInWebContents(webContents, `
    (() => {
      const mediaElements = []
      const stack = [document]

      while (stack.length) {
        const root = stack.pop()
        if (!root) continue

        if (root.querySelectorAll) {
          root.querySelectorAll('audio,video').forEach((m) => mediaElements.push(m))
          root.querySelectorAll('*').forEach((el) => {
            if (el.shadowRoot) stack.push(el.shadowRoot)
          })
        }
      }

      mediaElements.forEach((media) => {
        media.volume = ${safeVolume}
        media.muted = ${safeVolume} === 0
      })

      return mediaElements.length
    })()
  `, { requireReady: false, retries: 1, label: 'set-volume' }).catch(() => false)
}

function enqueueServiceSwitch(serviceId, url, serviceData) {
  pendingSwitchCount += 1
  switchQueue = switchQueue
    .then(() => switchToService(serviceId, url, serviceData))
    .catch((error) => {
      logger.error('BrowserView', 'switch_queue_failed', {
        serviceId,
        message: error?.message || 'unknown_error',
      })
    })
    .finally(() => {
      pendingSwitchCount = Math.max(0, pendingSwitchCount - 1)
    })
  return switchQueue
}

async function switchToService(serviceId, url, serviceData) {
  return measureIfDebug('switch_service', async () => {
    const switchStartedAt = Date.now()
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (activeView && activeView === views[serviceId] && playerController.state === PLAYER_STATE.READY) {
      return
    }

    const previousServiceId = playerController.activeServiceId
    playerController.activeServiceId = serviceId
    playerController.setState(PLAYER_STATE.LOADING, `switch ${serviceId}`)

    if (activeView) {
      try {
        if (!activeView.webContents.isDestroyed()) {
          activeView.webContents.setAudioMuted(true)
        }
      } catch (_) {}

      try { mainWindow.removeBrowserView(activeView) } catch (_) {}
      if (previousServiceId && previousServiceId !== serviceId) {
        destroyBrowserViewInstance(activeView, previousServiceId)
      }
    }

    let nextView = views[serviceId]
    if (!nextView || nextView.webContents.isDestroyed()) {
      nextView = await createServiceView(serviceId, url)
    }

    if (!nextView || nextView.webContents.isDestroyed()) {
      throw new Error(`failed_to_create_view:${serviceId}`)
    }

    if (!mainWindow.isDestroyed()) {
      mainWindow.addBrowserView(nextView)
    }
    activeView = nextView
    viewMetrics.switches += 1

    if (!nextView.webContents.isDestroyed()) {
      nextView.webContents.setAudioMuted(false)
    }

    adapterManager.setActive(serviceId)
    playbackState.update({ service: serviceId })
    Object.entries(views).forEach(([id, view]) => {
      try {
        if (!view.webContents.isDestroyed()) {
          view.webContents.setAudioMuted(id !== serviceId)
        }
      } catch (_) {}
    })
    setTimeout(applyViewBounds, 50)

    mainWindow.webContents.send('service:active', {
      serviceId,
      color: serviceData?.color || '#fc3c44',
      name: serviceData?.name || serviceId,
    })

    const latencyMs = Date.now() - switchStartedAt
    performanceMetrics.switchLatencySamples += 1
    performanceMetrics.switchLatencyTotalMs += latencyMs
    performanceMetrics.switchLatencyMaxMs = Math.max(performanceMetrics.switchLatencyMaxMs, latencyMs)
    logger.info('Performance', 'switch_latency', {
      serviceId,
      targetUrl: url,
      latencyMs,
    })
  })
}

async function runPlayerAction(action, ...args) {
  return retryManager.execute(async () => {
    const result = await adapterManager.execute(action, ...args)
    if (!result?.success) {
      throw new Error(result?.reason || result?.error || 'adapter_action_failed')
    }
    if (healthMonitor) healthMonitor.recordAdapterAction()
    return result
  }, {
    label: `player_action:${action}`,
    maxAttempts: 3,
    initialDelayMs: 120,
    maxDelayMs: 1500,
  })
}

function registerIpcHandlers() {
  ;[
    'service:switch',
    'browserview:hide',
    'browserview:show',
    'player:action',
    'player:volume',
    'player:seek',
    'player:seek-to',
    'mini:toggle',
    'health:mediaSession',
    'media:update',
    'fallback:retry-manual',
    'fallback:safe-mode',
  ].forEach((channel) => ipcMain.removeAllListeners(channel))

  const performServiceSwitch = async (payload) => {
    if (!payload || !isNonEmptyString(payload.serviceId) || !isNonEmptyString(payload.url)) {
      logger.warn('IPC', 'invalid_service_switch_payload', { payload })
      return { success: false, error: 'invalid_payload' }
    }
    const { serviceId, url, service } = payload
    try {
      const parsed = new URL(url)
      // Hardening: bloquear URLs fuera de los origenes de servicios permitidos.
      if (!ALLOWED_SERVICE_ORIGINS.has(parsed.origin)) {
        logger.warn('IPC', 'blocked_service_switch_origin', { origin: parsed.origin, serviceId })
        return { success: false, error: 'blocked_origin' }
      }
    } catch {
      logger.warn('IPC', 'invalid_service_switch_url', { serviceId, url })
      return { success: false, error: 'invalid_url' }
    }
    store.set('lastService', { serviceId, url, service })
    await enqueueServiceSwitch(serviceId, url, service)
    return { success: true }
  }

  ipcMain.on('service:switch', async (_e, payload) => {
    await performServiceSwitch(payload)
  })

  ipcMain.handle('service:switch', async (_e, payload) => performServiceSwitch(payload))

  ipcMain.handle('services:getLast', () => store.get('lastService', null))

  ipcMain.handle('services:connected', async () => {
    const connected = []

    for (const id of Object.keys(views)) {
      connected.push(id)
    }

    for (const serviceDef of Object.values(SERVICES)) {
      try {
        const ses = session.fromPartition(`persist:melo-${serviceDef.id}`)
        const cookies = await ses.cookies.get({})
        if (cookies.length > 0 && !connected.includes(serviceDef.id)) {
          connected.push(serviceDef.id)
        }
      } catch (_) {}
    }

    return connected
  })

  ipcMain.on('browserview:hide', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (activeView) mainWindow.removeBrowserView(activeView)
  })

  ipcMain.on('browserview:show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (activeView) {
      const currentViews = mainWindow.getBrowserViews()
      if (!currentViews.includes(activeView)) {
        mainWindow.addBrowserView(activeView)
      }
      applyViewBounds()
    }
  })

  ipcMain.on('player:action', (_e, action) => {
    if (!isNonEmptyString(action)) {
      logger.warn('IPC', 'invalid_player_action', { action })
      return
    }
    runPlayerAction(action).catch(() => {})
  })

  ipcMain.on('player:volume', (_e, volume) => {
    if (!isFiniteNumber(volume)) {
      logger.warn('IPC', 'invalid_volume_payload', { volume })
      return
    }
    if (!activeView?.webContents) return
    if (activeView.webContents.isDestroyed()) return

    const safeVolume = Math.max(0, Math.min(1, Number(volume)))
    currentVolumeLevel = safeVolume
    store.set('volumeLevel', safeVolume)
    applyVolumeToWebContents(activeView.webContents, safeVolume).catch(() => {})
    activeView.webContents.setAudioMuted(safeVolume === 0)
  })

  ipcMain.on('player:seek', (_e, positionSeconds) => {
    if (!isFiniteNumber(positionSeconds)) {
      logger.warn('IPC', 'invalid_seek_payload', { positionSeconds })
      return
    }
    if (!activeView?.webContents) return
    if (activeView.webContents.isDestroyed()) return

    const safePosition = Math.max(0, Number(positionSeconds) || 0)
    executeInWebContents(activeView.webContents, `
      (() => {
        const mediaElements = []
        const stack = [document]

        while (stack.length) {
          const root = stack.pop()
          if (!root) continue

          if (root.querySelectorAll) {
            root.querySelectorAll('audio,video').forEach((m) => mediaElements.push(m))
            root.querySelectorAll('*').forEach((el) => {
              if (el.shadowRoot) stack.push(el.shadowRoot)
            })
          }
        }

        let changed = false
        for (const media of mediaElements) {
          if (!Number.isFinite(media.duration) || media.duration <= 0) continue
          media.currentTime = Math.max(0, Math.min(${safePosition}, media.duration))
          changed = true
        }

        return changed
      })()
    `, { requireReady: false, retries: 1, label: 'seek' }).catch(() => false)
  })

  // Soporte de seek absoluto para controles de Media Session del sistema.
  ipcMain.on('player:seek-to', (_e, positionSeconds) => {
    if (!isFiniteNumber(positionSeconds)) {
      logger.warn('IPC', 'invalid_seek_to_payload', { positionSeconds })
      return
    }
    const safePosition = Math.max(0, Number(positionSeconds) || 0)
    adapterManager.execute('seek', safePosition).catch(() => {})
  })

  // Reportes de errores del preload/renderer para trazabilidad centralizada.
  ipcMain.on('melo:reportError', (_e, payload) => {
    const normalized = sanitizeErrorPayload(payload)
    logger.error('Renderer', 'reported_error', normalized)
  })

  ipcMain.on('mini:toggle', () => {
    toggleMiniPlayer()
  })

  ipcMain.handle('debug:buttons', async () => {
    if (!activeView?.webContents) return []
    if (activeView.webContents.isDestroyed()) return []
    try {
      return await executeInWebContents(activeView.webContents, `
        [...document.querySelectorAll('button')]
          .filter(b => b.getAttribute('aria-label'))
          .map(b => ({
            label: b.getAttribute('aria-label'),
            disabled: b.disabled,
            visible: b.offsetParent !== null
          }))
      `, { requireReady: false, retries: 1, label: 'debug-buttons' })
    } catch (_) {
      return []
    }
  })

  ipcMain.handle('debug:metrics', () => getViewMetrics())
  ipcMain.handle('fallback:status', () => ({ ...fallbackStatus }))
  ipcMain.handle('fallback:retry-manual', async () => {
    updateFallbackStatus({
      phase: 'manual_retry',
      message: 'Retrying renderer manually...',
      mitigated: false,
    })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reloadIgnoringCache()
    }
    const serviceId = playerController.activeServiceId
    if (serviceId && SERVICES[serviceId]) {
      await enqueueServiceSwitch(serviceId, SERVICES[serviceId].url, SERVICES[serviceId])
    }
    return { success: true }
  })

  ipcMain.handle('fallback:safe-mode', () => {
    updateFallbackStatus({
      phase: 'safe_mode',
      stage: 'no-sandbox',
      message: 'Restarting app in safe mode...',
      mitigated: false,
    })
    const args = process.argv.slice(1)
    if (!args.includes(RENDERER_FALLBACK_FLAGS.gpu)) args.push(RENDERER_FALLBACK_FLAGS.gpu)
    if (!args.includes(RENDERER_FALLBACK_FLAGS.sandbox)) args.push(RENDERER_FALLBACK_FLAGS.sandbox)
    app.relaunch({ args })
    app.exit(0)
    return { success: true }
  })

  ipcMain.handle('debug:health', () => {
    if (!healthMonitor) return { status: 'unknown', reason: 'not_initialized' }
    return healthMonitor.check()
  })

  ipcMain.handle('debug:crash-view', (_event, payload = {}) => {
    const serviceId = payload?.serviceId
    if (!isNonEmptyString(serviceId)) {
      return { success: false, error: 'invalid_serviceId' }
    }

    const view = views[serviceId]
    if (!view?.webContents || view.webContents.isDestroyed()) {
      return { success: false, error: 'view_not_found' }
    }

    try {
      view.webContents.forcefullyCrashRenderer()
      return {
        success: true,
        serviceId,
        activeService: playerController.activeServiceId,
        isActive: playerController.activeServiceId === serviceId,
      }
    } catch (error) {
      return { success: false, error: error?.message || 'crash_failed' }
    }
  })

  ipcMain.handle('debug:validate-load-cancellation', async () => runLoadCancellationValidation())
  ipcMain.handle('debug:validate-health', async () => runHealthValidation())
  ipcMain.handle('debug:run-stress', async (_event, payload = {}) => {
    return runStressValidation(payload)
  })
  ipcMain.handle('debug:run-smoke', async () => runSmokeValidation())

  ipcMain.on('media:update', (event, data) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!data || typeof data !== 'object') return
    const serviceId = webContentsToService.get(event.sender.id)
    if (!serviceId || !data) return

    const isActiveService = (
      activeView &&
      !activeView.webContents.isDestroyed() &&
      activeView.webContents.id === event.sender.id
    )

    if (!isActiveService) return

    scheduleActiveMediaFlush(serviceId, data, (nextServiceId, nextData) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      const now = Date.now()
      const trackKey = buildTrackKey(nextData, nextServiceId)
      const isNewTrack = trackKey !== lastProcessedTrackKey

      // Estado central para evitar desincronizacion entre backend y UI.
      playbackState.update({
        trackId: trackKey,
        title: nextData.title,
        artist: nextData.artist,
        album: nextData.album,
        artwork: nextData.artwork,
        isPlaying: nextData.isPlaying ?? nextData.state === 'playing',
        service: nextServiceId,
      })

      store.set('currentTrackId', trackKey)

      const shouldUpdate = isNewTrack
        || now - _lastProgressUpdate > PROGRESS_UPDATE_INTERVAL

      if (shouldUpdate) {
        _lastProgressUpdate = now
        mainWindow.webContents.send('media:update', {
          serviceId: nextServiceId,
          ...nextData,
          isPlaying: playbackState.state.isPlaying,
        })

        if (miniWindow && !miniWindow.isDestroyed()) {
          miniWindow.webContents.send('media:update', {
            serviceId: nextServiceId,
            ...nextData,
            isPlaying: playbackState.state.isPlaying,
          })
        }
      }

      if (!isNewTrack) return

      lastProcessedTrackKey = trackKey
      _lastMediaTitle = trackKey
      logger.info('Playback', 'track_changed', {
        title: nextData.title,
        artist: nextData.artist || null,
        serviceId: nextServiceId,
      })

      updateTrayTrack({ title: nextData.title, artist: nextData.artist })
      trackPlay(nextData, nextServiceId)

      if (store.get('notificationsEnabled', SETTINGS_DEFAULTS.notificationsEnabled) && nextData.title) {
        notifyTrackChange(nextData).catch(() => {})
      }

      if (store.get('discordEnabled', false) && nextData.title) {
        const service = Object.values(SERVICES).find((s) => s.id === nextServiceId)
        discord.updatePresence({
          title: nextData.title,
          artist: nextData.artist,
          serviceName: service?.name,
        }).catch(() => {})
      }

      if (store.get('lastfmEnabled', false) && nextData.title) {
        const tId = `${nextData.title}-${nextData.artist || ''}`
        lastfm.updateNowPlaying(nextData).catch(() => {})
        if (tId !== lastScrobbled) {
          clearTimeout(scrobbleTimeout)
          scrobbleTimeout = setTimeout(() => {
            lastfm.scrobble(nextData).catch(() => {})
            lastScrobbled = tId
          }, 30000)
        }
      }
    })
  })

  ipcMain.on('health:mediaSession', (_event, payload) => {
    if (!healthMonitor) return
    const available = payload?.available !== false
    healthMonitor.setMediaSessionAvailable(available)
  })

  ipcMain.handle('stats:getHistory', (_e, payload = {}) => {
    const { limit = 100, offset = 0 } = payload || {}
    if (!isFiniteNumber(limit) || !isFiniteNumber(offset)) return []
    const plays = history.get('plays', [])
    return plays.slice(Number(offset), Number(offset) + Number(limit))
  })

  ipcMain.handle('stats:getSummary', () => {
    const plays = history.get('plays', [])
    return buildSummary(plays)
  })

  ipcMain.handle('network:status', () => ({
    online: checkConnection(),
  }))

  ipcMain.handle('player:getProgress', async () => {
    // Consultar progreso via adaptador para unificar la fuente de verdad.
    try {
      const result = await adapterManager.execute('getProgress')
      if (result?.success && result.result?.duration > 0) {
        return result.result
      }
      return {
        position: playbackState.state.currentTime || 0,
        duration: playbackState.state.duration || 0,
      }
    } catch (_) {
      return { position: 0, duration: 0 }
    }
  })

  ipcMain.handle('stats:getWrapped', (_e, payload = {}) => {
    const { from, to } = payload || {}
    const plays = history.get('plays', [])
    const filtered = plays.filter((p) => {
      if (from && p.playedAt < from) return false
      if (to && p.playedAt > to) return false
      return true
    })

    return {
      plays: filtered.length,
      period: { from, to },
      summary: buildSummary(filtered),
    }
  })

  ipcMain.handle('stats:export', () => {
    const plays = history.get('plays', [])
    return JSON.stringify(plays, null, 2)
  })

  ipcMain.handle('stats:clear', () => {
    history.set('plays', [])
    return true
  })

  ipcMain.handle('discord:toggle', async (_e, payload = {}) => {
    if (typeof payload.enabled !== 'boolean') {
      logger.warn('IPC', 'invalid_discord_payload', { payload })
      return false
    }
    const { enabled, clientId } = payload
    store.set('discordEnabled', enabled)
    if (typeof clientId === 'string') store.set('discordClientId', clientId)

    if (enabled) {
      await discord.connectDiscord(clientId || store.get('discordClientId', ''))
    } else {
      await discord.disconnectDiscord()
    }

    return discord.isConnected()
  })

  ipcMain.handle('discord:status', () => discord.isConnected())

  ipcMain.handle('lastfm:configure', (_e, cfg) => {
    if (!cfg || typeof cfg !== 'object') {
      logger.warn('IPC', 'invalid_lastfm_config', { cfg })
      return false
    }
    store.set('lastfm', cfg)
    store.set('lastfmEnabled', cfg.enabled)
    lastfm.configure(cfg)
    return true
  })

  ipcMain.handle('lastfm:auth', async () => {
    const token = await lastfm.getAuthToken()
    const url = await lastfm.getAuthUrl(token)
    await shell.openExternal(url)
    return token
  })

  ipcMain.handle('lastfm:getSession', async (_e, token) => {
    const sessionKey = await lastfm.getSession(token)
    if (sessionKey) {
      const current = store.get('lastfm', {})
      store.set('lastfm', { ...current, sessionKey })
      lastfm.configure({ ...current, sessionKey })
    }
    return sessionKey
  })

  ipcMain.handle('settings:get', () => ({
    mediaKeysEnabled: store.get('mediaKeysEnabled', SETTINGS_DEFAULTS.mediaKeysEnabled),
    discordEnabled: store.get('discordEnabled', false),
    discordClientId: store.get('discordClientId', ''),
    lastfmEnabled: store.get('lastfmEnabled', false),
    lastfm: store.get('lastfm', {}),
    statsEnabled: store.get('statsEnabled', SETTINGS_DEFAULTS.statsEnabled),
    notificationsEnabled: store.get('notificationsEnabled', SETTINGS_DEFAULTS.notificationsEnabled),
    theme: store.get('theme', 'dark'),
    accentColor: store.get('accentColor', '#fc3c44'),
    volumeLevel: store.get('volumeLevel', 1),
    autoUpdateEnabled: store.get('autoUpdateEnabled', true),
    dynamicTheme: store.get('dynamicTheme', false),
    customTheme: store.get('customTheme', null),
    trayEnabled: store.get('trayEnabled', SETTINGS_DEFAULTS.trayEnabled),
    closeBehavior: getWindowBehaviorSettings().closeBehavior,
    autostartEnabled: store.get('autostartEnabled', SETTINGS_DEFAULTS.autostartEnabled),
    startMinimized: store.get('startMinimized', SETTINGS_DEFAULTS.startMinimized),
    immersiveEnabled: store.get('immersiveEnabled', SETTINGS_DEFAULTS.immersiveEnabled),
    overlayControlsEnabled: store.get('overlayControlsEnabled', SETTINGS_DEFAULTS.overlayControlsEnabled),
    overlayPosition: store.get('overlayPosition', SETTINGS_DEFAULTS.overlayPosition),
  }))

  ipcMain.handle('settings:save', (_e, payload = {}) => {
    let updates = null

    if (isNonEmptyString(payload.key)) {
      updates = { [payload.key]: payload.value }
    } else if (payload && typeof payload === 'object') {
      updates = { ...payload }
    }

    if (!updates || Object.keys(updates).length === 0) return false

    if (Object.prototype.hasOwnProperty.call(updates, 'trayEnabled')) {
      updates.trayEnabled = updates.trayEnabled !== false
      store.set('trayEnabled', updates.trayEnabled)
      if (updates.trayEnabled === false) {
        updates.closeBehavior = 'quit'
      }
      syncTrayWithSettings()
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'mediaKeysEnabled')) {
      updates.mediaKeysEnabled = updates.mediaKeysEnabled !== false
      store.set('mediaKeysEnabled', updates.mediaKeysEnabled)
      try {
        syncMediaShortcutsWithSettings()
      } catch (error) {
        logger.warn('Shortcuts', '[settings] sync_media_shortcuts_failed', {
          message: error?.message || 'unknown_error',
        })
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'notificationsEnabled')) {
      updates.notificationsEnabled = updates.notificationsEnabled !== false
      store.set('notificationsEnabled', updates.notificationsEnabled)
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'closeBehavior')) {
      updates.closeBehavior = updates.closeBehavior === 'quit' ? 'quit' : 'tray'
      const trayEnabled = Object.prototype.hasOwnProperty.call(updates, 'trayEnabled')
        ? updates.trayEnabled
        : store.get('trayEnabled', SETTINGS_DEFAULTS.trayEnabled) !== false
      if (!trayEnabled) updates.closeBehavior = 'quit'
      store.set('closeBehavior', updates.closeBehavior)
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'autostartEnabled')) {
      updates.autostartEnabled = updates.autostartEnabled === true
      store.set('autostartEnabled', updates.autostartEnabled)
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'startMinimized')) {
      updates.startMinimized = updates.startMinimized !== false
      store.set('startMinimized', updates.startMinimized)
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (['trayEnabled', 'closeBehavior', 'autostartEnabled', 'startMinimized', 'mediaKeysEnabled', 'notificationsEnabled', 'immersiveEnabled', 'overlayControlsEnabled', 'overlayPosition'].includes(key)) return
      store.set(key, value)
    })

    if (updates.autoUpdateEnabled === true) {
      setupAutoUpdater(mainWindow)
    }

    const autostartRelatedChange =
      Object.prototype.hasOwnProperty.call(updates, 'autostartEnabled')
      || Object.prototype.hasOwnProperty.call(updates, 'startMinimized')
    if (autostartRelatedChange) {
      try {
        const autostartEnabled = store.get('autostartEnabled', SETTINGS_DEFAULTS.autostartEnabled) === true
        const startMinimized = store.get('startMinimized', SETTINGS_DEFAULTS.startMinimized) !== false
        if (autostartEnabled) {
          enableAutostart({ execPath: process.execPath, startMinimized })
        } else {
          disableAutostart()
        }
      } catch (error) {
        logger.error('Autostart', 'apply_failed', {
          message: error?.message || 'unknown_error',
        })
      }
    }

    const immersiveRelatedChange =
      Object.prototype.hasOwnProperty.call(updates, 'immersiveEnabled')
      || Object.prototype.hasOwnProperty.call(updates, 'overlayControlsEnabled')
      || Object.prototype.hasOwnProperty.call(updates, 'overlayPosition')
    if (immersiveRelatedChange) {
      try {
        if (Object.prototype.hasOwnProperty.call(updates, 'immersiveEnabled')) {
          updates.immersiveEnabled = updates.immersiveEnabled === true
          store.set('immersiveEnabled', updates.immersiveEnabled)
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'overlayControlsEnabled')) {
          updates.overlayControlsEnabled = updates.overlayControlsEnabled !== false
          store.set('overlayControlsEnabled', updates.overlayControlsEnabled)
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'overlayPosition')) {
          const pos = updates.overlayPosition
          if (pos === 'top' || pos === 'bottom') {
            store.set('overlayPosition', pos)
          }
        }
        setTimeout(() => applyViewBounds(), 50)
      } catch (error) {
        logger.warn('Immersive', 'apply_failed', {
          message: error?.message || 'unknown_error',
        })
      }
    }

    return true
  })

  ipcMain.handle('window:action', (_e, action) => {
    if (!isNonEmptyString(action)) return false
    if (!mainWindow || mainWindow.isDestroyed()) return false
    if (action === 'minimize') mainWindow.minimize()
    if (action === 'maximize-toggle') {
      mainWindow.isMaximized()
        ? mainWindow.unmaximize()
        : mainWindow.maximize()
    }
    if (action === 'close') mainWindow.close()
    return true
  })

  ipcMain.handle('notification:show', (_e, payload = {}) => {
    if (!payload || typeof payload !== 'object') return false
    const { title, body, silent } = payload
    if (!isNonEmptyString(title)) return false
    new Notification({ title, body, silent: silent ?? true }).show()
    return true
  })

}

function registerGlobalShortcuts() {
  syncMediaShortcutsWithSettings()
  try {
    if (!globalShortcut.isRegistered('CommandOrControl+Shift+M')) {
      globalShortcut.register('CommandOrControl+Shift+M', () =>
        toggleMiniPlayer())
    }
  } catch (error) {
    logger.warn('Shortcuts', '[settings] register_shortcut_failed', {
      accelerator: 'CommandOrControl+Shift+M',
      message: error?.message || 'unknown_error',
    })
  }
}

function unregisterMediaShortcuts() {
  MEDIA_SHORTCUTS.forEach((accelerator) => {
    try {
      globalShortcut.unregister(accelerator)
    } catch (error) {
      logger.warn('Shortcuts', '[settings] unregister_shortcut_failed', {
        accelerator,
        message: error?.message || 'unknown_error',
      })
    }
  })
}

function registerMediaShortcuts() {
  const handlers = {
    MediaPlayPause: () => runPlayerAction('play').catch(() => {}),
    MediaNextTrack: () => runPlayerAction('next').catch(() => {}),
    MediaPreviousTrack: () => runPlayerAction('previous').catch(() => {}),
  }

  MEDIA_SHORTCUTS.forEach((accelerator) => {
    try {
      if (globalShortcut.isRegistered(accelerator)) return
      globalShortcut.register(accelerator, handlers[accelerator])
    } catch (error) {
      logger.warn('Shortcuts', '[settings] register_media_shortcut_failed', {
        accelerator,
        message: error?.message || 'unknown_error',
      })
    }
  })
}

function syncMediaShortcutsWithSettings() {
  const mediaKeysEnabled = store.get('mediaKeysEnabled', SETTINGS_DEFAULTS.mediaKeysEnabled) !== false
  if (mediaKeysEnabled) {
    registerMediaShortcuts()
  } else {
    unregisterMediaShortcuts()
  }
}

app.whenReady().then(async () => {
  const isStressRun = process.env.MELO_RUN_STRESS === '1'
  const isSmokeRun = process.env.MELO_RUN_SMOKE === '1'
  const isTestRun = isStressRun || isSmokeRun
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  if (isTestRun && !hasDisplay) {
    const reportName = isStressRun ? 'stress-report' : 'smoke-report'
    const invalid = isStressRun
      ? {
        verdict: 'INVALID_ENVIRONMENT',
        reason: 'no_graphical_display',
        success: false,
        switches: 0,
        successfulSwitches: 0,
      }
      : {
        verdict: 'INVALID_ENVIRONMENT',
        reason: 'no_graphical_display',
        success: false,
        details: {
          DISPLAY: process.env.DISPLAY || '',
          WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || '',
          XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE || '',
          XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '',
        },
      }
    writeTestReport(reportName, invalid)
    logger.error('Main', 'invalid_environment', invalid)
    setTimeout(() => app.quit(), 100)
    return
  }

  if (process.platform !== 'linux') {
    dialog.showErrorBox('Melo', 'This build is currently supported only on Linux.')
    app.quit()
    return
  }

  const isAutostartLaunch = process.argv.includes('--autostart')
  const startMinimized = store.get('startMinimized', SETTINGS_DEFAULTS.startMinimized) !== false
  launchStartsMinimized = isAutostartLaunch && startMinimized

  logger.info('Environment', 'runtime_diagnostics', getRuntimeDiagnostics())
  try {
    logger.info('Environment', 'gpu_status', app.getGPUFeatureStatus())
  } catch (_) {}

  // Inicializar caché de artworks para MPRIS y notificaciones
  const ArtworkCache = require('./services/ArtworkCache')
  try {
    await ArtworkCache.init()
  } catch (_) {
    logger.warn('Main', 'artwork_cache_init_failed')
  }

  try {
    if (components?.whenReady) {
      await components.whenReady()
      logger.info('Main', 'widevine_ready')
    }
  } catch (_) {
    logger.warn('Main', 'widevine_unavailable')
  }

  const discordEnabled = store.get('discordEnabled', false)
  const discordClientId = store.get('discordClientId', '')
  if (discordEnabled && discordClientId) {
    discord.connectDiscord(discordClientId).catch(() => {})
  }

  const lfmConfig = store.get('lastfm', {})
  if (lfmConfig.apiKey && lfmConfig.sessionKey) {
    lastfm.configure(lfmConfig)
  }

  Menu.setApplicationMenu(null)

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: wss:"
        ]
      }
    })
  })

  createMainWindow()
  updateFallbackStatus({
    phase: fallbackStatus.phase,
    stage: fallbackStatus.stage,
    message: fallbackStatus.message,
    mitigated: fallbackStatus.mitigated,
  })
  syncTrayWithSettings()
  registerIpcHandlers()
  registerGlobalShortcuts()

  if (process.platform === 'linux') {
    startMpris({
      getState: () => playbackState.getCurrent(),
      onStateChange: (cb) => {
        if (typeof cb !== 'function') return () => {}
        playbackState.onUpdate(cb)
        return () => playbackState.onUpdate(() => {})
      },
      onPlayerAction: (action) => {
        try {
          if (action === 'raise') {
            if (!mainWindow || mainWindow.isDestroyed()) return
            mainWindow.setSkipTaskbar(false)
            if (!mainWindow.isVisible()) mainWindow.show()
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
            return
          }

          if (action === 'quit') {
            isQuitting = true
            app.quit()
            return
          }

          const actionMap = {
            play: 'play',
            pause: 'play',
            playpause: 'play',
            next: 'next',
            previous: 'previous',
          }

          const mappedAction = actionMap[action]
          if (!mappedAction) return
          runPlayerAction(mappedAction).catch(() => {})
        } catch (error) {
          logger.warn('MPRIS', '[mpris] action_failed', {
            action,
            message: error?.message || 'unknown_error',
          })
        }
      },
      logger,
    }).catch(() => {})
  }

  startMetricsReporter(5000)

  healthMonitor = new HealthMonitor(playbackState, logger)
  healthMonitor.recordAdapterAction()
  healthMonitor.initialize(5000)
  healthMonitor.subscribe((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('health:status', status)
    }
  })

  checkConnection()
  networkStatusTimer = setInterval(() => {
    const wasOnline = isOnline
    const nowOnline = checkConnection()
    if (wasOnline !== nowOnline && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('network:status', { online: nowOnline })
    }
  }, 5000)

  if (DEBUG_PLAYER) {
    startMemoryMonitoring(30000)
  }
  if (store.get('autoUpdateEnabled', true)) {
    setupAutoUpdater(mainWindow)
  }

  if (process.env.MELO_RUN_STRESS === '1') {
    const iterations = Number(process.env.MELO_STRESS_SWITCHES || 40)
    const minDelayMs = Number(process.env.MELO_STRESS_MIN_DELAY || 50)
    const maxDelayMs = Number(process.env.MELO_STRESS_MAX_DELAY || 300)

    try {
      const report = await runStressValidation({ iterations, minDelayMs, maxDelayMs })
      logger.info('StressTest', 'completed', report)
    } catch (error) {
      const failedReport = {
        success: false,
        error: error?.message || 'stress_failed',
      }
      const reportPath = writeTestReport('stress-report', failedReport)
      logger.error('StressTest', 'failed', { ...failedReport, reportPath })
    } finally {
      setTimeout(() => app.quit(), 300)
    }
  }

  if (process.env.MELO_RUN_SMOKE === '1') {
    try {
      const report = await runSmokeValidation()
      logger.info('SmokeTest', 'completed', report)
    } catch (error) {
      const failedReport = {
        success: false,
        error: error?.message || 'smoke_failed',
      }
      const reportPath = writeTestReport('smoke-report', failedReport)
      logger.error('SmokeTest', 'failed', { ...failedReport, reportPath })
    } finally {
      setTimeout(() => app.quit(), 300)
    }
  }
})

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createMainWindow()
    return
  }
  mainWindow.setSkipTaskbar(false)
  if (!mainWindow.isVisible()) mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('before-quit', async () => {
  isQuitting = true
  // Esperar limpieza completa para evitar procesos huerfanos.
  await cleanupAllResources()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('quit', () => {
  process.exit(0)
})

process.on('exit', () => {
  if (processMetricsTimer) {
    clearInterval(processMetricsTimer)
    processMetricsTimer = null
  }
  if (metricsBroadcastTimer) {
    clearInterval(metricsBroadcastTimer)
    metricsBroadcastTimer = null
  }
  if (networkStatusTimer) {
    clearInterval(networkStatusTimer)
    networkStatusTimer = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})