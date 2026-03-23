import React from 'react'
import { Music } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'

function AudioVisualizer({ isPlaying, color }) {
  const bars = 28
  return (
    <div className="visualizer" style={{ '--bar-color': color }}>
      {Array.from({ length: bars }).map((_, i) => (
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

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    activeServiceName,
    activeServiceColor,
  } = usePlayerStore()

  return (
    <div className="playerbar">
      <div className="playerbar-left">
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
        <div className="playerbar-info">
          <p className="playerbar-title">{currentTrack?.title ?? 'Sin reproduccion'}</p>
          <p className="playerbar-subtitle">
            {[currentTrack?.artist, currentTrack?.album].filter(Boolean).join(' • ') || '-'}
          </p>
        </div>
      </div>

      <div className="playerbar-center">
        <AudioVisualizer
          isPlaying={isPlaying}
          color={activeServiceColor || '#fc3c44'}
        />
      </div>

      <div className="playerbar-right">
        {activeServiceName && (
          <div className="service-badge" style={{ '--svc-color': activeServiceColor }}>
            <span className={`service-badge-dot ${isPlaying ? 'pulsing' : ''}`} />
            {activeServiceName}
          </div>
        )}
      </div>
    </div>
  )
}
