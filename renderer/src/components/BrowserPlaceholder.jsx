import React from 'react'
import { Music2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { usePlayerStore } from '../store/usePlayerStore'

/**
 * Lo que se ve en el area del servicio mientras un overlay obliga a esconder el
 * BrowserView. Antes era un `<p>Ajustes abiertos</p>` de depuracion que llego a
 * produccion; ahora muestra lo que suena.
 *
 * Se suscribe al store por su cuenta para que un cambio de cancion no re-renderice
 * el arbol entero desde App.
 */
export default function BrowserPlaceholder() {
  const { currentTrack, activeServiceName } = usePlayerStore(
    useShallow((s) => ({
      currentTrack: s.currentTrack,
      activeServiceName: s.activeServiceName,
    }))
  )

  return (
    <div className="browser-placeholder">
      {currentTrack?.artwork ? (
        <img src={currentTrack.artwork} alt="" className="browser-placeholder-art" />
      ) : (
        <div className="browser-placeholder-art browser-placeholder-art-empty">
          <Music2 size={30} aria-hidden="true" />
        </div>
      )}

      <p className="browser-placeholder-title">
        {currentTrack?.title ?? 'Melo'}
      </p>
      <p className="browser-placeholder-sub">
        {currentTrack?.artist
          || (activeServiceName ? `Conectado a ${activeServiceName}` : 'Tu música, sin límites')}
      </p>
    </div>
  )
}
