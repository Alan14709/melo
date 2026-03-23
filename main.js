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
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('in-process-gpu')
  app.commandLine.appendSwitch('use-gl', 'swiftshader')
  app.commandLine.appendSwitch('use-angle', 'swiftshader')
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

let lastScrobbled = null
let scrobbleTimeout = null
let lastTracked = null

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

function applyViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!activeView || !activeView.webContents) return
  if (activeView.webContents.isDestroyed()) return

  activeView.setBounds(getContentBounds())
  activeView.setAutoResize({ width: true, height: true })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, 'logo.png'),
    width: 1200,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html'))
  } else {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('resize', applyViewBounds)

  mainWindow.on('closed', () => {
    Object.values(views).forEach((v) => {
      try {
        if (v?.webContents && !v.webContents.isDestroyed()) {
          v.webContents.destroy()
        }
      } catch (_) {}
    })
    mainWindow = null
  })
}

// Registrar una reproduccion unica por cambio de track.
function trackPlay(data, serviceId) {
  if (!data?.title) return
  const trackId = `${data.title}-${data.artist || ''}`
  if (trackId === lastTracked) return
  lastTracked = trackId

  const entry = {
    id: Date.now(),
    title: data.title,
    artist: data.artist || null,
    album: data.album || null,
    artwork: data.artwork || null,
    service: serviceId,
    playedAt: Date.now(),
  }

  const plays = history.get('plays', [])
  plays.unshift(entry)
  if (plays.length > 5000) plays.splice(5000)
  history.set('plays', plays)
}

function buildSummary(plays) {
  if (!plays.length) return null

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
    const key = `${p.title}-${p.artist || ''}`
    if (!trackCount[key]) trackCount[key] = { ...p, count: 0 }
    trackCount[key].count++
  })

  const topTracks = Object.values(trackCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const serviceCount = {}
  plays.forEach((p) => {
    serviceCount[p.service] = (serviceCount[p.service] || 0) + 1
  })
  const topService = Object.entries(serviceCount)
    .sort((a, b) => b[1] - a[1])[0]?.[0]

  const hourCount = Array(24).fill(0)
  plays.forEach((p) => {
    const hour = new Date(p.playedAt).getHours()
    hourCount[hour]++
  })
  const peakHour = hourCount.indexOf(Math.max(...hourCount))

  const days = new Set(plays.map((p) => new Date(p.playedAt).toDateString()))

  return {
    totalPlays: plays.length,
    topArtists,
    topTracks,
    topService,
    peakHour,
    uniqueDays: days.size,
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
  if (views[serviceId]) return views[serviceId]

  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: `persist:melo-${serviceId}`,
      contextIsolation: true,
      nodeIntegration: false,
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

  view.webContents.loadURL(url)

  views[serviceId] = view
  webContentsToService.set(view.webContents.id, serviceId)

  view.webContents.on('destroyed', () => {
    webContentsToService.delete(view.webContents.id)
    delete views[serviceId]
  })

  return view
}

async function switchToService(serviceId, url, serviceData) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (activeView && activeView === views[serviceId]) return

  if (activeView) {
    try {
      // Mutear inmediatamente para evitar overlap de audio.
      if (!activeView.webContents.isDestroyed()) {
        activeView.webContents.setAudioMuted(true)
      }

      // Pausar con timeout de seguridad.
      await Promise.race([
        activeView.webContents.executeJavaScript(`
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
        `).catch(() => false),
        new Promise((r) => setTimeout(r, 500))
      ])
    } catch (_) {}

    try { mainWindow.removeBrowserView(activeView) } catch (_) {}
  }

  const nextView = createServiceView(serviceId, url)

  if (!nextView.webContents.isDestroyed()) {
    nextView.webContents.setAudioMuted(false)
  }

  mainWindow.addBrowserView(nextView)
  activeView = nextView
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
    const result = await activeView.webContents.executeJavaScript(scripts[action])
    console.log(`Player action [${action}] -> ${result}`)
  } catch (err) {
    console.error(`Player action [${action}] failed:`, err.message)
  }
}

function registerIpcHandlers() {
  ipcMain.on('service:switch', async (_e, { serviceId, url, service }) => {
    await switchToService(serviceId, url, service)
  })

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

  ipcMain.on('mini:toggle', () => {
    toggleMiniPlayer()
  })

  ipcMain.handle('debug:buttons', async () => {
    if (!activeView?.webContents) return []
    if (activeView.webContents.isDestroyed()) return []
    try {
      return await activeView.webContents.executeJavaScript(`
        [...document.querySelectorAll('button')]
          .filter(b => b.getAttribute('aria-label'))
          .map(b => ({
            label: b.getAttribute('aria-label'),
            disabled: b.disabled,
            visible: b.offsetParent !== null
          }))
      `)
    } catch (_) {
      return []
    }
  })

  ipcMain.on('media:update', (event, data) => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    const serviceId = webContentsToService.get(event.sender.id)
    if (!serviceId || !data) return

    const isActiveService = (
      activeView
      && !activeView.webContents.isDestroyed()
      && activeView.webContents.id === event.sender.id
    )

    if (isActiveService) {
      mainWindow.webContents.send('media:update', {
        serviceId,
        ...data,
        isActive: true,
      })

      if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.webContents.send('media:update', { serviceId, ...data })
      }
    }

    if (!isActiveService) return

    trackPlay(data, serviceId)

    const service = Object.values(SERVICES).find((s) => s.id === serviceId)

    if (store.get('notificationsEnabled', true) && data.title) {
      notifyTrackChange({
        title: data.title,
        artist: data.artist,
        artwork: data.artwork,
      }).catch(() => {})
    }

    if (store.get('discordEnabled', false) && data.title) {
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
    autoUpdateEnabled: store.get('autoUpdateEnabled', true),
  }))

  ipcMain.handle('settings:save', (_e, { key, value }) => {
    if (!key) return false
    store.set(key, value)
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

  createMainWindow()
  registerIpcHandlers()
  registerGlobalShortcuts()
  if (store.get('autoUpdateEnabled', true)) {
    setupAutoUpdater(mainWindow)
  }
})

app.on('window-all-closed', () => {
  clearTimeout(scrobbleTimeout)
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close()
  discord.disconnectDiscord().catch(() => {})
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
