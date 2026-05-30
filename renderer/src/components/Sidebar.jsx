import React from 'react'
import { Music2, BarChart2, PictureInPicture, Focus } from 'lucide-react'
import { SERVICES } from '../../../services/registry'
import { usePlayerStore } from '../store/usePlayerStore'

export default function Sidebar() {
  const activeServiceId = usePlayerStore((s) => s.activeServiceId)
  const currentView = usePlayerStore((s) => s.currentView)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const focusMode = usePlayerStore((s) => s.focusMode)
  const setActiveService = usePlayerStore((s) => s.setActiveService)
  const setView = usePlayerStore((s) => s.setView)
  const setFocusMode = usePlayerStore((s) => s.setFocusMode)

  const list = Object.values(SERVICES)

  const handleServiceClick = (service) => {
    if (service.id === activeServiceId) {
      if (currentView === 'stats') setView('player')
      return
    }
    window.melo.switchService(service.id, service.url, service)
    setActiveService(service.id, service.color, service.name)
    setView('player')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <p className="sidebar-section-label">
          <Music2 size={10} style={{ display: 'inline', marginRight: 4 }} />
          Servicios
        </p>
        <div className="sidebar-list">
          {list.map((service, index) => (
            <button
              key={service.id}
              className={`sidebar-service-item sidebar-item-enter ${activeServiceId === service.id ? 'active' : ''}`}
              style={{ '--service-color': service.color, animationDelay: `${index * 40}ms` }}
              onClick={() => handleServiceClick(service)}
              title={service.name}
            >
              <span
                className={`service-dot ${isPlaying && activeServiceId === service.id ? 'playing' : ''}`}
              />
              <span className="sidebar-item-label">{service.name}</span>
              {activeServiceId === service.id && isPlaying && (
                <span className="sidebar-now-playing-pip" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-section">
        <p className="sidebar-section-label">Melo</p>
        <div className="sidebar-list">
          <button
            className={`sidebar-melo-item sidebar-item-enter ${currentView === 'stats' ? 'active' : ''}`}
            style={{ animationDelay: `${list.length * 40}ms` }}
            onClick={() => setView('stats')}
          >
            <BarChart2 size={14} className="sidebar-item-icon" />
            <span className="sidebar-item-label">Estadísticas</span>
          </button>
          <button
            className="sidebar-melo-item sidebar-item-enter"
            style={{ animationDelay: `${(list.length + 1) * 40}ms` }}
            onClick={() => window.melo.miniToggle()}
          >
            <PictureInPicture size={14} className="sidebar-item-icon" />
            <span className="sidebar-item-label">Mini Player</span>
          </button>
          <button
            className={`sidebar-melo-item sidebar-item-enter ${focusMode ? 'active focus-active' : ''}`}
            style={{ animationDelay: `${(list.length + 2) * 40}ms` }}
            onClick={() => setFocusMode(!focusMode)}
            title={focusMode ? 'Salir de Focus Mode' : 'Activar Focus Mode'}
          >
            <Focus size={14} className="sidebar-item-icon" />
            <span className="sidebar-item-label">Focus</span>
            {focusMode && <span className="sidebar-focus-badge">ON</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}
