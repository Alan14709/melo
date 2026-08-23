import React, { useEffect, useRef, useState } from 'react'
import { Music, X } from 'lucide-react'
import { SERVICES } from '../../../services/registry'
import { getArtworkPalette, hexToRgba } from '../utils/artworkPalette'
import { useNowPlayingMenu } from './TrackSearchMenu.jsx'

/**
 * Mini Player — widget flotante de previsualización.
 *
 * Solo muestra qué suena: no lleva controles de reproducción. Duplicarlos
 * obligaba a operar sobre el DOM del servicio embebido, que es de donde venían
 * los fallos silenciosos de anterior/siguiente. Las teclas multimedia, el tray
 * y MPRIS siguen cubriendo el control real.
 *
 * El fondo toma color del artwork para que el widget se lea como parte de lo
 * que está sonando.
 */
export default function MiniPlayer() {
  const [track, setTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [serviceId, setServiceId] = useState(null)
  const [tint, setTint] = useState(null)
  const lastArtworkRef = useRef(null)

  useEffect(() => {
    const unsubscribe = window.melo.onMediaUpdate((data) => {
      if (!data?.title) return
      setTrack(data)
      // `isPlaying` lo calcula main (necesario para Apple Music); `state` es el
      // respaldo. Antes solo se miraba `state` y el indicador se quedaba atrás.
      setIsPlaying(data.isPlaying ?? data.state === 'playing')
      if (data.serviceId) setServiceId(data.serviceId)
    })

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  // Tinte del fondo a partir del artwork, con la misma caché que el resto de la app.
  useEffect(() => {
    const artwork = track?.artwork
    if (!artwork || artwork === lastArtworkRef.current) return
    lastArtworkRef.current = artwork

    let cancelled = false
    getArtworkPalette(artwork)
      .then((result) => {
        if (cancelled || !result?.gradient) return
        setTint(result.gradient.vibrant)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [track?.artwork])

  const service = serviceId ? SERVICES[serviceId] : null
  const hasTrack = Boolean(track?.title)
  // Sin nada sonando, el filo no debe heredar el acento por defecto: se leia
  // como si hubiera un servicio activo cuando no lo hay.
  const accent = hasTrack
    ? (service?.color || tint || 'var(--accent)')
    : 'var(--border, rgba(128,128,128,0.4))'

  const subtitle = [track?.artist, track?.album].filter(Boolean).join(' · ')
  const openMenu = useNowPlayingMenu(track?.title, track?.artist)

  return (
    <div
      className={`mini-player drag-region ${isPlaying ? 'is-playing' : ''} ${hasTrack ? '' : 'is-empty'}`}
      style={{
        '--mini-accent': accent,
        '--mini-tint': tint ? hexToRgba(tint, 0.22) : 'transparent',
      }}
      onContextMenu={hasTrack ? openMenu : undefined}
    >
      <div className="mini-artwork-wrap">
        {track?.artwork ? (
          <img src={track.artwork} className="mini-artwork" alt="" />
        ) : (
          <div className="mini-artwork placeholder">
            <Music size={20} aria-hidden="true" />
          </div>
        )}
        {isPlaying && (
          <span className="mini-eq" aria-hidden="true">
            <i /><i /><i />
          </span>
        )}
      </div>

      <div className="mini-info">
        <p className="mini-title" title={track?.title || undefined}>
          {track?.title ?? 'Sin reproducción'}
        </p>
        <p className="mini-artist" title={subtitle || undefined}>
          {subtitle || 'Nada sonando ahora mismo'}
        </p>
        {service && (
          <p className="mini-service">
            <span className="mini-service-dot" aria-hidden="true" />
            {service.name}
            <span className="sr-only">
              {isPlaying ? ' — reproduciendo' : ' — en pausa'}
            </span>
          </p>
        )}
      </div>

      <div className="mini-actions no-drag">
        <button
          type="button"
          className="mini-btn"
          onClick={() => window.melo.windowAction('focus')}
          aria-label="Abrir la ventana de Melo"
          title="Abrir Melo"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </button>
        <button
          type="button"
          className="mini-btn mini-btn-close"
          onClick={() => window.melo.miniToggle()}
          aria-label="Cerrar mini player"
          title="Cerrar"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
