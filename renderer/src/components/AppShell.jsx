import React from 'react'
import TopBar from './TopBar.jsx'
import Sidebar from './Sidebar.jsx'
import PlayerBar from './PlayerBar.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import CommandPalette from './CommandPalette.jsx'

/**
 * Chrome comun de las vistas `player` y `stats`.
 *
 * Antes App.jsx repetia este arbol completo en las dos ramas del render, con
 * las mismas props escritas dos veces; cualquier cambio en el shell habia que
 * aplicarlo en ambos sitios. El area central llega por children.
 */
export default function AppShell({
  immersive = false,
  onSettingsOpen,
  onExitImmersive,
  statusSlot = null,
  settingsOpen,
  onSettingsClose,
  commandPaletteOpen,
  onCommandPaletteClose,
  commandActions,
  children,
}) {
  return (
    <div className={`player-layout ${immersive ? 'immersive-mode' : ''}`}>
      <TopBar
        onSettingsOpen={onSettingsOpen}
        immersive={immersive}
        onExitImmersive={onExitImmersive}
      />

      <div className="player-body">
        <div className={`sidebar-shell ${immersive ? 'immersive-hidden' : ''}`}>
          <div className="sidebar-rail">
            <Sidebar />
            <div className="sidebar-status-section" aria-label="Estado y notificaciones">
              {statusSlot}
            </div>
          </div>
        </div>

        {children}
      </div>

      <PlayerBar />

      <SettingsPanel isOpen={settingsOpen} onClose={onSettingsClose} />
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={onCommandPaletteClose}
        actions={commandActions}
      />
    </div>
  )
}
