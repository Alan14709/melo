import React, { useEffect, useState } from 'react'
import { SERVICES } from '../../../services/registry'
import ServiceCard from './ServiceCard.jsx'
import { usePlayerStore } from '../store/usePlayerStore'

export default function ServicePicker({ onSelect }) {
  const [connectedIds, setConnectedIds] = useState([])
  const setConnectedServices = usePlayerStore((s) => s.setConnectedServices)
  const services = Object.values(SERVICES)

  useEffect(() => {
    window.melo.getConnectedServices()
      .then((ids) => {
        const normalized = Array.isArray(ids) ? ids : []
        setConnectedIds(normalized)
        setConnectedServices(normalized)
      })
      .catch(() => {})
  }, [setConnectedServices])

  return (
    <main className="picker-screen">
      <h1 className="picker-logo">melo</h1>
      <p className="picker-tagline">tu musica, sin limites</p>
      <section className="picker-grid">
        {services.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            onClick={() => onSelect(service)}
            delayMs={index * 70}
            isConnected={connectedIds.includes(service.id)}
          />
        ))}
      </section>
    </main>
  )
}
