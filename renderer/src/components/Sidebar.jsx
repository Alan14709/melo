import React from 'react'
import { Music2, SlidersHorizontal, BarChart2, PictureInPicture } from 'lucide-react'
import { SERVICES } from '../../../services/registry'
import { usePlayerStore } from '../store/usePlayerStore'

export default function Sidebar() {
  const activeServiceId = usePlayerStore((s) => s.activeServiceId)
  const currentView = usePlayerStore((s) => s.currentView)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setActiveService = usePlayerStore((s) => s.setActiveService)
  const setView = usePlayerStore((s) => s.setView)

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
      <section className="sidebar-section sidebar-services-block">
        <h3><Music2 size={14} /> Servicios</h3>
        <div className="sidebar-list">
          {list.map((service, index) => (
            <button
              key={service.id}
              className={`service-item sidebar-service-item sidebar-item-enter ${activeServiceId === service.id ? 'active' : ''}`}
              style={{ '--service-color': service.color, animationDelay: `${index * 40}ms` }}
              onClick={() => handleServiceClick(service)}
              title={service.name}
            >
              <span className={`service-dot ${isPlaying && activeServiceId === service.id ? 'playing' : ''}`} />
              <span>{service.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-section sidebar-settings-block">
        <h3><SlidersHorizontal size={14} /> Ajustes</h3>
      </section>

      <div className="sidebar-separator" />

      <div className="sidebar-section sidebar-melo-block">
        <p className="sidebar-section-label">Melo</p>
        <button
          className={`service-item sidebar-service-item sidebar-melo-item sidebar-item-enter ${currentView === 'stats' ? 'active' : ''}`}
          style={{ animationDelay: `${list.length * 40}ms` }}
          onClick={() => setView('stats')}
        >
          <BarChart2 size={16} />
          <span>Estadisticas</span>
          <span className="version-badge">v0.5</span>
        </button>
        <button
          className="service-item sidebar-service-item sidebar-melo-item sidebar-item-enter"
          style={{ animationDelay: `${(list.length + 1) * 40}ms` }}
          onClick={() => window.melo.miniToggle()}
        >
          <PictureInPicture size={16} />
          <span>Mini Player</span>
        </button>
      </div>
    </aside>
  )
}
