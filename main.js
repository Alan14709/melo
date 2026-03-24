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
  nativeImage,
  net,
} = require('electron')
const path = require('path')
const fs = require('fs')
const Store = require('electron-store')
const discord = require('./integrations/discord')
const lastfm = require('./integrations/lastfm')
const { notifyTrackChange } = require('./integrations/notifications')
const { setupAutoUpdater } = require('./integrations/updater')

// Configuracion de Widevine para DRM.
app.commandLine.appendSwitch('enable-features', 'WidevineCdm')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.commandLine.appendSwitch(
  'unsafely-treat-insecure-origin-as-secure',
  'http://localhost:5173'
)


if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-setuid-sandbox')
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('in-process-gpu')
  app.commandLine.appendSwitch(
    'disable-features',
    'VizDisplayCompositor,UseSkiaRenderer'
  )
}

app.disableHardwareAcceleration()

// Cargar flags adicionales por sistema operativo.
try {
  const flagsFile = path.join(__dirname, 'electron-flags.json')
  if (fs.existsSync(flagsFile)) {
    const flags = JSON.parse(fs.readFileSync(flagsFile, 'utf8'))
    const platformFlags = flags[process.platform] || []
    platformFlags.forEach((flag) => {
      app.commandLine.appendSwitch(flag.replace('--', ''))
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

let lastScrobbled = null
let scrobbleTimeout = null
let currentTrackStart = null
let currentTrackData = null
let currentVolumeLevel = Math.max(0, Math.min(1, Number(store.get('volumeLevel', 1))))
let sleepTimer = null
let sleepFadeInterval = null
let sleepAfterSongAnchor = null
const lastMediaSignatureByService = new Map()
let processMetricsTimer = null
let networkStatusTimer = null
let isOnline = true
let isCleaningUp = false
let isExecutingScript = false
const DEBUG_PLAYER = process.env.MELO_DEBUG_PLAYER === '1' || !app.isPackaged

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
      console.log('[player]', ...args)
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

const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.quit()
  process.exit(0)
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
} = {}) {
  return playerController.enqueue(async () => {
    if (!webContents || webContents.isDestroyed()) return null
    if (!playerController.canExecute(requireReady)) return null

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        if (isExecutingScript) return null
        isExecutingScript = true
        const result = await webContents.executeJavaScript(script)
        isExecutingScript = false
        if (attempt > 1) {
          playerController.log(`${label} recovered on retry #${attempt - 1}`)
        }
        return result
      } catch (err) {
        isExecutingScript = false
        playerController.log(`${label} failed attempt ${attempt}:`, err?.message || err)
        if (attempt > retries) throw err
      }
    }
    return null
  })
}

function getContentBounds() {
  if (!mainWindow) return { x: 220, y: 45, width: 980, height: 633 }
  const b = mainWindow.getContentBounds()
  return {
    x: 220,
    y: 45,
    width: Math.max(360, b.width - 220),
    height: Math.max(200, b.height - 45 - 72),
  }
}

function logProcessMetrics(tag = 'metrics') {
  if (!DEBUG_PLAYER) return
  try {
    const mem = process.memoryUsage()
    const mb = (v) => Math.round((v / 1024 / 1024) * 10) / 10
    const metricsCount = app.getAppMetrics().length
    console.log(
      `[player] ${tag} rss=${mb(mem.rss)}MB heap=${mb(mem.heapUsed)}MB appMetrics=${metricsCount}`
    )
  } catch (_) {}
}

function destroyBrowserViewInstance(view, serviceId = 'unknown') {
  if (!view) return
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
  }
}

