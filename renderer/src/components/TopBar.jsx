import React from 'react'
import { Minus, Square, X, Settings, PictureInPicture, Music2 } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'

export default function TopBar({ onSettingsOpen }) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const activeServiceColor = usePlayerStore((s) => s.activeServiceColor)
  const isLongTitle = (currentTrack?.title || '').length > 34

  return (
    <header
      className="topbar drag-region"
      style={{
        background: `linear-gradient(90deg, color-mix(in srgb, ${activeServiceColor} 14%, var(--bg-topbar)), var(--bg-topbar))`
      }}
    >
      <div className="topbar-actions no-drag">
        <button className="window-btn" onClick={() => window.melo.windowAction('minimize')}>
          <Minus size={14} />
        </button>
        <button className="window-btn" onClick={() => window.melo.windowAction('maximize-toggle')}>
          <Square size={12} />
        </button>
        <button className="window-btn close" onClick={() => window.melo.windowAction('close')}>
          <X size={14} />
        </button>
      </div>

      <div className="topbar-track">
        {currentTrack?.artwork ? (
          <img
            src={currentTrack.artwork}
            alt="artwork"
            className={`topbar-artwork ${isPlaying ? 'artwork-spinning' : ''}`}
          />
        ) : (
          <div className="topbar-artwork placeholder">
            <Music2 size={14} />
          </div>
        )}
        <div className="topbar-text">
          <p className={`title ${isLongTitle ? 'marquee' : ''}`}>{currentTrack?.title || 'Sin reproduccion'}</p>
          <p className="artist">{currentTrack?.artist || 'Selecciona un servicio'}</p>
        </div>
      </div>

      <div className="topbar-right no-drag">
        <button
          className="icon-btn topbar-btn"
          onClick={() => window.melo.miniToggle()}
          title="Mini Player (Ctrl+Shift+M)"
        >
          <PictureInPicture size={14} />
        </button>
        <button className="icon-btn" onClick={onSettingsOpen}>
          <Settings size={16} />
        </button>
      </div>
    </header>
  )
}
