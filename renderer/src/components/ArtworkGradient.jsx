/**
 * ArtworkGradient.jsx
 * Degradado dinamico animado que reacciona al artwork de la cancion actual.
 * Inspirado en Apple Music. Solo UI, no toca logica de reproduccion.
 */

import React, { useEffect, useRef, useState, memo } from 'react'
import { usePlayerStore } from '../store/usePlayerStore'
import { extractColors, hexToRgba, darkenColor } from '../utils/extractColors'
import { applyDynamicAccent } from '../utils/applyTheme'

const ArtworkGradient = memo(function ArtworkGradient({ opacity = 1 }) {
  const { currentTrack, isPlaying, dynamicThemeEnabled, setAccentColor } = usePlayerStore()
  const artwork = currentTrack?.artwork || currentTrack?.artworkUrl || null

  const [colors, setColors] = useState({
    c1: '#1a0a2e',
    c2: '#0a0a1e',
    c3: '#0a1a2e',
    c4: '#1a0a1a',
  })
  const [transitioning, setTransitioning] = useState(false)
  const prevArtwork = useRef(null)

  useEffect(() => {
    if (!artwork || artwork === prevArtwork.current) return
    prevArtwork.current = artwork

    extractColors(artwork, 24).then(({ vibrant, dominant, muted, palette }) => {
      setTransitioning(true)
      setColors({
        c1: darkenColor(vibrant, 0.25),
        c2: darkenColor(dominant, 0.35),
        c3: darkenColor(muted, 0.20),
        c4: darkenColor(palette[1] || dominant, 0.30),
      })

      // Actualizar accent con color vibrante del artwork si el tema dinamico esta habilitado.
      if (dynamicThemeEnabled) {
        applyDynamicAccent(vibrant)
        setAccentColor(vibrant)
      }
      setTimeout(() => setTransitioning(false), 1200)
    })
  }, [artwork, dynamicThemeEnabled, setAccentColor])

  return (
    <div
      className={`artwork-gradient-root ${isPlaying ? 'playing' : ''} ${transitioning ? 'transitioning' : ''}`}
      style={{ opacity }}
      aria-hidden="true"
    >
      {/* Capa base con gradiente radial */}
      <div
        className="artwork-gradient-layer layer-base"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 80%, ${hexToRgba(colors.c1, 0.9)} 0%, transparent 70%),
            radial-gradient(ellipse 60% 80% at 80% 20%, ${hexToRgba(colors.c2, 0.8)} 0%, transparent 65%),
            radial-gradient(ellipse 100% 100% at 50% 50%, ${hexToRgba(colors.c3, 0.4)} 0%, transparent 80%)
          `,
        }}
      />
      {/* Capa animada que flota */}
      <div
        className="artwork-gradient-layer layer-float"
        style={{
          opacity: 0.9,
          background: `
            radial-gradient(ellipse 70% 50% at 70% 70%, ${hexToRgba(colors.c4, 0.6)} 0%, transparent 60%),
            radial-gradient(ellipse 50% 70% at 30% 30%, ${hexToRgba(colors.c1, 0.5)} 0%, transparent 55%)
          `,
        }}
      />
      {/* Vignette para profundidad */}
      <div className="artwork-gradient-layer layer-vignette" />
    </div>
  )
})

export default ArtworkGradient
