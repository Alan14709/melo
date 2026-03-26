let dbus = null
let Variant = null
let Interface = null
let ArtworkCache = null
const path = require('path')

try {
  ArtworkCache = require('../services/ArtworkCache')
} catch (_) {
  // ArtworkCache puede no estar disponible en ciertos contextos
}

const MPRIS_BUS_NAME = 'org.mpris.MediaPlayer2.melo'
const MPRIS_OBJECT_PATH = '/org/mpris/MediaPlayer2'

const runtime = {
  bus: null,
  rootInterface: null,
  playerInterface: null,
  unsubscribe: null,
  lastEmissionSignature: null,
  context: {
    state: null,
    onPlayerAction: null,
    logger: null,
  },
}

function normalizeArtUrl(value) {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  if (!raw) return ''
  if (raw.startsWith('file://')) return raw
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (path.isAbsolute(raw)) return `file://${raw}`
  return ''
}

function logInfo(event, payload = {}) {
  const logger = runtime.context.logger
  if (!logger?.info) return
  logger.info('MPRIS', `[mpris] ${event}`, payload)
}

function logWarn(event, payload = {}) {
  const logger = runtime.context.logger
  if (!logger?.warn) return
  logger.warn('MPRIS', `[mpris] ${event}`, payload)
}

function logError(event, payload = {}) {
  const logger = runtime.context.logger
  if (!logger?.error) return
  logger.error('MPRIS', `[mpris] ${event}`, payload)
}

function ensureDbusLibrary() {
  if (dbus && Variant && Interface) return true

  try {
    dbus = require('dbus-next')
    Variant = dbus.Variant
    Interface = dbus.interface.Interface
    return true
  } catch (error) {
    logWarn('dbus_next_unavailable', { message: error?.message || 'unknown_error' })
    return false
  }
}

function normalizeState(raw = {}) {
  const artistRaw = raw?.artist
  const artists = Array.isArray(artistRaw)
    ? artistRaw.filter((item) => typeof item === 'string' && item.trim())
    : (typeof artistRaw === 'string' && artistRaw.trim() ? [artistRaw] : [])

  const hasTitle = typeof raw?.title === 'string' && raw.title.trim().length > 0
  const artwork = hasTitle ? normalizeArtUrl(raw?.artwork) : ''
  
  // Pre-cache artwork en background para MPRIS metadata
  if (artwork && typeof ArtworkCache?.get === 'function') {
    ArtworkCache.get(artwork).catch(() => {})
  }

  return {
    title: hasTitle ? raw.title : '',
    artist: hasTitle ? artists : [],
    album: hasTitle && typeof raw?.album === 'string' ? raw.album : '',
    artUrl: artwork,
    isPlaying: raw?.isPlaying === true,
    status: typeof raw?.status === 'string' ? raw.status : 'idle',
    duration: Number(raw?.duration) || 0,
  }
}

function getPlaybackStatus(state) {
  if (!state?.title || state?.status === 'idle') return 'Stopped'
  if (state?.isPlaying) return 'Playing'
  if (state?.title || state?.artist?.length) return 'Paused'
  return 'Stopped'
}

function buildMetadata(state) {
  const metadata = {}

  if (state?.title) {
    metadata['xesam:title'] = new Variant('s', state.title)
  }

  if (Array.isArray(state?.artist) && state.artist.length > 0) {
    metadata['xesam:artist'] = new Variant('as', state.artist)
  }

  if (state?.album) {
    metadata['xesam:album'] = new Variant('s', state.album)
  }

  if (state?.artUrl) {
    metadata['mpris:artUrl'] = new Variant('s', state.artUrl)
  }

  // TODO: Incluir mpris:length cuando la duracion sea confiable en todos los servicios.
  return metadata
}

function emitPlayerPropertiesChanged() {
  const playerInterface = runtime.playerInterface
  if (!playerInterface) return

  try {
    const playbackStatus = getPlaybackStatus(runtime.context.state)
    const metadata = buildMetadata(runtime.context.state)
    const signature = JSON.stringify({
      playbackStatus,
      metadataKeys: Object.keys(metadata).sort(),
      title: runtime.context.state?.title || '',
      artist: runtime.context.state?.artist || [],
      album: runtime.context.state?.album || '',
      artUrl: runtime.context.state?.artUrl || '',
    })

    if (runtime.lastEmissionSignature === signature) return
    runtime.lastEmissionSignature = signature

    playerInterface.emitPropertiesChanged({
      PlaybackStatus: new Variant('s', playbackStatus),
      Metadata: new Variant('a{sv}', metadata),
    }, [])
  } catch (error) {
    logWarn('properties_changed_failed', { message: error?.message || 'unknown_error' })
  }
}

