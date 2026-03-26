import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerStore } from './store/usePlayerStore'
import ServicePicker from './components/ServicePicker.jsx'
import LoginView from './components/LoginView.jsx'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import PlayerBar from './components/PlayerBar.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import StatsView from './components/StatsView.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'
import OfflineBanner from './components/OfflineBanner.jsx'
import FallbackControls from './components/FallbackControls.jsx'
import { extractPalette } from './utils/colorExtractor'
import { applyTheme, applyDynamicPalette } from './utils/applyTheme'

export default function App() {
  const lastMediaRef = useRef('')
  const lastPlaybackRef = useRef(null)
  const lastThemeArtworkRef = useRef('')
  const metadataDebounceRef = useRef(null)
  const [healthStatus, setHealthStatus] = useState({ status: 'unknown', reason: null })
  const [fallbackStatus, setFallbackStatus] = useState({ phase: 'idle', message: null, mitigated: false })
  const {
    currentView, setView,
    pendingService, setPendingService,
    setTrack, setPlaying,
    setActiveService, addConnectedService,
    settingsOpen, setSettingsOpen,
    addToHistory, statsEnabled,
    commandPaletteOpen,
    setCommandPaletteOpen,
    theme,
    setTheme,
    hydrateSettings,
    setAccentColor,
    immersiveEnabled,
  } = usePlayerStore()

  // Cargar preferencias persistidas desde el proceso principal.
  useEffect(() => {
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
      } catch (_) {}
    }

    init()
  }, [hydrateSettings, setAccentColor, setTheme])

  // Escuchar metadata enviada por el preload del BrowserView.
  useEffect(() => {
    // Mantener handlers estables para evitar acumulacion de listeners.
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

      // Leer estado actual desde store para evitar cierres obsoletos.
      const store = usePlayerStore.getState()
      if (store.statsEnabled && data.title) {
        store.addToHistory(data)
      }

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
          const palette = await extractPalette(data.artwork)
          if (palette) {
            applyDynamicPalette(palette)
            setAccentColor(palette.accent)
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

    window.melo.onMediaUpdate(handleMediaUpdate)
    window.melo.onServiceActive(handleServiceActive)
    window.melo.health?.onChange?.((status) => {
      if (status && typeof status === 'object') setHealthStatus(status)
    })

    window.melo.fallback?.onChange?.((status) => {
      if (status && typeof status === 'object') setFallbackStatus(status)
    })

    window.melo.health?.getStatus?.().then((status) => {
      if (status && typeof status === 'object') setHealthStatus(status)
    }).catch(() => {})

    window.melo.fallback?.getStatus?.().then((status) => {
      if (status && typeof status === 'object') setFallbackStatus(status)
    }).catch(() => {})

    // CRITICO: limpiar listeners al desmontar para evitar warnings de MaxListeners.
    return () => {
      clearTimeout(metadataDebounceRef.current)
      window.melo.removeAllListeners('media:update')
      window.melo.removeAllListeners('service:active')
      window.melo.removeAllListeners('health:status')
      window.melo.removeAllListeners('fallback:status')
    }
  }, [])

  useEffect(() => {
    const { customTheme } = usePlayerStore.getState()
    applyTheme(theme, customTheme)
  }, [theme])

  useEffect(() => {
    if (settingsOpen || currentView !== 'player') {
      window.melo.hideBrowserView()
    } else {
      window.melo.showBrowserView()
    }

    return () => {
      window.melo.showBrowserView()
    }
  }, [currentView, settingsOpen])

  useEffect(() => {
    const onKeyDown = (event) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (!isCmdK) return
      event.preventDefault()
      setCommandPaletteOpen(!commandPaletteOpen)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteOpen, setCommandPaletteOpen])

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

  return (
    <div className="app-root">
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

      {currentView === 'player' && (
        <div className="player-layout">
          <TopBar onSettingsOpen={() => setSettingsOpen(true)} />
          <div className="player-body">
            {!immersiveEnabled && <Sidebar />}
            <div className="browser-area">
              {settingsOpen && (
                <div className="browser-placeholder">
                  <p>Ajustes abiertos</p>
                </div>
              )}
            </div>
          </div>
          <PlayerBar />
          <FallbackControls health={healthStatus} fallbackStatus={fallbackStatus} />
          <OfflineBanner />
          <UpdateBanner />
          <SettingsPanel
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
          />
        </div>
      )}

      {currentView === 'stats' && (
        <div className="player-layout">
          <TopBar onSettingsOpen={() => setSettingsOpen(true)} />
          <div className="player-body">
            <Sidebar />
            <StatsView />
          </div>
          <PlayerBar />
          <FallbackControls health={healthStatus} fallbackStatus={fallbackStatus} />
          <OfflineBanner />
          <UpdateBanner />
          <SettingsPanel
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
          />
        </div>
      )}
    </div>
  )
}
