import React, { useEffect, useRef, useState } from 'react'
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
import { extractPalette } from './utils/colorExtractor'
import { applyTheme, applyDynamicPalette } from './utils/applyTheme'

export default function App() {
  const [sleepMenuOpen, setSleepMenuOpen] = useState(false)
  const lastMediaRef = useRef('')
  const lastPlaybackRef = useRef(null)
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
    window.melo.onMediaUpdate(async (data) => {
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

      if (statsEnabled && data.title) {
        addToHistory(data)
      }

      const { dynamicThemeEnabled } = usePlayerStore.getState()
      if (dynamicThemeEnabled && data.artwork) {
        try {
          const palette = await extractPalette(data.artwork)
          if (palette) {
            applyDynamicPalette(palette)
            setAccentColor(palette.accent)
          }
        } catch (_) {}
      }

    })

    window.melo.onServiceActive((data) => {
      setActiveService(data.serviceId, data.color, data.name)
      addConnectedService(data.serviceId)
    })

    return () => {
      window.melo.removeAllListeners('media:update')
      window.melo.removeAllListeners('service:active')
    }
  }, [
    addConnectedService,
    addToHistory,
    setActiveService,
    setAccentColor,
    setPlaying,
    setTrack,
    statsEnabled,
  ])

  useEffect(() => {
    const { customTheme } = usePlayerStore.getState()
    applyTheme(theme, customTheme)
  }, [theme])

  // BrowserView siempre queda por encima del DOM: ocultarlo al abrir ajustes.
  useEffect(() => {
    const onSleepMenu = (event) => {
      setSleepMenuOpen(Boolean(event?.detail?.open))
    }
    window.addEventListener('melo:sleep-menu', onSleepMenu)
    return () => window.removeEventListener('melo:sleep-menu', onSleepMenu)
  }, [])

  useEffect(() => {
    if (settingsOpen || currentView !== 'player') {
      window.melo.hideBrowserView()
    } else if (sleepMenuOpen) {
      window.melo.hideBrowserView()
    } else {
      window.melo.showBrowserView()
    }

    return () => {
      window.melo.showBrowserView()
    }
  }, [currentView, settingsOpen, sleepMenuOpen])

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

  const handleSelectService = (service) => {
    setPendingService(service)
    setView('login')
  }

  const handleConfirmLogin = () => {
    if (!pendingService) return
    window.melo.switchService(
      pendingService.id,
      pendingService.url,
      pendingService
    )
    setView('player')
    setPendingService(null)
  }

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
            <Sidebar />
            <div className="browser-area">
              {settingsOpen && (
                <div className="browser-placeholder">
                  <p>Ajustes abiertos</p>
                </div>
              )}
            </div>
          </div>
          <PlayerBar />
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
