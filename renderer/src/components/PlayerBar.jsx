import React, { useRef, useState } from 'react'
import { Music, Volume2, VolumeX, Volume1 } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'

function AudioVisualizer({ isPlaying, color }) {
  const BARS = 28
  return (
    <div className="visualizer" style={{ '--bar-color': color }}>
      {Array.from({ length: BARS }).map((_, i) => (
        <div
          key={i}
          className={`visualizer-bar ${isPlaying ? 'playing' : 'paused'}`}
          style={{
            animationDelay: `${(i * 0.05) % 0.8}s`,
            animationDuration: `${0.4 + (i % 5) * 0.1}s`,
          }}
        />
      ))}
    </div>
  )
}

function VolumeControl({ color }) {
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const prevVolume = useRef(1)

  const applyVolume = (val) => {
    window.melo.setVolume(val)
  }

  const handleMute = () => {
    if (muted) {
      const restored = prevVolume.current || 1
      setVolume(restored)
      setMuted(false)
      applyVolume(restored)
    } else {
      prevVolume.current = volume
      setVolume(0)
      setMuted(true)
      applyVolume(0)
    }
  }

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    setMuted(val === 0)
    applyVolume(val)
  }

  const VolumeIcon = muted || volume === 0
    ? VolumeX
    : volume < 0.5
      ? Volume1
      : Volume2

  return (
    <div className="volume-control">
      <button
        className="volume-btn"
        onClick={handleMute}
        title={muted ? 'Activar sonido' : 'Silenciar'}
      >
        <VolumeIcon size={15} />
      </button>
      <div className="volume-slider-wrapper">
        <input
          type="range"
          className="volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolumeChange}
          style={{ '--accent': color, '--volume': volume }}
        />
      </div>
    </div>
  )
}

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    activeServiceName,
    activeServiceColor,
  } = usePlayerStore()

  const color = activeServiceColor || '#fc3c44'

  return (
    <div className="playerbar">
      {/* Izquierda: Artwork + Info */}
      <div className="playerbar-left">
        <div className="playerbar-artwork-wrapper">
          {currentTrack?.artwork ? (
            <img
              src={currentTrack.artwork}
              className={`playerbar-artwork ${isPlaying ? 'spinning' : ''}`}
              alt="artwork"
            />
          ) : (
            <div className="playerbar-artwork-placeholder">
              <Music size={18} />
            </div>
          )}
          {isPlaying && (
            <div className="artwork-glow" style={{ '--glow-color': color }} />
          )}
        </div>
        <div className="playerbar-info">
          <p className="playerbar-title">{currentTrack?.title ?? 'Sin reproduccion'}</p>
          <p className="playerbar-subtitle">
            {[currentTrack?.artist, currentTrack?.album].filter(Boolean).join(' • ') || '—'}
          </p>
        </div>
      </div>

      {/* Centro: Visualizador */}
      <div className="playerbar-center">
        <AudioVisualizer isPlaying={isPlaying} color={color} />
      </div>

      {/* Derecha: Volumen + Badge */}
      <div className="playerbar-right">
        <VolumeControl color={color} />
        {activeServiceName && (
          <div className="service-badge" style={{ '--svc-color': color }}>
            <span className={`service-badge-dot ${isPlaying ? 'pulsing' : ''}`} />
            {activeServiceName}
          </div>
        )}
      </div>
    </div>
  )
}
