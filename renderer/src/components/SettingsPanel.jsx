import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { SERVICES } from '../../../services/registry'
import { version } from '../../../package.json'
import { usePlayerStore } from '../store/usePlayerStore'
import { useToast } from '../hooks/useToast'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { logger } from '../utils/logger'
import SettingsRow from './SettingsRow.jsx'
import ThemeEditor from './ThemeEditor.jsx'
import ResourceMonitor from './ResourceMonitor.jsx'
import { applyTheme } from '../utils/applyTheme'

const THEMES = ['dark', 'oled', 'light', 'nord', 'catppuccin', 'mono', 'liquid-glass', 'custom']

const THEME_LABELS = {
  dark: 'Dark',
  oled: 'OLED',
  light: 'Light',
  nord: 'Nord',
  catppuccin: 'Catppuccin',
  mono: 'Mono',
  'liquid-glass': 'Liquid Glass',
  custom: 'Custom',
}

// Pestañas con tablas o rejillas que no caben en el ancho normal del drawer.
const WIDE_TABS = new Set(['rendimiento'])

const SETTINGS_TABS = [
  { id: 'servicios',      label: 'Servicios' },
  { id: 'apariencia',     label: 'Apariencia' },
  { id: 'sistema',        label: 'Sistema' },
  { id: 'integraciones',  label: 'Integraciones' },
  { id: 'atajos',         label: 'Atajos' },
  { id: 'rendimiento',    label: 'Rendimiento' },
  { id: 'datos',          label: 'Datos' },
]

