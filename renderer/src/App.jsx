import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePlayerStore } from './store/usePlayerStore'
import { useToast } from './hooks/useToast'
import ServicePicker from './components/ServicePicker.jsx'
import LoginView from './components/LoginView.jsx'
import AppShell from './components/AppShell.jsx'
import BrowserPlaceholder from './components/BrowserPlaceholder.jsx'
import StatsView from './components/StatsView.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'
import OfflineBanner from './components/OfflineBanner.jsx'
import FallbackControls from './components/FallbackControls.jsx'
import ToastManager from './components/ToastManager.jsx'
import SleepTimerPill from './components/SleepTimerPill.jsx'
import ArtworkGradient from './components/ArtworkGradient.jsx'
import { getUISafeMode } from './hooks/useUISafeMode'
import { logger } from './utils/logger'
import { SERVICES } from '../../services/registry'
import { getArtworkPalette } from './utils/artworkPalette'
import { applyTheme, applyDynamicPalette } from './utils/applyTheme'
import './styles/artwork-gradient.css'

export default function App() {
  const didInitLastServiceRef = useRef(false)
  const lastMediaRef = useRef('')
  const lastPlaybackRef = useRef(null)
  const lastThemeArtworkRef = useRef('')
  const metadataDebounceRef = useRef(null)
  const [healthStatus, setHealthStatus] = useState({ status: 'unknown', reason: null })
  const [fallbackStatus, setFallbackStatus] = useState({ phase: 'idle', message: null, mitigated: false })
  const [gpuStatus, setGpuStatus] = useState(null)
  const [immersive, setImmersive] = useState(false)
  const [isServiceLoading, setIsServiceLoading] = useState(false)
  const shortcutStateRef = useRef({
    commandPaletteOpen: false,
    immersive: false,
  })
  // useShallow en vez de usePlayerStore(): sin selector, App se re-renderizaba
  // con CUALQUIER cambio del store — incluido cada update de metadata y cada
  // movimiento del volumen. Aqui solo entran los campos que el shell necesita.
  const {
    currentView, setView,
    pendingService, setPendingService,
    setTrack, setPlaying,
    setActiveService, addConnectedService,
    settingsOpen, setSettingsOpen,
    commandPaletteOpen, setCommandPaletteOpen,
    theme, setTheme,
    hydrateSettings, setAccentColor,
    activeServiceColor,
    focusMode, setFocusMode,
  } = usePlayerStore(
    useShallow((s) => ({
      currentView: s.currentView,
      setView: s.setView,
      pendingService: s.pendingService,
      setPendingService: s.setPendingService,
      setTrack: s.setTrack,
      setPlaying: s.setPlaying,
      setActiveService: s.setActiveService,
      addConnectedService: s.addConnectedService,
      settingsOpen: s.settingsOpen,
      setSettingsOpen: s.setSettingsOpen,
      commandPaletteOpen: s.commandPaletteOpen,
      setCommandPaletteOpen: s.setCommandPaletteOpen,
      theme: s.theme,
      setTheme: s.setTheme,
      hydrateSettings: s.hydrateSettings,
      setAccentColor: s.setAccentColor,
      activeServiceColor: s.activeServiceColor,
      focusMode: s.focusMode,
      setFocusMode: s.setFocusMode,
    }))
  )
  const { info: showInfo, error: showError } = useToast()
  const uiSafe = useMemo(() => getUISafeMode(gpuStatus), [gpuStatus])

  const servicesList = useMemo(() => Object.values(SERVICES), [])

  const isTypingContext = (target) => {
    const active = target || document.activeElement
    if (!active) return false
    const tagName = active.tagName
    return ['INPUT', 'TEXTAREA'].includes(tagName) || active.isContentEditable
  }

  const handleSwitchService = useCallback((service) => {
    if (!service) return

    const { activeServiceId, currentView: view } = usePlayerStore.getState()
    if (service.id === activeServiceId) {
      if (view === 'stats') setView('player')
      return
    }

    try {
      window.melo.switchService(service.id, service.url, service)
      showInfo(`Cambiando a ${service.name}…`)
    } catch (err) {
      logger.error('Service switch failed', err)
      showError(`No se pudo abrir ${service.name}. Revisa tu conexión.`)
      return
    }

    setActiveService(service.id, service.color, service.name)
    setView('player')
  }, [setActiveService, setView, showError, showInfo])

  const commandActions = useMemo(() => ([
    { id: 'apple',   label: 'Apple Music',  group: 'services', hint: '⌘1', action: () => handleSwitchService(SERVICES.appleMusic) },
    { id: 'spotify', label: 'Spotify',      group: 'services', hint: '⌘2', action: () => handleSwitchService(SERVICES.spotify) },
    { id: 'youtube', label: 'YouTube Music', group: 'services', hint: '⌘3', action: () => handleSwitchService(SERVICES.youtubeMusic) },
    { id: 'tidal',   label: 'Tidal',        group: 'services', hint: '⌘4', action: () => handleSwitchService(SERVICES.tidal) },
    { id: 'deezer',  label: 'Deezer',       group: 'services', hint: '⌘5', action: () => handleSwitchService(SERVICES.deezer) },
    { id: 'play-pause', label: 'Play / Pause', group: 'playback', hint: 'K', action: () => window.melo.playerAction('play') },
    { id: 'next-track', label: 'Siguiente canción', group: 'playback', action: () => window.melo.playerAction('next') },
    { id: 'settings', label: 'Ajustes', group: 'navigation', action: () => setSettingsOpen(true) },
    { id: 'theme',    label: 'Cambiar tema', group: 'navigation', action: () => setSettingsOpen(true) },
    {
      id: 'immersive-toggle',
      label: immersive ? 'Exit Immersive Mode' : 'Enter Immersive Mode',
      group: 'ui',
      action: () => setImmersive((prev) => !prev),
    },
    {
      id: 'focus-toggle',
      label: focusMode ? 'Salir de Focus Mode' : 'Activar Focus Mode',
      group: 'ui',
      action: () => setFocusMode(!focusMode),
    },
    { id: 'stats',    label: 'Ver Estadísticas',   group: 'navigation', action: () => setView('stats') },
    {
      id: 'resources',
      label: 'Ver uso de recursos',
      group: 'navigation',
      action: () => usePlayerStore.getState().openSettingsAt('rendimiento'),
    },
    {
      id: 'copy-track',
      label: 'Copiar canción actual',
      group: 'playback',
      action: async () => {
        const { currentTrack } = usePlayerStore.getState()
        if (!currentTrack?.title) {
          showError('No hay ninguna canción sonando')
          return
        }
        const text = [currentTrack.title, currentTrack.artist].filter(Boolean).join(' — ')
        try {
          await navigator.clipboard.writeText(text)
          showInfo(`Copiado: ${text}`)
        } catch (_) {
          showError('No se pudo copiar al portapapeles')
        }
      },
    },
    ...[15, 30, 60].map((minutes) => ({
      id: `sleep-${minutes}`,
      label: `Dormir en ${minutes} min`,
      group: 'timer',
      action: () => {
        window.melo.sleepTimer.start(minutes)
        showInfo(`La música se pausará en ${minutes} min`)
      },
    })),
    {
      id: 'sleep-cancel',
      label: 'Cancelar temporizador',
      group: 'timer',
      action: () => {
        window.melo.sleepTimer.cancel()
        showInfo('Temporizador cancelado')
      },
    },
  ]), [handleSwitchService, immersive, focusMode, setFocusMode, setSettingsOpen, setView, showError, showInfo])

  // Cargar preferencias persistidas desde el proceso principal.
  useEffect(() => {
    // En React.StrictMode (dev) este efecto puede ejecutarse 2 veces.
    // Evita doble switch inicial del servicio y duplicados en la cola de main.
    if (didInitLastServiceRef.current) return
    didInitLastServiceRef.current = true

    const init = async () => {
      try {
        const settings = await window.melo.getSettings()
        hydrateSettings(settings || {})
        if (settings?.theme) {
          setTheme(settings.theme)
          applyTheme(settings.theme, settings.customTheme)
        }
        if (settings?.accentColor) setAccentColor(settings.accentColor)

        const last = await window.melo.getLastService()
        if (last?.serviceId) {
          window.melo.switchService(last.serviceId, last.url, last.service)
          setActiveService(
            last.serviceId,
            last.service?.color || '#fc3c44',
            last.service?.name || last.serviceId
          )
          setView('player')
        }
      } catch (err) {
        logger.warn('Init failed, using defaults', err)
        showError('No se pudieron cargar tus preferencias. Usando valores por defecto.')
      }
    }

    init()
  }, [hydrateSettings, setAccentColor, setTheme, showError])

  // Escuchar metadata enviada por el preload del BrowserView.
  useEffect(() => {
    // Mantener handlers estables para evitar acumulacion de listeners.
    const unsubscribers = []

    const handleMediaUpdate = async (data) => {
      if (!data?.title) return

      const mediaSignature = [
        data.title || '',
        data.artist || '',
        data.album || '',
        data.artwork || '',
      ].join('|')

      if (lastMediaRef.current !== mediaSignature) {
        lastMediaRef.current = mediaSignature
        setTrack({
          title: data.title,
          artist: data.artist ?? null,
          album: data.album ?? null,
          artwork: data.artwork ?? null,
        })
      }

      // Priorizar `isPlaying` calculado en main para Apple Music.
      const nextPlaying = (data.isPlaying ?? data.state === 'playing')
      if (lastPlaybackRef.current !== nextPlaying) {
        lastPlaybackRef.current = nextPlaying
        setPlaying(nextPlaying)
      }

      // El historial lo registra main en `trackPlay()`, con listenedMs real y
      // persistencia. El renderer ya no lleva una copia propia en memoria.

      // Debounce de metadata visual para bajar costo de extraccion de color.
      clearTimeout(metadataDebounceRef.current)
      metadataDebounceRef.current = setTimeout(async () => {
        // [theme] Re-leer store dentro del debounce para obtener dynamicThemeEnabled actual
        // (evita captura de snapshot estale cuando el setting cambia)
        const currentStore = usePlayerStore.getState()
        if (!currentStore.dynamicThemeEnabled) return

        // Si no hay artwork, reaplique el tema base para limpiar colores de track anterior
        if (!data.artwork) {
          lastThemeArtworkRef.current = ''
          const { theme, customTheme } = currentStore
          applyTheme(theme, customTheme)
          return
        }

        if (lastThemeArtworkRef.current === data.artwork) return
        lastThemeArtworkRef.current = data.artwork

        try {
          // Mismo modulo (y misma cache) que usa ArtworkGradient: una sola
          // decodificacion de la imagen para los dos consumidores.
          const result = await getArtworkPalette(data.artwork)
          if (result?.theme) {
            applyDynamicPalette(result.theme)
            setAccentColor(result.theme.accent)
          }
        } catch (_) {
          // En caso de error, reaplique el tema base para evitar colores corruptos
          const { theme, customTheme } = currentStore
          applyTheme(theme, customTheme)
        }
      }, 150)
    }

    const handleServiceActive = (data) => {
      setActiveService(data.serviceId, data.color, data.name)
      addConnectedService(data.serviceId)
    }

    unsubscribers.push(window.melo.onMediaUpdate(handleMediaUpdate))
    unsubscribers.push(window.melo.onServiceActive(handleServiceActive))
    unsubscribers.push(window.melo.onShortcut?.((payload) => {
      const shortcut = payload?.shortcut
      if (shortcut === 'cmdk') {
        setCommandPaletteOpen(!usePlayerStore.getState().commandPaletteOpen)
        return
      }

      if (shortcut === 'escape') {
        if (usePlayerStore.getState().commandPaletteOpen) {
          setCommandPaletteOpen(false)
          return
        }
        if (shortcutStateRef.current.immersive) {
          setImmersive(false)
        }
        return
      }

      // 'space' ya no se reenvía desde BrowserViews (los servicios lo usan
      // nativamente). Play/pause ahora es 'k' desde el keydown del renderer.
    }))
    unsubscribers.push(window.melo.health?.onChange?.((status) => {
      if (status && typeof status === 'object') setHealthStatus(status)
    }))

    unsubscribers.push(window.melo.fallback?.onChange?.((status) => {
      if (status && typeof status === 'object') setFallbackStatus(status)
    }))

    unsubscribers.push(window.melo.gpuInfo?.onChange?.((status) => {
      if (status && typeof status === 'object') setGpuStatus(status)
    }))

    unsubscribers.push(window.melo.service?.onLoading?.((data) => {
      if (data && typeof data.isLoading === 'boolean') setIsServiceLoading(data.isLoading)
    }))

    window.melo.health?.getStatus?.().then((status) => {
      if (status && typeof status === 'object') setHealthStatus(status)
    }).catch(() => {})

    window.melo.fallback?.getStatus?.().then((status) => {
      if (status && typeof status === 'object') setFallbackStatus(status)
    }).catch(() => {})

    window.melo.gpuInfo?.getStatus?.().then((status) => {
      if (status && typeof status === 'object') setGpuStatus(status)
    }).catch(() => {})

    // CRITICO: limpiar listeners al desmontar para evitar warnings de MaxListeners.
    return () => {
      clearTimeout(metadataDebounceRef.current)
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe()
      })
    }
  }, [setCommandPaletteOpen])

  useEffect(() => {
    const { customTheme } = usePlayerStore.getState()
    applyTheme(theme, customTheme)
  }, [theme])

  useEffect(() => {
    // BrowserView tapa overlays del renderer; ocultarlo cuando haya overlays globales.
    if (settingsOpen || commandPaletteOpen || currentView !== 'player') {
      window.melo.hideBrowserView()
    } else {
      window.melo.showBrowserView()
    }

    return () => {
      window.melo.showBrowserView()
    }
  }, [commandPaletteOpen, currentView, settingsOpen])

  useEffect(() => {
    shortcutStateRef.current = {
      commandPaletteOpen,
      immersive,
    }
  }, [commandPaletteOpen, immersive])

  useEffect(() => {
    if (currentView !== 'player' && immersive) {
      setImmersive(false)
    }
  }, [currentView, immersive])

  useEffect(() => {
    // Sincroniza bounds del BrowserView en main con el modo inmersivo UI.
    window.melo.saveSettings('immersiveEnabled', immersive).catch(() => {})
  }, [immersive])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return
      if (isTypingContext(event.target)) return
      if (shortcutStateRef.current.commandPaletteOpen) return

      // K = play/pause (estilo YouTube/VLC). Space ya no se usa aquí porque
      // los BrowserViews lo necesitan para scroll/typing dentro de los servicios.
      if (event.key.toLowerCase() === 'k') {
        const { settingsOpen: so, currentView: cv } = usePlayerStore.getState()
        if (so || cv !== 'player') return
        event.preventDefault()
        window.melo.playerAction('play')
        return
      }

      const isServiceShortcut = (event.metaKey || event.ctrlKey) && ['1', '2', '3', '4', '5'].includes(event.key)
      if (!isServiceShortcut) return

      const serviceIndex = Number(event.key) - 1
      const service = servicesList[serviceIndex]
      if (!service) return

      event.preventDefault()
      handleSwitchService(service)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSwitchService, servicesList])

  const handleSelectService = useCallback((service) => {
    setPendingService(service)
    setView('login')
  }, [setPendingService, setView])

  const handleConfirmLogin = useCallback(() => {
    if (!pendingService) return
    window.melo.switchService(
      pendingService.id,
      pendingService.url,
      pendingService
    )
    setView('player')
    setPendingService(null)
  }, [pendingService, setPendingService, setView])

  const statusSlot = useMemo(() => (
    <>
      <FallbackControls health={healthStatus} fallbackStatus={fallbackStatus} />
      <OfflineBanner />
      <UpdateBanner />
    </>
  ), [fallbackStatus, healthStatus])

  return (
    <div className={`app-root ${uiSafe.isSafeMode ? 'safe-mode' : ''} ${focusMode ? 'focus-mode' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
      <div
        className={`service-loading-bar ${isServiceLoading ? 'active' : ''}`}
        style={{ '--loading-bar-color': activeServiceColor || 'var(--accent)' }}
        aria-hidden="true"
      />
      <ArtworkGradient opacity={0.85} />
      <ToastManager />
      <SleepTimerPill />

      {currentView === 'picker' && (
        <ServicePicker onSelect={handleSelectService} />
      )}

      {currentView === 'login' && pendingService && (
        <LoginView
          service={pendingService}
          onContinue={handleConfirmLogin}
          onBack={() => setView('picker')}
        />
      )}

      {(currentView === 'player' || currentView === 'stats') && (
        <AppShell
          immersive={currentView === 'player' && immersive}
          onSettingsOpen={() => setSettingsOpen(true)}
          onExitImmersive={() => setImmersive(false)}
          statusSlot={statusSlot}
          settingsOpen={settingsOpen}
          onSettingsClose={() => setSettingsOpen(false)}
          commandPaletteOpen={commandPaletteOpen}
          onCommandPaletteClose={() => setCommandPaletteOpen(false)}
          commandActions={commandActions}
        >
          {currentView === 'stats' ? (
            <StatsView />
          ) : (
            <div className="browser-area">
              {/* El BrowserView se esconde con cualquier overlay: rellenar el
                  hueco con lo que suena en vez de dejarlo en negro. */}
              {settingsOpen && <BrowserPlaceholder />}
            </div>
          )}
        </AppShell>
      )}
    </div>
  )
}
