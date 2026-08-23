import React, { useEffect, useMemo, useState } from 'react'
import { SERVICES } from '../../../services/registry'
import ServiceCard from './ServiceCard.jsx'
import WindowControls from './WindowControls.jsx'
import { usePlayerStore } from '../store/usePlayerStore'
import { useToast } from '../hooks/useToast'

export default function ServicePicker({ onSelect }) {
  const [connectedIds, setConnectedIds] = useState([])
  const setConnectedServices = usePlayerStore((s) => s.setConnectedServices)
  const { error: showError } = useToast()

  // Los servicios con sesion abierta van primero: son los unicos que el usuario
  // puede abrir sin volver a iniciar sesion.
  const services = useMemo(() => {
    const all = Object.values(SERVICES)
    if (connectedIds.length === 0) return all
    return [...all].sort((a, b) => {
      const aConnected = connectedIds.includes(a.id) ? 0 : 1
      const bConnected = connectedIds.includes(b.id) ? 0 : 1
      return aConnected - bConnected
    })
  }, [connectedIds])

  useEffect(() => {
    window.melo.getConnectedServices()
      .then((ids) => {
        const normalized = Array.isArray(ids) ? ids : []
        setConnectedIds(normalized)
        setConnectedServices(normalized)
      })
      .catch(() => {
        // Antes era un catch vacio: el usuario veia todo como desconectado
        // sin saber por que.
        showError('No se pudieron leer tus sesiones guardadas.')
      })
  }, [setConnectedServices, showError])

  return (
    <div className="service-picker drag-region">
      <WindowControls className="picker-window-controls" />

      <div className="picker-header no-drag">
        <h1 className="melo-logo">melo</h1>
        <p className="melo-tagline">tu música, sin límites.</p>
        <p className="picker-hint">Elige un servicio para empezar</p>
      </div>

      <div className="services-grid no-drag">
        {services.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            onClick={() => onSelect(service)}
            delayMs={index * 70}
            className="animate-spring-in"
            style={{ animationDelay: `${index * 60}ms` }}
            isConnected={connectedIds.includes(service.id)}
            autoFocus={index === 0 && connectedIds.includes(service.id)}
          />
        ))}
      </div>

      <p className="picker-footer no-drag">
        Conecta cualquier servicio · cambia en cualquier momento
      </p>
    </div>
  )
}
