import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { SERVICES } from '../../../services/registry'
import { usePlayerStore } from '../store/usePlayerStore'
import SettingsRow from './SettingsRow.jsx'

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
    activeServiceId,
    setActiveService,
    setView,
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    statsEnabled,
    setStats,
    autoUpdateEnabled,
    setAutoUpdate,
    connectedServices,
    playHistory,
  } = usePlayerStore()

  const [discordConnected, setDiscordConnected] = useState(false)
  const [lfmStep, setLfmStep] = useState(1)
  const [lfmToken, setLfmToken] = useState(null)

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

  const persist = (key, value) => {
    window.melo.saveSettings(key, value).catch(() => {})
  }

  const handleNotificationsToggle = (enabled) => {
    setNotifications(enabled)
    persist('notificationsEnabled', enabled)
  }

  const handleThemeChange = async (nextTheme) => {
    setTheme(nextTheme)
    await window.melo.saveSettings('theme', nextTheme)
  }

  const handleAutoUpdateToggle = (enabled) => {
    setAutoUpdate(enabled)
    persist('autoUpdateEnabled', enabled)
  }

  const handleAccentChange = (color) => {
    setAccentColor(color)
    persist('accentColor', color)
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
            <SettingsRow label="Notificaciones al cambiar cancion" type="toggle" value={notificationsEnabled} onChange={handleNotificationsToggle} />
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
              <SettingsRow
                label="Color custom"
                type="input"
                value={accentColor}
                onChange={handleAccentChange}
              />
            )}
          </section>

          <section>
            <h3>ATAJOS</h3>
            <SettingsRow label="Cmd+K Command Palette" badge="v0.4" type="shortcut" value="Cmd/Ctrl+K" />
            <SettingsRow label="MediaPlayPause" type="shortcut" value="MediaPlayPause" />
            <SettingsRow label="MediaNext / MediaPrev" type="shortcut" value="MediaNextTrack / MediaPreviousTrack" />
          </section>

          <section>
            <h3>ESTADISTICAS <span className="badge-version">v0.5</span></h3>
            <SettingsRow label="Guardar historial" type="toggle" value={statsEnabled} onChange={setStats} />
            <SettingsRow label="Exportar datos" type="button" onChange={handleExport} />
          </section>

          <section>
            <h3>ACTUALIZACIONES <span className="badge-version">v1.0</span></h3>
            <SettingsRow label="Version" type="text" value="0.1.0" />
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