function createRootInterface() {
  class MprisRootInterface extends Interface {
    constructor() {
      super('org.mpris.MediaPlayer2')
    }

    Raise() {
      runtime.context.onPlayerAction?.('raise')
    }

    Quit() {
      runtime.context.onPlayerAction?.('quit')
    }

    get CanQuit() { return true }
    get CanRaise() { return true }
    get HasTrackList() { return false }
    get Identity() { return 'Melo' }
    get DesktopEntry() { return 'melo' }
    get SupportedUriSchemes() { return [] }
    get SupportedMimeTypes() { return [] }
  }

  MprisRootInterface.configureMembers({
    methods: {
      Raise: {},
      Quit: {},
    },
    properties: {
      CanQuit: { signature: 'b', access: 'read' },
      CanRaise: { signature: 'b', access: 'read' },
      HasTrackList: { signature: 'b', access: 'read' },
      Identity: { signature: 's', access: 'read' },
      DesktopEntry: { signature: 's', access: 'read' },
      SupportedUriSchemes: { signature: 'as', access: 'read' },
      SupportedMimeTypes: { signature: 'as', access: 'read' },
    },
  })

  return new MprisRootInterface()
}

function createPlayerInterface() {
  class MprisPlayerInterface extends Interface {
    constructor() {
      super('org.mpris.MediaPlayer2.Player')
    }

    Next() { runtime.context.onPlayerAction?.('next') }
    Previous() { runtime.context.onPlayerAction?.('previous') }
    Pause() { runtime.context.onPlayerAction?.('pause') }
    PlayPause() { runtime.context.onPlayerAction?.('playpause') }
    Play() { runtime.context.onPlayerAction?.('play') }

    get PlaybackStatus() { return getPlaybackStatus(runtime.context.state) }
    get Metadata() { return buildMetadata(runtime.context.state) }
    get CanGoNext() { return true }
    get CanGoPrevious() { return true }
    get CanPlay() { return true }
    get CanPause() { return true }
  }

  MprisPlayerInterface.configureMembers({
    methods: {
      Next: {},
      Previous: {},
      Pause: {},
      PlayPause: {},
      Play: {},
    },
    properties: {
      PlaybackStatus: { signature: 's', access: 'read' },
      Metadata: { signature: 'a{sv}', access: 'read' },
      CanGoNext: { signature: 'b', access: 'read' },
      CanGoPrevious: { signature: 'b', access: 'read' },
      CanPlay: { signature: 'b', access: 'read' },
      CanPause: { signature: 'b', access: 'read' },
    },
  })

  return new MprisPlayerInterface()
}

async function startMpris({ getState, onStateChange, onPlayerAction, logger }) {
  runtime.context.logger = logger || null

  if (runtime.bus) return true
  if (process.platform !== 'linux') return false
  if (!ensureDbusLibrary()) return false

  try {
    runtime.context.onPlayerAction = typeof onPlayerAction === 'function' ? onPlayerAction : null
    runtime.context.state = normalizeState(typeof getState === 'function' ? getState() : {})

    const bus = dbus.sessionBus()
    runtime.bus = bus

    bus.on('error', (error) => {
      logWarn('session_bus_error', { message: error?.message || 'unknown_error' })
    })

    await bus.requestName(MPRIS_BUS_NAME)

    runtime.rootInterface = createRootInterface()
    runtime.playerInterface = createPlayerInterface()

    bus.export(MPRIS_OBJECT_PATH, runtime.rootInterface)
    bus.export(MPRIS_OBJECT_PATH, runtime.playerInterface)

    if (typeof onStateChange === 'function') {
      const unsubscribe = onStateChange((nextState) => {
        runtime.context.state = normalizeState(nextState)
        emitPlayerPropertiesChanged()
      })
      runtime.unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null
    }

    emitPlayerPropertiesChanged()
    logInfo('started', { busName: MPRIS_BUS_NAME })
    return true
  } catch (error) {
    logError('start_failed', { message: error?.message || 'unknown_error' })
    stopMpris()
    return false
  }
}

function stopMpris() {
  try {
    if (runtime.unsubscribe) {
      runtime.unsubscribe()
      runtime.unsubscribe = null
    }
  } catch (_) {}

  try {
    if (runtime.bus) {
      runtime.bus.disconnect()
    }
  } catch (error) {
    logWarn('stop_disconnect_failed', { message: error?.message || 'unknown_error' })
  }

  runtime.bus = null
  runtime.rootInterface = null
  runtime.playerInterface = null
  runtime.lastEmissionSignature = null
  runtime.context.state = null
  runtime.context.onPlayerAction = null
}

module.exports = {
  startMpris,
  stopMpris,
}