export default function SettingsPanel({ isOpen, onClose }) {
  const settingsTab = usePlayerStore((s) => s.settingsTab)
  const setSettingsTab = usePlayerStore((s) => s.setSettingsTab)
  const activeTab = settingsTab
  const setActiveTab = setSettingsTab
  const { error: showError, success: showSuccess, info: showInfo } = useToast()
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
  } = usePlayerStore()

  const [discordConnected, setDiscordConnected] = useState(false)
  const [lfmStep, setLfmStep] = useState(1)
  const [lfmToken, setLfmToken] = useState(null)
  const [trayEnabled, setTrayEnabled] = useState(true)
  const [closeBehavior, setCloseBehavior] = useState('tray')
  const [autostartEnabled, setAutostartEnabled] = useState(false)
  const [startMinimized, setStartMinimized] = useState(true)
  const [pendingClearConfirm, setPendingClearConfirm] = useState(false)
  const clearConfirmTimerRef = useRef(null)
  const panelRef = useRef(null)

  useFocusTrap(panelRef, isOpen)

  // Patron ARIA de tabs: una sola parada de tabulacion para las seis pestañas,
  // y flechas para moverse entre ellas.
  const handleTabsKeyDown = (event) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const jumpTo = event.key === 'Home' ? 0 : event.key === 'End' ? SETTINGS_TABS.length - 1 : null

    if (!delta && jumpTo === null) return
    event.preventDefault()

    const currentIndex = SETTINGS_TABS.findIndex((tab) => tab.id === activeTab)
    const nextIndex = jumpTo !== null
      ? jumpTo
      : (currentIndex + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length

    const nextTab = SETTINGS_TABS[nextIndex]
    setActiveTab(nextTab.id)
    panelRef.current?.querySelector(`#settings-tab-${nextTab.id}`)?.focus()
  }

  useEffect(() => {
    return () => {
      clearTimeout(clearConfirmTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    window.melo.getSettings()
      .then((settings) => {
        const safe = settings || {}
        const nextTrayEnabled = safe.trayEnabled ?? true
        const nextCloseBehaviorRaw = safe.closeBehavior ?? 'tray'
        const nextCloseBehavior = nextCloseBehaviorRaw === 'quit' ? 'quit' : 'tray'

        setTrayEnabled(Boolean(nextTrayEnabled))
        setCloseBehavior(nextTrayEnabled ? nextCloseBehavior : 'quit')
        setAutostartEnabled(Boolean(safe.autostartEnabled ?? false))
        setStartMinimized(Boolean(safe.startMinimized ?? true))
        logger.info('Configuración de bandeja cargada')
      })
      .catch((err) => {
        // Phase 1: Error handling mejorado
        logger.error('No pude cargar configuración de bandeja', err)
        showError('Error al cargar ajustes avanzados. Usando valores por defecto.')
        // Defaults seguros
        setTrayEnabled(true)
        setCloseBehavior('tray')
        setAutostartEnabled(false)
        setStartMinimized(true)
      })
  }, [isOpen, showError])

  useEffect(() => {
    if (!isOpen) return
    window.melo.discordStatus()
      .then((status) => {
        setDiscordConnected(Boolean(status))
        logger.debug('Discord status checked', { connected: Boolean(status) })
      })
      .catch((err) => {
        // Operación opcional - no mostrar toast, solo log
        logger.warn('No pude verificar estado de Discord', err)
        setDiscordConnected(false)
      })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const handleExport = async () => {
    // Antes exportaba `playHistory` del store: un array en memoria que se
    // vaciaba en cada arranque, asi que el archivo salia casi siempre vacio.
    // El historial real y persistente vive en main.
    try {
      const payload = await window.melo.stats.export()
      if (!payload) {
        showError('No hay historial que exportar todavía.')
        return
      }

      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `melo-history-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      showSuccess('Historial exportado')
    } catch (err) {
      logger.error('History export failed', err)
      showError('No se pudo exportar el historial')
    }
  }

  const handleClearStats = async () => {
    if (!pendingClearConfirm) {
      setPendingClearConfirm(true)
      showInfo('Presiona de nuevo para confirmar borrado de estadisticas')
      clearTimeout(clearConfirmTimerRef.current)
      clearConfirmTimerRef.current = setTimeout(() => {
        setPendingClearConfirm(false)
      }, 3500)
      return
    }

    setPendingClearConfirm(false)
    clearTimeout(clearConfirmTimerRef.current)

    try {
      await window.melo.stats.clear()
      logger.info('Estadísticas borradas')
      showSuccess('Estadísticas borradas correctamente')
    } catch (err) {
      logger.error('Error al borrar estadísticas', err)
      showError('No pude borrar las estadísticas')
    }
  }

  const persist = async (key, value, options = {}) => {
    const {
      successMessage,
      errorMessage,
      silentSuccess = true,
    } = options

    try {
      await window.melo.saveSettings(key, value)
      logger.debug(`Guardado: ${key}`, { value })

      if (!silentSuccess && successMessage) {
        showSuccess(successMessage)
      }
      return true
    } catch (err) {
      logger.error(`Error al guardar ${key}`, err)
      const msg = errorMessage || `No pude guardar ${key}`
      showError(msg)
      return false
    }
  }

  const handleNotificationsToggle = async (enabled) => {
    setNotifications(enabled)
    const saved = await persist('notificationsEnabled', enabled, {
      successMessage: enabled ? 'Notificaciones activadas' : 'Notificaciones desactivadas',
      errorMessage: 'No pude actualizar notificaciones',
      silentSuccess: false,
    })

    if (!saved || !enabled) return

    try {
      await window.melo.notification?.show?.({
        title: 'Melo',
        body: 'Las notificaciones estan activas.',
        silent: true,
      })
    } catch (_) {}
  }

  const handleMediaKeysToggle = async (enabled) => {
    setMediaKeys(enabled)
    await persist('mediaKeysEnabled', enabled, {
      successMessage: enabled ? 'Atajos multimedia activados' : 'Atajos multimedia desactivados',
      errorMessage: 'No pude actualizar atajos multimedia',
      silentSuccess: false,
    })
  }

  const handleThemeChange = async (nextTheme) => {
    try {
      setTheme(nextTheme)
      applyTheme(nextTheme, nextTheme === 'custom' ? customTheme : null)
      await window.melo.saveSettings('theme', nextTheme)
      showSuccess('Tema actualizado')
    } catch (err) {
      logger.error('No pude guardar el tema', err)
      showError('No pude guardar el tema')
    }
  }

  const handleAutoUpdateToggle = async (enabled) => {
    setAutoUpdate(enabled)
    await persist('autoUpdateEnabled', enabled, {
      successMessage: enabled ? 'Auto-update activado' : 'Auto-update desactivado',
      errorMessage: 'No pude actualizar auto-update',
      silentSuccess: false,
    })
  }

  const handleStatsToggle = async (enabled) => {
    setStats(enabled)
    await persist('statsEnabled', enabled, {
      successMessage: enabled ? 'Historial activado' : 'Historial desactivado',
      errorMessage: 'No pude actualizar historial',
      silentSuccess: false,
    })
  }

  const handleTrayToggle = async (enabled) => {
    setTrayEnabled(enabled)
    await persist('trayEnabled', enabled, {
      successMessage: enabled ? 'Bandeja activada' : 'Bandeja desactivada',
      errorMessage: 'No pude actualizar bandeja',
      silentSuccess: false,
    })

    // Evitar estados invalidos: sin tray, closeBehavior debe ser quit.
    if (!enabled) {
      setCloseBehavior('quit')
      await persist('closeBehavior', 'quit', {
        successMessage: 'Al cerrar: salir',
        errorMessage: 'No pude actualizar comportamiento al cerrar',
        silentSuccess: false,
      })
    }
  }

  const handleCloseBehaviorChange = async (nextValue) => {
    const value = nextValue === 'quit' ? 'quit' : 'tray'
    if (!trayEnabled && value !== 'quit') return
    setCloseBehavior(value)
    await persist('closeBehavior', value, {
      successMessage: value === 'tray' ? 'Al cerrar: ir a bandeja' : 'Al cerrar: salir',
      errorMessage: 'No pude actualizar comportamiento al cerrar',
      silentSuccess: false,
    })
  }

  const handleAutostartToggle = async (enabled) => {
    setAutostartEnabled(enabled)
    await persist('autostartEnabled', enabled, {
      successMessage: enabled ? 'Inicio automático activado' : 'Inicio automático desactivado',
      errorMessage: 'No pude actualizar inicio automático',
      silentSuccess: false,
    })
  }

  const handleStartMinimizedToggle = async (enabled) => {
    setStartMinimized(enabled)
    await persist('startMinimized', enabled, {
      successMessage: enabled ? 'Inicio minimizado activado' : 'Inicio minimizado desactivado',
      errorMessage: 'No pude actualizar inicio minimizado',
      silentSuccess: false,
    })
  }

  const handleImmersiveToggle = async (enabled) => {
    setImmersive(enabled)
    await persist('immersiveEnabled', enabled, {
      successMessage: enabled ? 'Modo inmersivo activado' : 'Modo inmersivo desactivado',
      errorMessage: 'No pude actualizar modo inmersivo',
      silentSuccess: false,
    })
  }

  const handleOverlayControlsToggle = async (enabled) => {
    setOverlayControls(enabled)
    await persist('overlayControlsEnabled', enabled, {
      successMessage: enabled ? 'Controles flotantes activados' : 'Controles flotantes desactivados',
      errorMessage: 'No pude actualizar controles flotantes',
      silentSuccess: false,
    })
  }

  const handleOverlayPositionChange = async (position) => {
    setOverlayPosition(position)
    await persist('overlayPosition', position, {
      successMessage: position === 'top' ? 'Controles arriba' : 'Controles abajo',
      errorMessage: 'No pude actualizar posición de controles',
      silentSuccess: false,
    })
  }

  const handleDiscordToggle = async (enabled) => {
    try {
      setDiscord(enabled)
      await persist('discordEnabled', enabled)
      const ok = await window.melo.discordToggle(enabled, discordClientId)
      setDiscordConnected(Boolean(ok))

      if (ok) {
        showSuccess(enabled ? 'Discord conectado' : 'Discord desconectado')
      } else {
        showError(enabled ? 'No pude conectar Discord' : 'No pude desconectar Discord')
      }
    } catch (err) {
      logger.error('Discord toggle failed', err)
      showError('Error al actualizar Discord')
    }
  }

  const handleDiscordConnect = async () => {
    try {
      await persist('discordClientId', discordClientId)
      const ok = await window.melo.discordToggle(true, discordClientId)
      setDiscord(true)
      await persist('discordEnabled', true)
      setDiscordConnected(Boolean(ok))

      if (ok) {
        showSuccess('Discord conectado correctamente')
      } else {
        showError('No pude conectar Discord')
      }
    } catch (err) {
      logger.error('Discord connect failed', err)
      showError('Error al conectar Discord')
    }
  }

  const handleLfmToggle = async (enabled) => {
    setLastfm(enabled)
    await persist('lastfmEnabled', enabled, {
      successMessage: enabled ? 'Scrobbling activado' : 'Scrobbling desactivado',
      errorMessage: 'No pude actualizar Last.fm',
      silentSuccess: false,
    })
    if (!enabled) {
      setLfmStep(1)
      setLfmToken(null)
    }
  }

  const handleLfmAuth = async () => {
    try {
      await window.melo.lastfmConfigure({
        apiKey: lastfmApiKey,
        apiSecret: lastfmApiSecret,
        sessionKey: '',
        enabled: true,
      })
      await persist('lastfm', { apiKey: lastfmApiKey, apiSecret: lastfmApiSecret, sessionKey: '' })

      const token = await window.melo.lastfmAuth()
      setLfmToken(token)
      setLfmStep(3)
      showSuccess('Continuar autorización en Last.fm')
    } catch (err) {
      logger.error('Last.fm auth init failed', err)
      showError('Error iniciando autorización de Last.fm')
    }
  }

  const handleLfmConfirm = async () => {
    try {
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
        await persist('lastfm', { apiKey: lastfmApiKey, apiSecret: lastfmApiSecret, sessionKey })
        await persist('lastfmEnabled', true)
        setLastfm(true)
        setLfmStep(5)
        showSuccess('Last.fm conectado correctamente')
        return
      }
      setLfmStep(3)
      showError('No se pudo confirmar Last.fm todavía')
    } catch (err) {
      logger.error('Last.fm confirm failed', err)
      setLfmStep(3)
      showError('Error al confirmar sesión de Last.fm')
    }
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

      <aside
        ref={panelRef}
        className={`settings-panel ${isOpen ? 'open animate-slide-up' : ''} ${WIDE_TABS.has(activeTab) ? 'settings-panel-wide' : ''}`}
        role="dialog"
        aria-modal={isOpen || undefined}
        aria-label="Ajustes"
        aria-hidden={!isOpen || undefined}
      >
        <header>
          <h2>Ajustes</h2>
          <button onClick={onClose} aria-label="Cerrar ajustes" title="Cerrar">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <nav className="settings-tabs" role="tablist" aria-label="Secciones de ajustes" onKeyDown={handleTabsKeyDown}>
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="settings-tabpanel"
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div
          className="settings-content"
          id="settings-tabpanel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          tabIndex={0}
        >
          {activeTab === 'servicios' && (
          <section className="settings-section-card">
            <h3 className="settings-section-title">SERVICIOS</h3>
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
          )}

          {activeTab === 'servicios' && (
          <section className="settings-section-card">
            <h3 className="settings-section-title">SERVICIOS CONECTADOS</h3>
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
          )}

          {activeTab === 'integraciones' && (
          <>
          <section className="settings-section-card">
            <h3 className="settings-section-title">DISCORD</h3>
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

          <section className="settings-section-card">
            <h3 className="settings-section-title">LAST.FM</h3>
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

          <section className="settings-section-card">
            <h3 className="settings-section-title">NOTIFICACIONES</h3>
            <SettingsRow label="Notificaciones de cancion" type="toggle" value={notificationsEnabled} onChange={handleNotificationsToggle} />
          </section>
          </>
          )}

          {activeTab === 'apariencia' && (
          <>
          <section className="settings-section-card">
            <h3 className="settings-section-title">APARIENCIA</h3>
            <SettingsRow label="Tema" type="text" value={theme.toUpperCase()} />
            <div className="theme-grid">
              {THEMES.map((id) => (
                <button
                  key={id}
                  className={`theme-btn theme-btn-${id} ${theme === id ? 'active' : ''}`}
                  onClick={() => handleThemeChange(id)}
                >
                  <span className="theme-btn-swatch" aria-hidden="true" />
                  <span className="theme-btn-label">{THEME_LABELS[id] || id}</span>
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
            <p className="theme-dynamic-note">
              Al desactivar el dinamico, se recupera tu tema seleccionado.
            </p>
          </section>

          <section className="settings-section-card">
            <h3 className="settings-section-title">MODO INMERSIVO</h3>
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
          </>
          )}

          {activeTab === 'sistema' && (
          <section className="settings-section-card">
            <h3 className="settings-section-title">SISTEMA</h3>
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
          )}

          {activeTab === 'sistema' && (
          <section className="settings-section-card">
            <h3 className="settings-section-title">ACTUALIZACIONES</h3>
            <SettingsRow label="Version" type="text" value={`v${version}`} />
            <SettingsRow label="Auto-update" type="toggle" value={autoUpdateEnabled} onChange={handleAutoUpdateToggle} />
          </section>
          )}

          {activeTab === 'atajos' && (
          <section className="settings-section-card">
            <h3 className="settings-section-title">ATAJOS DE TECLADO</h3>
            <SettingsRow label="Apple Music"      type="shortcut" value="Ctrl+1" />
            <SettingsRow label="Spotify"          type="shortcut" value="Ctrl+2" />
            <SettingsRow label="YouTube Music"    type="shortcut" value="Ctrl+3" />
            <SettingsRow label="Tidal"            type="shortcut" value="Ctrl+4" />
            <SettingsRow label="Deezer"           type="shortcut" value="Ctrl+5" />
            <SettingsRow label="Command Palette"  type="shortcut" value="Ctrl+K" />
            <SettingsRow label="Play / Pause"     type="shortcut" value="Espacio" />
            <SettingsRow label="Cerrar overlay"   type="shortcut" value="Escape" />
            <SettingsRow label="Teclas multimedia" type="shortcut" value="MediaPlay / Next / Prev" />
          </section>
          )}

          {activeTab === 'rendimiento' && (
          <section className="settings-section-card">
            <h3 className="settings-section-title">RECURSOS</h3>
            <p className="settings-section-hint">
              Cada servicio corre en su propio proceso. Si Melo va lento, aquí se ve cuál lo está
              cargando.
            </p>
            <ResourceMonitor isVisible={isOpen && activeTab === 'rendimiento'} />
          </section>
          )}

          {activeTab === 'datos' && (
          <section className="settings-section-card">
            <h3 className="settings-section-title">ESTADÍSTICAS</h3>
            <SettingsRow label="Guardar historial" type="toggle" value={statsEnabled} onChange={handleStatsToggle} />
            <SettingsRow label="Exportar datos" type="button" onChange={handleExport} />
            <SettingsRow
              label={pendingClearConfirm ? '¿Confirmar borrado?' : 'Borrar estadísticas'}
              type="button"
              buttonText={pendingClearConfirm ? 'Confirmar' : 'Borrar'}
              onChange={handleClearStats}
            />
          </section>
          )}

        </div>
      </aside>
    </>
  )
}
