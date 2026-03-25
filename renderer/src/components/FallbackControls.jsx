import React from 'react'

const REASON_MAP = {
  adapter_timeout: 'Sin respuesta del adaptador de reproduccion',
  stale_state: 'Estado de reproduccion desactualizado',
  no_media_session: 'Media Session no disponible',
}

const FALLBACK_PHASE_MAP = {
  relaunching: 'Relaunching renderer with fallback',
  safe_mode: 'Entrando en modo seguro',
  manual_retry: 'Reintentando renderer manualmente',
  mitigated: 'Fallback mitigado correctamente',
  exhausted: 'No se pudo recuperar renderer automaticamente',
}

export default function FallbackControls({ health, fallbackStatus }) {
  const healthError = health && health.status === 'error'
  const hasFallback = fallbackStatus && fallbackStatus.phase && fallbackStatus.phase !== 'idle'
  if (!healthError && !hasFallback) return null

  const reason = REASON_MAP[health?.reason] || health?.reason || 'error_desconocido'
  const fallbackMessage = fallbackStatus?.message
    || FALLBACK_PHASE_MAP[fallbackStatus?.phase]
    || 'Fallback activo'
  const showMitigated = Boolean(fallbackStatus?.mitigated)

  const onRetry = () => {
    if (hasFallback) {
      window.melo.fallback?.retryManual?.().catch(() => {})
      return
    }
    window.melo.playerAction('play')
  }

  const onSafeMode = () => {
    window.melo.fallback?.safeMode?.().catch(() => {})
  }

  return (
    <div className="health-banner" role="alert">
      <div className="health-banner-copy">
        <strong>Modo degradado</strong>
        {healthError && <span>{reason}</span>}
        {hasFallback && <span>{fallbackMessage}</span>}
        {showMitigated && <span>Se recupero el renderer, reproduccion disponible.</span>}
      </div>
      <div className="health-banner-actions">
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
        <button type="button" onClick={onSafeMode}>
          Safe Mode
        </button>
        <button type="button" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    </div>
  )
}
