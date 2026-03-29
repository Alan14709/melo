/**
 * SettingsPanel - VERSIÓN MEJORADA CON FASE 1 + FASE 2
 * 
 * Cambios clave aplicados:
 * ✅ Toast + Logger reemplazan .catch(() => {})
 * ✅ UI State feedback (loading, success, error)
 * ✅ Motion system (animations suaves)
 * ✅ Accessibility (focus-visible, aria-labels)
 * 
 * NOTA: Este es un ejemplo de referencia.
 * Para aplicar en el código actual, seguir los patterns en errorHandling.example.md
 */

import React, { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'
import { useToast } from '../hooks/useToast'
import { logger } from '../utils/logger'
import SettingsRow from './SettingsRow.jsx'

export default function SettingsPanelUpgraded({ isOpen, onClose }) {
  const { setUIState, uiState } = usePlayerStore()
  const { success, error: showError } = useToast()

  // Convertir a controlled loading para demostración
  const settingsLoadingState = uiState.settings
  const isLoading = settingsLoadingState === 'loading'

  // ============================================
  // PATRÓN 1: Reemplazar .catch(() => {}) con error handling
  // ============================================
  useEffect(() => {
    if (!isOpen) return

    // Marcar como cargando
    setUIState('settings', 'loading')

    window.melo.getSettings()
      .then((settings) => {
        // Éxito: actualizar UI
        processSettings(settings)
        setUIState('settings', 'success')
        logger.info('Configuración cargada exitosamente')
      })
      .catch((err) => {
        // Error: logging + toast + UI state
        logger.error('No pude cargar los ajustes', err)
        showError('Error al cargar ajustes. Usando valores por defecto.')
        setUIState('settings', 'error')

        // Aplicar defaults seguros
        processSettings({})
      })
  }, [isOpen, setUIState, showError])

  const processSettings = (settings) => {
    const safe = settings || {}
    const nextTrayEnabled = safe.trayEnabled ?? true
    const nextCloseBehaviorRaw = safe.closeBehavior ?? 'tray'
    const nextCloseBehavior = nextCloseBehaviorRaw === 'quit' ? 'quit' : 'tray'

    // Actualizar estado local...
    // setTrayEnabled(Boolean(nextTrayEnabled))
    // etc.
  }

  // ============================================
  // PATRÓN 2: Persist con error handling y feedback
  // ============================================
  const persist = useCallback(
    (key, value) => {
      window.melo.saveSettings(key, value)
        .then(() => {
          logger.info(`Guardado: ${key}`)
          // Toast en fondo (sin interrumpir)
          // success(`${key} guardado`)
        })
        .catch((err) => {
          logger.error(`No pude guardar ${key}`, err)
          showError(`Error al cambiar ${key}`)
        })
    },
    [showError]
  )

  // ============================================
  // PATRÓN 3: Operaciones async con UI state
  // ============================================
  const handleDiscordToggle = useCallback(
    async (enabled) => {
      try {
        setUIState('connection', 'loading')

        const ok = await window.melo.discordToggle(enabled, '')
        setUIState('connection', 'success')

        success(enabled ? 'Discord conectado' : 'Discord desconectado')
        logger.info('Discord toggled', { enabled })
      } catch (err) {
        setUIState('connection', 'error')
        showError('Error al conectar Discord')
        logger.error('Discord toggle failed', err)
      }
    },
    [setUIState, success, showError]
  )

  // ============================================
  // ACCESIBILIDAD: aria-labels + focus management
  // ============================================
  return (
    <>
      {/* 
        Overlay con animación suave (respeta --motion-base)
        + accessibility: backdrop-filter accesible
      */}
      <div
        className={`settings-overlay ${isOpen ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 
        Panel con animación deslizante (transform + opacity)
        + accessibility: role + aria-label
      */}
      <aside
        className={`settings-panel ${isOpen ? 'open' : ''}`}
        role="region"
        aria-label="Panel de ajustes"
        aria-modal={isOpen}
      >
        <header>
          <h2>Ajustes</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar panel de ajustes"
            className="settings-close-btn"
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="settings-content">
          {/* 
            Loading Indicator
            Solo muestra si está cargando
          */}
          {isLoading && (
            <div
              className="settings-loading"
              role="status"
              aria-live="polite"
            >
              <div className="spinner" />
              <p>Cargando ajustes...</p>
            </div>
          )}

          {/* Contenido principal - visible cuando no está loading */}
          <div style={{ opacity: isLoading ? 0.5 : 1 }}>
            {/* Secciones de settings... */}
          </div>
        </div>
      </aside>
    </>
  )
}

/**
 * ============================================
 * ACTUALIZACIÓN DE ESTILOS EN globals.css
 * Reemplazar .settings-panel { ... }
 * ============================================
 */

/**
.settings-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  height: 100%;
  background: #0f0f10;
  border-left: 1px solid var(--border);
  
  // PHASE 2: Animación suave con motion tokens
  transform: translateX(100%);
  transition: transform var(--motion-base) var(--ease-standard),
              opacity var(--motion-base) var(--ease-standard);
  
  z-index: 90;
  display: flex;
  flex-direction: column;
}

.settings-panel.open {
  transform: translateX(0);
  box-shadow: -2px 0 24px rgba(0, 0, 0, 0.3);
}

// Loading state visual
.settings-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin var(--motion-slow) linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// Accessibility: Focus visible button
.settings-close-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

// Motion: Respetar preferencia de usuario
@media (prefers-reduced-motion: reduce) {
  .settings-panel {
    transition: none;
  }
  .spinner {
    animation: none;
  }
}
 */
