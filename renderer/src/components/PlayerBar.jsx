import React, { memo, useEffect, useRef, useState } from 'react'
import { Music, Volume2, VolumeX, Volume1 } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'
import { Slider } from './Slider.jsx'

const AudioVisualizer = memo(function AudioVisualizer({ isPlaying, color }) {
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
})

const VolumeControl = memo(function VolumeControl({ color }) {
  const { volumeLevel, setVolumeLevel } = usePlayerStore()
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const prevVol = useRef(1)

  useEffect(() => {
    setVolume(volumeLevel)
    setMuted(volumeLevel === 0)
  }, [volumeLevel])

  const updateVolume = (val) => {
    setVolume(val)
    setVolumeLevel(val)
    window.melo.setVolume(val)
    window.melo.saveSettings('volumeLevel', val).catch(() => {})
  }

  const handleMute = () => {
    if (muted) {
      updateVolume(prevVol.current || 1)
      setMuted(false)
    } else {
      prevVol.current = volume
      updateVolume(0)
      setMuted(true)
    }
  }

  const Icon = muted || volume === 0
    ? VolumeX
    : volume < 0.5
      ? Volume1
      : Volume2

  return (
    <div className="volume-control no-drag">
      <button
        className="volume-btn"
        onClick={handleMute}
        title={muted ? 'Activar sonido' : 'Silenciar'}
      >
        <Icon size={14} />
      </button>
      <Slider
        value={muted ? 0 : volume}
        color={color}
        className="volume-slider-component"
        onChange={(val) => {
          updateVolume(val)
          setMuted(val === 0)
        }}
        formatTooltip={(val) => Math.round(val * 100) + '%'}
      />
    </div>
  )
})

function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    activeServiceName,
    activeServiceColor,
  } = usePlayerStore()

  const color = activeServiceColor || '#fc3c44'

  return (
    <div className="playerbar">
      <div className="playerbar-left">
        <div className="playerbar-artwork-wrapper">
          {currentTrack?.artwork ? (
            <img
              src={currentTrack.artwork}
              className={`playerbar-artwork ${currentTrack?.title && isPlaying ? 'spinning' : ''}`}
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
        <div className="playerbar-info animate-fade-in" key={currentTrack?.title || 'no-track'}>
          <p className="playerbar-title">{currentTrack?.title ?? 'Sin reproduccion'}</p>
          <p className="playerbar-subtitle">
            {[currentTrack?.artist, currentTrack?.album].filter(Boolean).join(' • ') || '—'}
          </p>
        </div>
      </div>

      <div className="playerbar-center">
        <div className="playerbar-center-stack">
          <AudioVisualizer isPlaying={isPlaying} color={color} />
        </div>
      </div>

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

export default memo(PlayerBar)
