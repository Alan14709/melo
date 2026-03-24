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
    <div className="service-picker drag-region">
      <div className="picker-window-controls no-drag">
        <button
          className="window-btn window-btn-close"
          onClick={() => window.melo.windowAction('close')}
        />
        <button
          className="window-btn window-btn-minimize"
          onClick={() => window.melo.windowAction('minimize')}
        />
        <button
          className="window-btn window-btn-maximize"
          onClick={() => window.melo.windowAction('maximize-toggle')}
        />
      </div>

      <div className="picker-header no-drag">
        <h1 className="melo-logo">melo</h1>
        <p className="melo-tagline">tu musica, sin limites</p>
      </div>

      <div className="services-grid no-drag">
        {services.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            onClick={() => onSelect(service)}
            delayMs={index * 70}
            isConnected={connectedIds.includes(service.id)}
          />
        ))}
      </div>
    </div>
  )
}
