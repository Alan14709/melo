import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useToastStore } from '../hooks/useToast'
import Toast from './Toast'

export default function ToastManager() {
  const { toasts, remove } = useToastStore(
    useShallow((state) => ({
      toasts: state.toasts,
      remove: state.remove,
    }))
  )

  if (!toasts || toasts.length === 0) return null
  const visibleToasts = toasts.slice(0, 3)

  return (
    <div className="toast-manager-layer" aria-live="polite" aria-atomic="true" role="region" aria-label="Notificaciones">
      <div className="toast-container">
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
    </div>
  )
}
