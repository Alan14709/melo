import React, { useEffect } from 'react'
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

export default function App() {
  const {
    currentView, setView,
    pendingService, setPendingService,
    setTrack, setPlaying,
    setActiveService, addConnectedService,
    settingsOpen, setSettingsOpen,
    addToHistory, statsEnabled,
    accentColor,
    commandPaletteOpen,
    setCommandPaletteOpen,
    theme,
    setTheme,
    hydrateSettings,
    setAccentColor,
  } = usePlayerStore()

  // Cargar preferencias persistidas desde el proceso principal.
  useEffect(() => {
    window.melo.getSettings().then((settings) => {
      hydrateSettings(settings || {})
      if (settings?.theme) setTheme(settings.theme)
      if (settings?.accentColor) setAccentColor(settings.accentColor)
    }).catch(() => {})
  }, [hydrateSettings, setAccentColor, setTheme])

  // Escuchar metadata enviada por el preload del BrowserView.
  useEffect(() => {
    window.melo.onMediaUpdate((data) => {
      if (!data?.title) return
      setTrack({
        title: data.title,
        artist: data.artist,
        album: data.album,
        artwork: data.artwork,
        serviceId: data.serviceId,
      })
      setPlaying(data.state === 'playing')

      if (statsEnabled && data.title) {
        addToHistory(data)
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
    setPlaying,
    setTrack,
    statsEnabled,
  ])

  useEffect(() => {
    if (theme === 'custom') {
      document.documentElement.style.setProperty('--accent', accentColor)
    }
  }, [theme, accentColor])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // BrowserView siempre queda por encima del DOM: ocultarlo al abrir ajustes.
  useEffect(() => {
    if (settingsOpen || currentView === 'stats') {
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
