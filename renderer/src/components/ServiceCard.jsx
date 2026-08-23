import React from 'react'
import {
  Music,
  Headphones,
  PlayCircle,
  Waves,
  Radio,
} from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'

const ICONS = {
  music: Music,
  headphones: Headphones,
  'play-circle': PlayCircle,
  waves: Waves,
  radio: Radio,
}

export default function ServiceCard({ service, onClick, delayMs = 0, isConnected, className = '', style = {}, autoFocus = false }) {
  const connectedServices = usePlayerStore((s) => s.connectedServices)
  const Icon = ICONS[service.icon] || Music
  const connected = typeof isConnected === 'boolean'
    ? isConnected
    : connectedServices.includes(service.id)

  return (
    <button
      className={`service-card no-drag ${className}`.trim()}
      onClick={onClick}
      autoFocus={autoFocus}
      style={{ '--service-color': service.color, animationDelay: `${delayMs}ms`, ...style }}
    >
      <Icon size={40} color={service.color} aria-hidden="true" />
      <p>{service.name}</p>
      {connected && <span className="badge-connected">Conectado</span>}
    </button>
  )
}
