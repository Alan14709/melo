import React, { memo, useEffect, useRef, useState } from 'react'
import { Music, Volume2, VolumeX, Volume1 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { usePlayerStore } from '../store/usePlayerStore'
import { Slider } from './Slider.jsx'
import NowPlayingContext from './NowPlayingContext.jsx'
import TrackSearchMenu, { useNowPlayingMenu } from './TrackSearchMenu.jsx'

const AudioVisualizer = memo(function AudioVisualizer({ isPlaying, color }) {
  const BARS = 14
  return (
    <div className="visualizer" style={{ '--bar-color': color }} aria-hidden="true">
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
  const volumeLevel = usePlayerStore((s) => s.volumeLevel)
  const setVolumeLevel = usePlayerStore((s) => s.setVolumeLevel)
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
        aria-label={muted ? 'Activar sonido' : 'Silenciar'}
        title={muted ? 'Activar sonido' : 'Silenciar'}
      >
        <Icon size={14} aria-hidden="true" />
      </button>
      <Slider
        value={muted ? 0 : volume}
        color={color}
        className="volume-slider-component"
        ariaLabel="Volumen"
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
  // Selectores atomicos: sin esto, cualquier cambio del store (volumen, ajustes,
  // vista activa) re-renderizaba toda la barra y anulaba el memo() de abajo.
  const { currentTrack, isPlaying, activeServiceName, activeServiceColor } = usePlayerStore(
    useShallow((s) => ({
      currentTrack: s.currentTrack,
      isPlaying: s.isPlaying,
      activeServiceName: s.activeServiceName,
      activeServiceColor: s.activeServiceColor,
    }))
  )

  const color = activeServiceColor || '#fc3c44'
  const hasTrack = Boolean(currentTrack?.title)
  const openNowPlayingMenu = useNowPlayingMenu(currentTrack?.title, currentTrack?.artist)

  return (
    <div className="playerbar">
      <div
        className="playerbar-left"
        onContextMenu={hasTrack ? openNowPlayingMenu : undefined}
      >
        <div className="playerbar-artwork-wrapper">
          {currentTrack?.artwork ? (
            <img
              src={currentTrack.artwork}
              className={`playerbar-artwork ${hasTrack && isPlaying ? 'spinning' : ''}`}
              alt=""
            />
          ) : (
            <div className="playerbar-artwork-placeholder">
              <Music size={18} aria-hidden="true" />
            </div>
          )}
          {isPlaying && (
            <div className="artwork-glow" style={{ '--glow-color': color }} />
          )}
        </div>
        <div className="playerbar-info" key={currentTrack?.title}>
          <div className="playerbar-title-row">
            <p className="playerbar-title">{currentTrack?.title ?? 'Sin reproducción'}</p>
            {hasTrack && (
              <TrackSearchMenu title={currentTrack.title} artist={currentTrack.artist} />
            )}
          </div>
          <p className="playerbar-subtitle">
            {[currentTrack?.artist, currentTrack?.album].filter(Boolean).join(' • ') || '—'}
          </p>
        </div>
        <AudioVisualizer isPlaying={isPlaying} color={color} />
      </div>

      <div className="playerbar-center">
        <NowPlayingContext
          title={currentTrack?.title}
          artist={currentTrack?.artist}
          hasTrack={hasTrack}
        />
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
