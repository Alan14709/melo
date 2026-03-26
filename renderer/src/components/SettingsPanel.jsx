import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { SERVICES } from '../../../services/registry'
import { version } from '../../../package.json'
import { usePlayerStore } from '../store/usePlayerStore'
import SettingsRow from './SettingsRow.jsx'
import ThemeEditor from './ThemeEditor.jsx'
import { applyTheme } from '../utils/applyTheme'

const THEMES = ['dark', 'oled', 'light', 'nord', 'catppuccin', 'custom']

export default function SettingsPanel({ isOpen, onClose }) {
  const {
    notificationsEnabled,
    setNotifications,
    discordEnabled,
    setDiscord,
    discordClientId,
    setDiscordClientId,
    lastfmEnabled,
    setLastfm,
    lastfmApiKey,
    setLastfmApiKey,
    lastfmApiSecret,
    setLastfmApiSecret,
    setLastfmSessionKey,
    mediaKeysEnabled,
    setMediaKeys,
    immersiveEnabled,
    setImmersive,
    overlayControlsEnabled,
    setOverlayControls,
    overlayPosition,
    setOverlayPosition,
    activeServiceId,
    setActiveService,
    setView,
    theme,
    setTheme,
    dynamicThemeEnabled,
    setDynamicTheme,
    customTheme,
    statsEnabled,
    setStats,
    autoUpdateEnabled,
    setAutoUpdate,
    connectedServices,
    playHistory,
    clearPlayHistory,
  } = usePlayerStore()

  const [discordConnected, setDiscordConnected] = useState(false)
  const [lfmStep, setLfmStep] = useState(1)
  const [lfmToken, setLfmToken] = useState(null)
  const [trayEnabled, setTrayEnabled] = useState(true)
  const [closeBehavior, setCloseBehavior] = useState('tray')
  const [autostartEnabled, setAutostartEnabled] = useState(false)
  const [startMinimized, setStartMinimized] = useState(true)

  useEffect(() => {
    if (!isOpen) return

    window.melo.getSettings().then((settings) => {
      const safe = settings || {}
      const nextTrayEnabled = safe.trayEnabled ?? true
      const nextCloseBehaviorRaw = safe.closeBehavior ?? 'tray'
      const nextCloseBehavior = nextCloseBehaviorRaw === 'quit' ? 'quit' : 'tray'

      setTrayEnabled(Boolean(nextTrayEnabled))
      setCloseBehavior(nextTrayEnabled ? nextCloseBehavior : 'quit')
      setAutostartEnabled(Boolean(safe.autostartEnabled ?? false))
      setStartMinimized(Boolean(safe.startMinimized ?? true))
    }).catch(() => {
      // Defaults seguros para no romper UI si falla IPC.
      setTrayEnabled(true)
      setCloseBehavior('tray')
      setAutostartEnabled(false)
      setStartMinimized(true)
    })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    window.melo.discordStatus().then((status) => {
      setDiscordConnected(Boolean(status))
    }).catch(() => {
      setDiscordConnected(false)
    })
  }, [isOpen])

  const handleExport = () => {
    const payload = JSON.stringify(playHistory, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'melo-history.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearStats = async () => {
    const confirmed = window.confirm('Esto eliminara todas tus estadisticas guardadas. Esta seguro?')
    if (!confirmed) return

    try {
      await window.melo.stats.clear()
      clearPlayHistory()
    } catch (_) {}
  }

  const persist = (key, value) => {
    window.melo.saveSettings(key, value).catch(() => {})
  }

  const handleNotificationsToggle = (enabled) => {
    setNotifications(enabled)
    persist('notificationsEnabled', enabled)
  }

  const handleMediaKeysToggle = (enabled) => {
    setMediaKeys(enabled)
    persist('mediaKeysEnabled', enabled)
  }

  const handleThemeChange = async (nextTheme) => {
    setTheme(nextTheme)
    applyTheme(nextTheme, nextTheme === 'custom' ? customTheme : null)
    await window.melo.saveSettings('theme', nextTheme)
  }

  const handleAutoUpdateToggle = (enabled) => {
    setAutoUpdate(enabled)
    persist('autoUpdateEnabled', enabled)
  }

  const handleStatsToggle = (enabled) => {
    setStats(enabled)
    persist('statsEnabled', enabled)
  }

  const handleTrayToggle = (enabled) => {
    setTrayEnabled(enabled)
    persist('trayEnabled', enabled)

    // Evitar estados invalidos: sin tray, closeBehavior debe ser quit.
    if (!enabled) {
      setCloseBehavior('quit')
      persist('closeBehavior', 'quit')
    }
  }

  const handleCloseBehaviorChange = (nextValue) => {
    const value = nextValue === 'quit' ? 'quit' : 'tray'
    if (!trayEnabled && value !== 'quit') return
    setCloseBehavior(value)
    persist('closeBehavior', value)
  }

  const handleAutostartToggle = (enabled) => {
    setAutostartEnabled(enabled)
    persist('autostartEnabled', enabled)
  }

  const handleStartMinimizedToggle = (enabled) => {
    setStartMinimized(enabled)
    persist('startMinimized', enabled)
  }

  const handleImmersiveToggle = (enabled) => {
    setImmersive(enabled)
    persist('immersiveEnabled', enabled)
  }

  const handleOverlayControlsToggle = (enabled) => {
    setOverlayControls(enabled)
    persist('overlayControlsEnabled', enabled)
  }

  const handleOverlayPositionChange = (position) => {
    setOverlayPosition(position)
    persist('overlayPosition', position)
  }

  const handleDiscordToggle = async (enabled) => {
    setDiscord(enabled)
    persist('discordEnabled', enabled)
    const ok = await window.melo.discordToggle(enabled, discordClientId)
    setDiscordConnected(Boolean(ok))
  }

  const handleDiscordConnect = async () => {
    persist('discordClientId', discordClientId)
    const ok = await window.melo.discordToggle(true, discordClientId)
    setDiscord(true)
    persist('discordEnabled', true)
    setDiscordConnected(Boolean(ok))
  }

  const handleLfmToggle = (enabled) => {
    setLastfm(enabled)
    persist('lastfmEnabled', enabled)
    if (!enabled) {
      setLfmStep(1)
      setLfmToken(null)
    }
  }

  const handleLfmAuth = async () => {
    await window.melo.lastfmConfigure({
      apiKey: lastfmApiKey,
      apiSecret: lastfmApiSecret,
      sessionKey: '',
      enabled: true,
    })
    persist('lastfm', { apiKey: lastfmApiKey, apiSecret: lastfmApiSecret, sessionKey: '' })

    const token = await window.melo.lastfmAuth()
    setLfmToken(token)
    setLfmStep(3)
  }

  const handleLfmConfirm = async () => {
    setLfmStep(4)
    const sessionKey = await window.melo.lastfmGetSession(lfmToken)
    if (sessionKey) {
      setLastfmSessionKey(sessionKey)
      await window.melo.lastfmConfigure({
        apiKey: lastfmApiKey,
        apiSecret: lastfmApiSecret,
        sessionKey,
        enabled: true,
      })
      persist('lastfm', { apiKey: lastfmApiKey, apiSecret: lastfmApiSecret, sessionKey })
      persist('lastfmEnabled', true)
      setLastfm(true)
      setLfmStep(5)
      return
    }
    setLfmStep(3)
  }

  const handleOpenService = (service) => {
    window.melo.switchService(service.id, service.url, service)
    setActiveService(service.id, service.color, service.name)
    setView('player')
    onClose()
  }

  const handleSwitchToPicker = () => {
    setView('picker')
    onClose()
  }

  return (
    <>
      <div className={`settings-overlay ${isOpen ? 'show' : ''}`} onClick={onClose} />

      <aside className={`settings-panel ${isOpen ? 'open' : ''}`}>
        <header>
          <h2>Ajustes</h2>
          <button onClick={onClose}><X size={18} /></button>
        </header>

        <div className="settings-content">
          <section>
            <h3>SERVICIOS <span className="badge-version">v0.2</span></h3>
            <button className="settings-btn-secondary" onClick={handleSwitchToPicker}>
              Cambiar servicio
            </button>
            {Object.values(SERVICES).map((service) => {
              const isActive = activeServiceId === service.id
              const isConnected = connectedServices.includes(service.id)
              return (
                <div key={service.id} className="service-row-settings">
                  <div className="service-name-wrap">
                    <span className="service-dot" style={{ '--service-color': service.color }} />
                    <span>{service.name}</span>
                    {isActive && <span className="badge-version">Activo</span>}
                    {isConnected && <span className="badge-connected-inline">Conectado</span>}
                  </div>
                  <button className="settings-btn" onClick={() => handleOpenService(service)}>
                    Abrir
                  </button>
                </div>
              )
            })}
          </section>

          <section>
            <h3>DISCORD <span className="badge-version">v0.3</span></h3>
            <SettingsRow label="Rich Presence" type="toggle" value={discordEnabled} onChange={handleDiscordToggle} />
            {discordEnabled && (
              <>
                <SettingsRow
                  label="Discord App ID"
                  type="input"
                  value={discordClientId}
                  onChange={(v) => {
                    setDiscordClientId(v)
                    persist('discordClientId', v)
                  }}
                  placeholder="ID de discord.com/developers"
                />
                <SettingsRow
                  label="Conectar"
                  type="button"
                  buttonText="Conectar"
                  onChange={handleDiscordConnect}
                />
              </>
            )}
            <p className={`integration-status ${discordConnected ? 'ok' : 'error'}`}>
              ● {discordConnected ? 'Conectado' : 'Desconectado'}
            </p>
          </section>

          <section>
            <h3>LAST.FM <span className="badge-version">v0.3</span></h3>
            <SettingsRow label="Scrobbling" type="toggle" value={lastfmEnabled} onChange={handleLfmToggle} />
            {lastfmEnabled && (
              <div className="lfm-flow">
                <p className="lfm-step">Step {lfmStep} de 5</p>
                {lfmStep <= 2 && (
                  <>
                    <SettingsRow
                      label="API Key"
                      type="input"
                      value={lastfmApiKey}
                      onChange={(v) => {
                        setLastfmApiKey(v)
                        persist('lastfm', { apiKey: v, apiSecret: lastfmApiSecret, sessionKey: '' })
                      }}
                      placeholder="Tu API Key"
                    />
                    <SettingsRow
                      label="API Secret"
                      type="input"
                      value={lastfmApiSecret}
                      onChange={(v) => {
                        setLastfmApiSecret(v)
                        persist('lastfm', { apiKey: lastfmApiKey, apiSecret: v, sessionKey: '' })
                      }}
                      placeholder="Tu API Secret"
                    />
                    <SettingsRow
                      label="Autorizar"
                      type="button"
                      buttonText="Autorizar en Last.fm ->"
                      onChange={handleLfmAuth}
                    />
                  </>
                )}

                {lfmStep === 3 && (
                  <>
                    <p className="lfm-help">Autoriza Melo en Last.fm y vuelve aqui.</p>
                    <SettingsRow
                      label="Confirmar"
                      type="button"
                      buttonText="Ya autorice"
                      onChange={handleLfmConfirm}
                    />
                  </>
                )}

                {lfmStep === 4 && <p className="lfm-help">Obteniendo sesion...</p>}
                {lfmStep === 5 && <p className="lfm-help ok">✓ Last.fm conectado como @usuario</p>}
              </div>
            )}
          </section>

          <section>
            <h3>NOTIFICACIONES <span className="badge-version">v0.3</span></h3>
            <SettingsRow label="Notificaciones de cancion" type="toggle" value={notificationsEnabled} onChange={handleNotificationsToggle} />
          </section>

          <section>
            <h3>SISTEMA</h3>
            <SettingsRow
              label="Atajos multimedia (teclas de reproduccion)"
              type="toggle"
              value={mediaKeysEnabled}
              onChange={handleMediaKeysToggle}
            />
            <SettingsRow
              label="Habilitar bandeja (tray)"
              type="toggle"
              value={trayEnabled}
              onChange={handleTrayToggle}
            />

            <div className={`settings-row ${!trayEnabled ? 'disabled' : ''}`}>
              <div className="settings-text">
                <p className="label">Al cerrar la ventana</p>
                <p className="sublabel">Si eliges 'Ir a bandeja', Melo seguira ejecutandose en segundo plano.</p>
              </div>
              <div className="settings-control">
                <select
                  className="settings-select"
                  value={trayEnabled ? closeBehavior : 'quit'}
                  onChange={(e) => handleCloseBehaviorChange(e.target.value)}
                  disabled={!trayEnabled}
                >
                  <option value="tray">Ir a bandeja</option>
                  <option value="quit">Salir</option>
                </select>
              </div>
            </div>

            <SettingsRow
              label="Iniciar con el sistema"
              type="toggle"
              value={autostartEnabled}
              onChange={handleAutostartToggle}
            />
            <SettingsRow
              label="Iniciar minimizado"
              type="toggle"
              value={startMinimized}
              onChange={handleStartMinimizedToggle}
              disabled={!autostartEnabled}
            />
          </section>

          <section>
            <h3>APARIENCIA</h3>
            <SettingsRow label="Tema" type="text" value={theme.toUpperCase()} />
            <div className="theme-grid">
              {THEMES.map((id) => (
                <button
                  key={id}
                  className={`theme-btn ${theme === id ? 'active' : ''}`}
                  onClick={() => handleThemeChange(id)}
                >
                  {id}
                </button>
              ))}
            </div>
            {theme === 'custom' && (
              <ThemeEditor onClose={() => {}} />
            )}
            <SettingsRow
              label="Tema dinamico por artwork"
              sublabel="El color cambia segun la portada del album"
              type="toggle"
              value={dynamicThemeEnabled}
              onChange={async (v) => {
                setDynamicTheme(v)
                await window.melo.saveSettings('dynamicTheme', v)
                if (!v) {
                  applyTheme(theme, customTheme)
                }
              }}
            />
          </section>

          <section>
            <h3>MODO INMERSIVO</h3>
            <SettingsRow
              label="Modo inmersivo"
              sublabel="Oculta la barra lateral para maximizar el contenido"
              type="toggle"
              value={immersiveEnabled}
              onChange={handleImmersiveToggle}
            />
            <SettingsRow
              label="Controles flotantes"
              sublabel="Muestra la barra de control encima del contenido"
              type="toggle"
              value={overlayControlsEnabled}
              onChange={handleOverlayControlsToggle}
              disabled={!immersiveEnabled}
            />
            <div className={`settings-row ${!immersiveEnabled ? 'disabled' : ''}`}>
              <div className="settings-text">
                <p className="label">Posición de controles</p>
                <p className="sublabel">Ubicación de la barra de control flotante</p>
              </div>
              <div className="settings-control">
                <select
                  className="settings-select"
                  value={overlayPosition}
                  onChange={(e) => handleOverlayPositionChange(e.target.value)}
                  disabled={!immersiveEnabled}
                >
                  <option value="bottom">Abajo</option>
                  <option value="top">Arriba</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <h3>ATAJOS</h3>
            <SettingsRow label="Cmd+K Command Palette" badge="v0.4" type="shortcut" value="Cmd/Ctrl+K" />
            <SettingsRow label="MediaPlayPause" type="shortcut" value="MediaPlayPause" />
            <SettingsRow label="MediaNext / MediaPrev" type="shortcut" value="MediaNextTrack / MediaPreviousTrack" />
          </section>

          <section>
            <h3>ESTADISTICAS <span className="badge-version">v0.5</span></h3>
            <SettingsRow label="Guardar historial" type="toggle" value={statsEnabled} onChange={handleStatsToggle} />
            <SettingsRow label="Exportar datos" type="button" onChange={handleExport} />
            <SettingsRow label="Borrar estadisticas" type="button" buttonText="Borrar" onChange={handleClearStats} />
          </section>

          <section>
            <h3>ACTUALIZACIONES <span className="badge-version">v1.0</span></h3>
            <SettingsRow label="Version" type="text" value={`v${version}`} />
            <SettingsRow label="Auto-update" type="toggle" value={autoUpdateEnabled} onChange={handleAutoUpdateToggle} />
          </section>

          <section>
            <h3>SERVICIOS CONECTADOS</h3>
            {Object.values(SERVICES).map((service) => {
              const isConnected = connectedServices.includes(service.id)
              return (
                <SettingsRow
                  key={service.id}
                  label={service.name}
                  type="text"
                  value={isConnected ? 'conectado' : 'desconectado'}
                />
              )
            })}
          </section>
        </div>
      </aside>
    </>
  )
}