function cleanupAllResources() {
  if (isCleaningUp) return
  isCleaningUp = true

  clearSleepTimer()
  clearTimeout(scrobbleTimeout)
  globalShortcut.unregisterAll()
  discord.disconnectDiscord().catch(() => {})

  if (processMetricsTimer) {
    clearInterval(processMetricsTimer)
    processMetricsTimer = null
  }

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

  // Mostrar cuando el renderer este listo para evitar blanco/parpadeo en prod.
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
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

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL)
    if (app.isPackaged) {
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html')).catch(() => {})
      }, 1000)
    }
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Render process gone:', details.reason)
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

  mainWindow.on('close', () => {
    // Cierre directo: no mantener procesos en background.
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

function clearSleepTimer() {
  if (sleepTimer) {
    clearTimeout(sleepTimer)
    sleepTimer = null
  }
  if (sleepFadeInterval) {
    clearInterval(sleepFadeInterval)
    sleepFadeInterval = null
  }
}

async function startFadeOut(durationMs = 3000) {
  if (!activeView?.webContents) return
  const steps = 20
  const stepTime = durationMs / steps
  let step = 0

  return new Promise((resolve) => {
    sleepFadeInterval = setInterval(async () => {
      step += 1
      const vol = Math.max(0, 1 - (step / steps))
      try {
        await executeInWebContents(activeView.webContents, `
          (() => {
            const media = document.querySelector('video, audio')
            if (media) media.volume = ${vol}
          })()
        `, { requireReady: false, retries: 1, label: 'sleep-fade' })
      } catch (_) {}

      if (step >= steps) {
        clearInterval(sleepFadeInterval)
        sleepFadeInterval = null
        resolve()
      }
    }, stepTime)
  })
}

async function triggerSleepNow() {
  await startFadeOut(3000)
  await runPlayerAction('play')
  store.set('sleepActive', false)
  store.set('sleepAfterSong', false)
  store.delete('sleepEndsAt')
  sleepAfterSongAnchor = null
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sleep:triggered')
  }
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.png')

    if (!fs.existsSync(iconPath)) {
      console.warn('Tray: icono no encontrado en', iconPath)
      return
    }

    let icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      console.warn('Tray: icono vacio, omitiendo tray')
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
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch (err) {
    console.error('Error al crear tray:', err.message)
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
    console.error('Error al renderizar menu del tray:', err.message)
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

function createServiceView(serviceId, url) {
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

  if (view.webContents.getURL() !== url) {
    view.webContents.loadURL(url)
  }

  view.webContents.removeAllListeners('did-start-loading')
  view.webContents.on('did-start-loading', () => {
    playerController.setState(PLAYER_STATE.LOADING, `did-start-loading ${serviceId}`)
  })

  view.webContents.removeAllListeners('did-fail-load')
  view.webContents.on('did-fail-load', () => {
    playerController.setState(PLAYER_STATE.ERROR, `did-fail-load ${serviceId}`)
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
  webContentsToService.set(view.webContents.id, serviceId)

  view.webContents.on('destroyed', () => {
    webContentsToService.delete(view.webContents.id)
    delete views[serviceId]
    if (playerController.activeServiceId === serviceId) {
      playerController.setState(PLAYER_STATE.NOT_LOADED, `destroyed ${serviceId}`)
    }
  })

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

async function switchToService(serviceId, url, serviceData) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (activeView && activeView === views[serviceId] && playerController.state === PLAYER_STATE.READY) {
    return
  }

  const previousServiceId = playerController.activeServiceId

  playerController.activeServiceId = serviceId
  playerController.setState(PLAYER_STATE.LOADING, `switch ${serviceId}`)

  if (activeView) {
    try {
      // Mutear inmediatamente para evitar overlap de audio.
      if (!activeView.webContents.isDestroyed()) {
        activeView.webContents.setAudioMuted(true)
      }

      // Pausar con timeout de seguridad.
      await Promise.race([
        executeInWebContents(activeView.webContents, `
          (() => {
            for (const btn of document.querySelectorAll('button')) {
              const label = (btn.getAttribute('aria-label') || '')
                .toLowerCase()
              if ((label.includes('pause') || label.includes('pausar'))
                  && !btn.disabled && btn.offsetParent !== null) {
                btn.click()
                return true
              }
            }
            return false
          })()
        `, { requireReady: false, retries: 1, label: 'pause-previous-service' }).catch(() => false),
        new Promise((r) => setTimeout(r, 500))
      ])
    } catch (_) {}

    try { mainWindow.removeBrowserView(activeView) } catch (_) {}
    if (previousServiceId && previousServiceId !== serviceId) {
      destroyBrowserViewInstance(activeView, previousServiceId)
    }
  }

  const nextView = createServiceView(serviceId, url)

  if (!nextView.webContents.isDestroyed()) {
    nextView.webContents.setAudioMuted(false)
  }

  mainWindow.addBrowserView(nextView)
  activeView = nextView
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
}

async function runPlayerAction(action) {
  if (!activeView?.webContents) return
  if (activeView.webContents.isDestroyed()) return
  if (playerController.state !== PLAYER_STATE.READY) {
    playerController.log('ignored action while not ready:', action, playerController.state)
    return
  }

  const mediaKeys = {
    play: 'MediaPlayPause',
    next: 'MediaNextTrack',
    previous: 'MediaPreviousTrack',
  }

  // Enfocar la vista activa para mejorar la recepcion de input events.
  try {
    activeView.webContents.focus()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus()
  } catch (_) {}

  const scripts = {
    play: `(() => {
      const selectors = [
        '[data-testid="control-button-playpause"]',
        '[data-testid="play-pause-btn"]',
        'button.play-pause-btn',
        'amp-chrome-player .playback-play',
        '.player-controls .playback-play',
        '[aria-label="Play"]',
        '[aria-label="Pause"]',
        '[aria-label="Reproducir"]',
        '[aria-label="Pausar"]',
        '[aria-label*="Play"]',
        '[aria-label*="Pause"]',
        '[aria-label*="Reproducir"]',
        '[aria-label*="Pausar"]',
        'tp-yt-paper-icon-button[title*="Play"]',
        'tp-yt-paper-icon-button[title*="Pause"]',
      ]

      const words = ['play', 'pause', 'reproducir', 'pausar']

      function allRoots(start = document) {
        const roots = [start]
        const queue = [start]
        while (queue.length) {
          const node = queue.shift()
          const elements = node.querySelectorAll ? node.querySelectorAll('*') : []
          for (const el of elements) {
            if (el.shadowRoot) {
              roots.push(el.shadowRoot)
              queue.push(el.shadowRoot)
            }
          }
        }
        return roots
      }

      function canClick(el) {
        if (!el || el.disabled) return false
        const style = window.getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') return false
        return true
      }

      function click(el) {
        if (!canClick(el)) return false
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      }

      for (const root of allRoots()) {
        for (const sel of selectors) {
          const el = root.querySelector?.(sel)
          if (click(el)) return 'selector:' + sel
        }
      }

      for (const root of allRoots()) {
        const buttons = root.querySelectorAll?.('button,[role="button"],tp-yt-paper-icon-button') || []
        for (const el of buttons) {
          const text = [
            el.getAttribute('aria-label') || '',
            el.getAttribute('title') || '',
            el.textContent || ''
          ].join(' ').toLowerCase()

          if (words.some((w) => text.includes(w)) && click(el)) {
            return 'label:' + text.slice(0, 80)
          }
        }
      }

      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }))
      return 'fallback:space'
    })()`,

    next: `(() => {
      const selectors = [
        '[data-testid="control-button-skip-forward"]',
        '[data-testid="next-btn"]',
        '[aria-label="Next"]',
        '[aria-label="Siguiente"]',
        '[aria-label*="Next"]',
        '[aria-label*="Siguiente"]',
        '[title*="Next"]',
        '[title*="Siguiente"]',
        'tp-yt-paper-icon-button[title*="Next"]',
        'tp-yt-paper-icon-button[title*="Siguiente"]',
      ]

      const words = ['next', 'siguiente', 'skip forward']

      function allRoots(start = document) {
        const roots = [start]
        const queue = [start]
        while (queue.length) {
          const node = queue.shift()
          const elements = node.querySelectorAll ? node.querySelectorAll('*') : []
          for (const el of elements) {
            if (el.shadowRoot) {
              roots.push(el.shadowRoot)
              queue.push(el.shadowRoot)
            }
          }
        }
        return roots
      }

      function canClick(el) {
        if (!el || el.disabled) return false
        const style = window.getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') return false
        return true
      }

      function click(el) {
        if (!canClick(el)) return false
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      }

      for (const root of allRoots()) {
        for (const sel of selectors) {
          const el = root.querySelector?.(sel)
          if (click(el)) return 'selector:' + sel
        }
      }

      for (const root of allRoots()) {
        const buttons = root.querySelectorAll?.('button,[role="button"],tp-yt-paper-icon-button') || []
        for (const el of buttons) {
          const text = [
            el.getAttribute('aria-label') || '',
            el.getAttribute('title') || '',
            el.textContent || ''
          ].join(' ').toLowerCase()

          if (words.some((w) => text.includes(w)) && click(el)) {
            return 'label:' + text.slice(0, 80)
          }
        }
      }

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }))
      return 'fallback:arrow-right'
    })()`,

    previous: `(() => {
      const selectors = [
        '[data-testid="control-button-skip-back"]',
        '[data-testid="previous-btn"]',
        '[aria-label="Previous"]',
        '[aria-label="Anterior"]',
        '[aria-label*="Previous"]',
        '[aria-label*="Anterior"]',
        '[title*="Previous"]',
        '[title*="Anterior"]',
        'tp-yt-paper-icon-button[title*="Previous"]',
        'tp-yt-paper-icon-button[title*="Anterior"]',
      ]

      const words = ['prev', 'previous', 'anterior', 'skip back']

      function allRoots(start = document) {
        const roots = [start]
        const queue = [start]
        while (queue.length) {
          const node = queue.shift()
          const elements = node.querySelectorAll ? node.querySelectorAll('*') : []
          for (const el of elements) {
            if (el.shadowRoot) {
              roots.push(el.shadowRoot)
              queue.push(el.shadowRoot)
            }
          }
        }
        return roots
      }

      function canClick(el) {
        if (!el || el.disabled) return false
        const style = window.getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') return false
        return true
      }

      function click(el) {
        if (!canClick(el)) return false
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      }

      for (const root of allRoots()) {
        for (const sel of selectors) {
          const el = root.querySelector?.(sel)
          if (click(el)) return 'selector:' + sel
        }
      }

      for (const root of allRoots()) {
        const buttons = root.querySelectorAll?.('button,[role="button"],tp-yt-paper-icon-button') || []
        for (const el of buttons) {
          const text = [
            el.getAttribute('aria-label') || '',
            el.getAttribute('title') || '',
            el.textContent || ''
          ].join(' ').toLowerCase()

          if (words.some((w) => text.includes(w)) && click(el)) {
            return 'label:' + text.slice(0, 80)
          }
        }
      }

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }))
      return 'fallback:arrow-left'
    })()`
  }

  if (!scripts[action]) return

  try {
    const result = await executeInWebContents(
      activeView.webContents,
      scripts[action],
      { requireReady: true, retries: 2, label: `action:${action}` }
    )
    console.log(`Player action [${action}] -> ${result}`)
  } catch (err) {
    if (mediaKeys[action]) {
      try {
        activeView.webContents.sendInputEvent({
          type: 'keyDown',
          keyCode: mediaKeys[action],
        })
        activeView.webContents.sendInputEvent({
          type: 'keyUp',
          keyCode: mediaKeys[action],
        })
      } catch (_) {}
    }
    console.error(`Player action [${action}] failed:`, err.message)
  }
}

function registerIpcHandlers() {
  ;[
    'service:switch',
    'browserview:hide',
    'browserview:show',
    'player:action',
    'player:volume',
    'player:seek',
    'mini:toggle',
    'media:update',
  ].forEach((channel) => ipcMain.removeAllListeners(channel))

  ipcMain.on('service:switch', async (_e, { serviceId, url, service }) => {
    store.set('lastService', { serviceId, url, service })
    await switchToService(serviceId, url, service)
  })

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
    runPlayerAction(action).catch(() => {})
  })

  ipcMain.on('player:volume', (_e, volume) => {
    if (!activeView?.webContents) return
    if (activeView.webContents.isDestroyed()) return

    const safeVolume = Math.max(0, Math.min(1, Number(volume)))
    currentVolumeLevel = safeVolume
    store.set('volumeLevel', safeVolume)
    applyVolumeToWebContents(activeView.webContents, safeVolume).catch(() => {})
    activeView.webContents.setAudioMuted(safeVolume === 0)
  })

  ipcMain.on('player:seek', (_e, positionSeconds) => {
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

  ipcMain.on('media:update', (event, data) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const serviceId = webContentsToService.get(event.sender.id)
    if (!serviceId || !data) return

    const isActiveService = (
      activeView &&
      !activeView.webContents.isDestroyed() &&
      activeView.webContents.id === event.sender.id
    )

    if (!isActiveService) return

    // Deteccion mejorada: Apple Music a veces no reporta `playing` en Media Session.
    const isPlaying = (
      data.state === 'playing' ||
      (data.title != null && data.state !== 'paused' && data.state !== 'none')
    )

    const trackId = data.title ? `${data.title}-${data.artist || ''}` : null
    store.set('currentTrackId', trackId)

    if (store.get('sleepAfterSong', false)) {
      if (!sleepAfterSongAnchor && trackId) {
        sleepAfterSongAnchor = trackId
      } else if (trackId && sleepAfterSongAnchor && trackId !== sleepAfterSongAnchor) {
        clearSleepTimer()
        triggerSleepNow().catch(() => {})
      }
    }

    const signature = [
      data.title || '',
      data.artist || '',
      data.album || '',
      data.artwork || '',
      isPlaying ? '1' : '0',
    ].join('|')

    if (lastMediaSignatureByService.get(serviceId) === signature) {
      return
    }
    lastMediaSignatureByService.set(serviceId, signature)

    mainWindow.webContents.send('media:update', {
      serviceId,
      ...data,
      isPlaying,
    })

    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('media:update', {
        serviceId,
        ...data,
        isPlaying,
      })
    }

    updateTrayTrack({
      title: data.title,
      artist: data.artist,
    })

    trackPlay(data, serviceId)

    if (store.get('notificationsEnabled', true) && data.title) {
      notifyTrackChange({
        title: data.title,
        artist: data.artist,
        artwork: data.artwork,
      }).catch(() => {})
    }

    if (store.get('discordEnabled', false) && data.title) {
      const service = Object.values(SERVICES)
        .find((s) => s.id === serviceId)
      discord.updatePresence({
        title: data.title,
        artist: data.artist,
        serviceName: service?.name,
      }).catch(() => {})
    }

    if (store.get('lastfmEnabled', false) && data.title) {
      const trackId = `${data.title}-${data.artist || ''}`
      lastfm.updateNowPlaying(data).catch(() => {})
      if (trackId !== lastScrobbled) {
        clearTimeout(scrobbleTimeout)
        scrobbleTimeout = setTimeout(() => {
          lastfm.scrobble(data).catch(() => {})
          lastScrobbled = trackId
        }, 30000)
      }
    }
  })

  ipcMain.handle('stats:getHistory', (_e, { limit = 100, offset = 0 } = {}) => {
    const plays = history.get('plays', [])
    return plays.slice(offset, offset + limit)
  })

  ipcMain.handle('stats:getSummary', () => {
    const plays = history.get('plays', [])
    return buildSummary(plays)
  })

  ipcMain.handle('network:status', () => ({
    online: checkConnection(),
  }))

  ipcMain.handle('player:getProgress', async () => {
    if (!activeView?.webContents) return { position: 0, duration: 0 }
    if (activeView.webContents.isDestroyed()) return { position: 0, duration: 0 }

    try {
      const progress = await executeInWebContents(activeView.webContents, `
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

          for (const media of mediaElements) {
            if (!Number.isFinite(media.duration) || media.duration <= 0) continue
            return {
              position: Number(media.currentTime) || 0,
              duration: Number(media.duration) || 0,
            }
          }

          return { position: 0, duration: 0 }
        })()
      `, { requireReady: false, retries: 1, label: 'get-progress' })

      return progress || { position: 0, duration: 0 }
    } catch (_) {
      return { position: 0, duration: 0 }
    }
  })

  ipcMain.handle('stats:getWrapped', (_e, { from, to } = {}) => {
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

  ipcMain.handle('discord:toggle', async (_e, { enabled, clientId }) => {
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
    discordEnabled: store.get('discordEnabled', false),
    discordClientId: store.get('discordClientId', ''),
    lastfmEnabled: store.get('lastfmEnabled', false),
    lastfm: store.get('lastfm', {}),
    notificationsEnabled: store.get('notificationsEnabled', true),
    theme: store.get('theme', 'dark'),
    accentColor: store.get('accentColor', '#fc3c44'),
    volumeLevel: store.get('volumeLevel', 1),
    autoUpdateEnabled: store.get('autoUpdateEnabled', true),
    dynamicTheme: store.get('dynamicTheme', false),
    customTheme: store.get('customTheme', null),
  }))

  ipcMain.handle('settings:save', (_e, { key, value }) => {
    if (!key) return false
    store.set(key, value)
    if (key === 'autoUpdateEnabled' && value === true) {
      setupAutoUpdater(mainWindow)
    }
    return true
  })

  ipcMain.handle('window:action', (_e, action) => {
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

  ipcMain.handle('notification:show', (_e, { title, body, silent }) => {
    new Notification({ title, body, silent: silent ?? true }).show()
  })

  ipcMain.handle('sleep:set', async (_e, { minutes, afterSong }) => {
    clearSleepTimer()

    if (afterSong) {
      store.set('sleepAfterSong', true)
      store.set('sleepActive', true)
      sleepAfterSongAnchor = store.get('currentTrackId', null)
      store.delete('sleepEndsAt')
      return { active: true, afterSong: true }
    }

    if (!minutes || minutes <= 0) {
      store.set('sleepActive', false)
      store.set('sleepAfterSong', false)
      store.delete('sleepEndsAt')
      return { active: false }
    }

    const ms = minutes * 60 * 1000
    const endsAt = Date.now() + ms

    store.set('sleepActive', true)
    store.set('sleepAfterSong', false)
    store.set('sleepEndsAt', endsAt)

    sleepTimer = setTimeout(async () => {
      await triggerSleepNow()
    }, ms)

    return { active: true, endsAt }
  })

  ipcMain.handle('sleep:cancel', () => {
    clearSleepTimer()
    store.set('sleepActive', false)
    store.set('sleepAfterSong', false)
    store.delete('sleepEndsAt')
    sleepAfterSongAnchor = null
    return { active: false }
  })

  ipcMain.handle('sleep:status', () => ({
    active: store.get('sleepActive', false),
    endsAt: store.get('sleepEndsAt', null),
    afterSong: store.get('sleepAfterSong', false),
  }))
}

function registerGlobalShortcuts() {
  globalShortcut.register('MediaPlayPause', () =>
    runPlayerAction('play').catch(() => {}))
  globalShortcut.register('MediaNextTrack', () =>
    runPlayerAction('next').catch(() => {}))
  globalShortcut.register('MediaPreviousTrack', () =>
    runPlayerAction('previous').catch(() => {}))
  globalShortcut.register('CommandOrControl+Shift+M', () =>
    toggleMiniPlayer())
}

app.whenReady().then(async () => {
  try {
    if (components?.whenReady) {
      await components.whenReady()
      console.log('Widevine CDM disponible via Castlabs')
    }
  } catch (_) {
    console.warn('Widevine no disponible')
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
  createTray()
  registerIpcHandlers()
  registerGlobalShortcuts()

  checkConnection()
  networkStatusTimer = setInterval(() => {
    const wasOnline = isOnline
    const nowOnline = checkConnection()
    if (wasOnline !== nowOnline && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('network:status', { online: nowOnline })
    }
  }, 5000)

  if (DEBUG_PLAYER) {
    processMetricsTimer = setInterval(() => {
      logProcessMetrics('heartbeat')
    }, 30000)
  }
  if (store.get('autoUpdateEnabled', true)) {
    setupAutoUpdater(mainWindow)
  }
})

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!mainWindow.isVisible()) mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('before-quit', () => {
  isQuitting = true
  cleanupAllResources()
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

// En createMainWindow(), justo antes del if (app.isPackaged)
console.log('__dirname:', __dirname)
console.log('preload path:', path.join(__dirname, 'preload.js'))
console.log('renderer path:', path.join(__dirname, 'dist/renderer/index.html'))