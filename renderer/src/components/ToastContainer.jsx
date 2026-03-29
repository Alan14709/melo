import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useToastStore } from '../hooks/useToast'
import Toast from './Toast'

/**
 * ToastContainer
 * Renderiza la cola de toasts dentro del sidebar (sin overlay global)
 */
export default function ToastContainer() {
  // Usar selector para evitar re-renders innecesarios
  const { toasts, remove } = useToastStore(
    useShallow((state) => ({
      toasts: state.toasts,
      remove: state.remove,
    }))
  )

  // Si no hay toasts, no renderiza nada
  if (!toasts || toasts.length === 0) return null
  const visibleToasts = toasts.slice(0, 3)

  return (
    <div className="toast-container" role="region" aria-label="Notificaciones">
      {visibleToasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onDismiss={remove}
        />
      ))}
    </div>
  )
}
