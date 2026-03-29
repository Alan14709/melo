import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { create } from 'zustand'

/**
 * Toast Store - Queue global de notificaciones
 * Usar el hook useToast() para acceder desde cualquier componente
 */
export const useToastStore = create((set) => ({
  toasts: [], // { id, message, type, duration }

  add: (message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    if (import.meta.env.DEV) {
      console.log('[Toast] TOAST TRIGGERED', { id, type, message, duration })
    }
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }))
    return id
  },

  remove: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clear: () => set({ toasts: [] }),
}))

/**
 * useToast Hook
 * Interfaz simplificada para mostrar toasts desde cualquier componente
 *
 * @example
 * const { success, error, info } = useToast()
 *
 * // En una acción:
 * try {
 *   await saveSettings()
 *   success('Configuración guardada')
 * } catch (err) {
 *   error(`Error: ${err.message}`)
 * }
 */
export function useToast() {
  const { add, remove } = useToastStore(useShallow((state) => ({
    add: state.add,
    remove: state.remove,
  })))

  const success = useCallback((message) => add(message, 'success', 4000), [add])
  const error = useCallback((message) => add(message, 'error', 5000), [add])
  const info = useCallback((message) => add(message, 'info', 3000), [add])

  return { success, error, info, add, remove }
}
