import { useEffect } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Atrapa el foco dentro de un contenedor mientras esta abierto.
 *
 * Sin esto, con el panel de ajustes o el command palette abiertos, Tab seguia
 * recorriendo el sidebar y la playerbar que quedan detras del overlay: el
 * usuario enfocaba controles que no puede ver.
 *
 * Al cerrar devuelve el foco a donde estaba antes de abrir.
 *
 * @param {React.RefObject<HTMLElement>} containerRef contenedor del modal
 * @param {boolean} isOpen                            si el modal esta visible
 * @param {{ autoFocus?: boolean }} [options]         autoFocus: enfocar el primer
 *        elemento al abrir (desactivalo si el modal ya enfoca su propio input)
 */
export function useFocusTrap(containerRef, isOpen, options = {}) {
  const { autoFocus = true } = options

  useEffect(() => {
    if (!isOpen) return undefined

    const container = containerRef.current
    if (!container) return undefined

    const previouslyFocused = document.activeElement

    const getFocusable = () =>
      Array.from(container.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement)

    let autoFocusRaf = null
    if (autoFocus) {
      // rAF: espera a que el contenido del modal este en el DOM.
      autoFocusRaf = window.requestAnimationFrame(() => getFocusable()[0]?.focus())
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      // El foco puede estar fuera del contenedor (p.ej. tras un click en el
      // fondo): en ese caso reentra por el extremo que corresponda.
      if (!container.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (autoFocusRaf !== null) window.cancelAnimationFrame(autoFocusRaf)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [containerRef, isOpen, autoFocus])
}
