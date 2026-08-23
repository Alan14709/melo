import React, { memo } from 'react'
import { Settings, Music2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { usePlayerStore } from '../store/usePlayerStore'
import WindowControls from './WindowControls.jsx'

function TopBar({ onSettingsOpen, immersive = false, onExitImmersive }) {
  // Selector: sin el, usePlayerStore() suscribia la barra a todo el store y el
  // memo() de abajo no servia de nada.
  const { currentTrack, isPlaying } = usePlayerStore(
    useShallow((s) => ({ currentTrack: s.currentTrack, isPlaying: s.isPlaying }))
  )

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
            <Music2 size={14} aria-hidden="true" />
          </div>
        )}
        <div className="topbar-track-info topbar-info">
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
          aria-label="Abrir ajustes"
          title="Ajustes"
        >
          <Settings size={14} aria-hidden="true" />
        </button>

        <WindowControls className="topbar-window-controls" />
      </div>
    </div>
  )
}

export default memo(TopBar)
