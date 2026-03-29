import React, { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import '../styles/toast.css'

/**
 * Toast Component
 * - Renderiza una notificación individual
 * - Auto-dismiss después de duration
 * - Animación entrada/salida suave
 */
export default function Toast({ id, message, type = 'info', duration = 4000, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (duration === 0) return

    const timerId = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => onDismiss(id), 300) // Esperar a que termine la animación
    }, duration)

    return () => clearTimeout(timerId)
  }, [duration, id, onDismiss])

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => onDismiss(id), 300)
  }

  const iconMap = {
    success: <CheckCircle2 size={18} />,
    error: <AlertCircle size={18} />,
    info: <Info size={18} />,
  }

  return (
    <div
      className={`toast toast-${type} ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="toast-icon">{iconMap[type]}</div>
      <div className="toast-message">{message}</div>
      <button
        className="toast-close"
        onClick={handleDismiss}
        aria-label="Cerrar notificación"
        type="button"
      >
        <X size={16} />
      </button>
    </div>
  )
}
