import React, { memo } from 'react'
import { Minus, Square, X, Settings, Music2 } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'

function TopBar({ onSettingsOpen, immersive = false, onExitImmersive }) {
  const { currentTrack, isPlaying } = usePlayerStore()

  return (
    <div className="topbar drag-region">
      <div className="topbar-left">
        {currentTrack?.artwork ? (
          <img
            src={currentTrack.artwork}
            className={`topbar-artwork ${isPlaying ? 'spinning' : ''}`}
            alt=""
          />
        ) : (
          <div className="topbar-artwork placeholder">
            <Music2 size={14} />
          </div>
        )}
        <div className="topbar-track-info">
          <span className="topbar-title">{currentTrack?.title ?? 'Melo'}</span>
          {currentTrack?.artist && (
            <span className="topbar-artist">{currentTrack.artist}</span>
          )}
        </div>
      </div>

      <div className="topbar-right no-drag">
        {immersive && (
          <button
            className="topbar-icon-btn immersive-topbar-exit"
            onClick={onExitImmersive}
            title="Salir modo inmersivo"
          >
            Salir
          </button>
        )}

        <button
          className="topbar-icon-btn"
          onClick={onSettingsOpen}
          title="Ajustes"
        >
          <Settings size={14} />
        </button>

        <div className="topbar-window-controls">
          <button
            className="topbar-icon-btn"
            onClick={() => window.melo.windowAction('minimize')}
          >
            <Minus size={12} />
          </button>
          <button
            className="topbar-icon-btn"
            onClick={() => window.melo.windowAction('maximize-toggle')}
          >
            <Square size={11} />
          </button>
          <button
            className="topbar-icon-btn topbar-close"
            onClick={() => window.melo.windowAction('close')}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(TopBar)
