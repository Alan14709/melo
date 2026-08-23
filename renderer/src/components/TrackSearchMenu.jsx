import React, { useCallback } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Disparador del menú de la canción en curso.
 *
 * El menú se construye en main como menú NATIVO, no como desplegable HTML: un
 * BrowserView es una vista nativa que se compone por encima del DOM del
 * renderer, así que cualquier panel HTML queda tapado por el servicio y ningún
 * z-index lo corrige. Los popups de Electron son de nivel sistema.
 *
 * Como efecto secundario el menú gana navegación por teclado y aspecto nativo
 * del escritorio sin código extra.
 */
export function useNowPlayingMenu(title, artist) {
  return useCallback((event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()

    // Coordenadas del contenido de la ventana: es lo que espera Menu.popup().
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    const payload = { title, artist }

    if (rect) {
      payload.x = rect.left
      payload.y = rect.bottom + 4
    } else if (event?.clientX != null) {
      payload.x = event.clientX
      payload.y = event.clientY
    }

    window.melo.showNowPlayingMenu(payload).catch(() => {})
  }, [artist, title])
}

export default function TrackSearchMenu({ title, artist }) {
  const openMenu = useNowPlayingMenu(title, artist)

  if (!title) return null

  return (
    <button
      type="button"
      className="track-search-trigger"
      onClick={openMenu}
      aria-haspopup="menu"
      aria-label={`Opciones para «${title}»`}
      title="Buscar en otro servicio · copiar"
    >
      <ChevronDown size={13} aria-hidden="true" />
    </button>
  )
}
