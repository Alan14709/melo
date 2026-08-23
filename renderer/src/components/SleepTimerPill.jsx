import React, { memo, useEffect, useRef, useState } from 'react'
import { Moon, X } from 'lucide-react'
import { useToast } from '../hooks/useToast'

/**
 * Cuenta atrás del temporizador de apagado.
 *
 * El reloj lo lleva main y lo emite cada segundo, así que la píldora no tiene
 * su propio temporizador: si la ventana estuvo minimizada o el equipo suspendido,
 * el número que se ve al volver sigue siendo el correcto.
 */
function fmtRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function SleepTimerPill() {
  const [status, setStatus] = useState({ active: false, remainingMs: 0 })
  const { info: showInfo } = useToast()
  // Un solo aviso por temporizador: main emite un tick por segundo y sin esto
  // el toast saldría en cada uno del último minuto.
  const warnedRef = useRef(false)

  useEffect(() => {
    const unsubscribers = [
      window.melo.sleepTimer.onUpdate((data) => {
        if (!data || typeof data !== 'object') return
        setStatus(data)

        if (!data.active) {
          warnedRef.current = false
          return
        }
        if (!warnedRef.current && data.remainingMs > 0 && data.remainingMs <= 60000) {
          warnedRef.current = true
          showInfo('La música se pausa en 1 minuto')
        }
      }),
      window.melo.sleepTimer.onFired(() => {
        showInfo('Temporizador terminado — reproducción pausada')
      }),
    ]

    window.melo.sleepTimer.getStatus()
      .then((data) => { if (data) setStatus(data) })
      .catch(() => {})

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe()
      })
    }
  }, [showInfo])

  if (!status.active) return null

  return (
    <div className="sleep-pill" role="status" aria-live="off">
      <Moon size={12} aria-hidden="true" />
      <span className="sleep-pill-time">{fmtRemaining(status.remainingMs)}</span>
      <span className="sr-only">
        para que la música se pause automáticamente
      </span>
      <button
        type="button"
        className="sleep-pill-cancel"
        onClick={() => window.melo.sleepTimer.cancel()}
        aria-label="Cancelar temporizador de apagado"
        title="Cancelar temporizador"
      >
        <X size={11} aria-hidden="true" />
      </button>
    </div>
  )
}

export default memo(SleepTimerPill)
