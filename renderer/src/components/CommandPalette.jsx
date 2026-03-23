import React from 'react'
import { usePlayerStore } from '../store/usePlayerStore'

export default function CommandPalette({ isOpen, onClose }) {
  const setSettingsOpen = usePlayerStore((s) => s.setSettingsOpen)
  const setMiniPlayerOpen = usePlayerStore((s) => s.setMiniPlayerOpen)

  if (!isOpen) return null

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <p className="cmdk-title">Command Palette</p>
        <button onClick={() => { setSettingsOpen(true); onClose() }}>Abrir ajustes</button>
        <button onClick={() => { setMiniPlayerOpen(true); onClose() }}>Abrir mini player</button>
        <button onClick={() => { window.melo.playerAction('play'); onClose() }}>Play / Pause</button>
      </div>
    </div>
  )
}
