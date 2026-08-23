import React, { memo, useEffect, useRef, useState } from 'react'
import { Cpu, MemoryStick, Layers, Timer, AlertTriangle } from 'lucide-react'

/**
 * Monitor de recursos.
 *
 * `app.getAppMetrics()` ya desglosaba CPU y memoria por proceso, pero nada lo
 * mostraba. Como Electron pone cada BrowserView en su propio proceso, main
 * traduce PID a servicio y aquí se puede ver qué servicio pesa más.
 *
 * El polling solo corre mientras el panel está montado y visible.
 */

const POLL_MS = 2000
const HISTORY_POINTS = 40

function fmtUptime(ms) {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  return `${hours} h ${minutes} min`
}

function fmtMemory(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${Math.round(mb)} MB`
}

/** Sparkline en SVG, sin librería. */
const Sparkline = memo(function Sparkline({ values, color, label }) {
  if (values.length < 2) {
    return <div className="rm-spark rm-spark-empty" aria-hidden="true" />
  }

  // Escala con holgura entre el minimo y el maximo de la serie. Escalar solo
  // contra el maximo hacia y=0 dejaba la linea pegada al borde superior y el
  // area rellenando la tarjeta entera, que se leia como una barra solida —
  // sobre todo con una serie plana, que es lo normal en reposo.
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min
  const isFlat = range < 0.001

  const scaleMin = isFlat ? 0 : Math.max(0, min - range * 0.2)
  const scaleMax = isFlat ? Math.max(max * 2, 1) : max + range * 0.2
  const span = scaleMax - scaleMin || 1

  const width = 100
  const height = 26
  const step = width / (values.length - 1)
  const yFor = (v) => (height - ((v - scaleMin) / span) * height).toFixed(2)

  const points = values.map((v, i) => `${(i * step).toFixed(2)},${yFor(v)}`)
  const line = points.join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  const lastValue = values[values.length - 1]

  return (
    <svg
      className="rm-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${Math.round(lastValue)}, máximo ${Math.round(max)}`}
    >
      <polygon points={area} fill={color} opacity="0.14" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
})

function MetricTile({ icon: Icon, value, unit, label, color, history, historyLabel }) {
  return (
    <div className="rm-tile">
      <div className="rm-tile-head">
        <Icon size={13} style={{ color }} aria-hidden="true" />
        <span className="rm-tile-label">{label}</span>
      </div>
      <p className="rm-tile-value" style={{ color }}>
        {value}
        {unit && <span className="rm-tile-unit">{unit}</span>}
      </p>
      {history && <Sparkline values={history} color={color} label={historyLabel || label} />}
    </div>
  )
}

export default function ResourceMonitor({ isVisible = true }) {
  const [usage, setUsage] = useState(null)
  const [diagnostics, setDiagnostics] = useState(null)
  const [error, setError] = useState(false)
  const cpuHistory = useRef([])
  const memHistory = useRef([])

  useEffect(() => {
    if (!isVisible) return undefined

    let cancelled = false

    const poll = async () => {
      if (document.hidden) return
      try {
        const data = await window.melo.system.getResourceUsage()
        if (cancelled || !data) return

        cpuHistory.current = [...cpuHistory.current, data.totals.cpuPercent].slice(-HISTORY_POINTS)
        memHistory.current = [...memHistory.current, data.totals.memoryMb].slice(-HISTORY_POINTS)

        setUsage(data)
        setError(false)
      } catch (_) {
        if (!cancelled) setError(true)
      }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)

    window.melo.system.getDiagnostics()
      .then((data) => { if (!cancelled) setDiagnostics(data) })
      .catch(() => {})

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isVisible])

  if (error) {
    return (
      <div className="rm-empty">
        <AlertTriangle size={20} aria-hidden="true" />
        <p>No se pudieron leer las métricas del sistema.</p>
      </div>
    )
  }

  if (!usage) {
    return <div className="rm-empty"><p>Midiendo…</p></div>
  }

  const { totals, heaviestService, processes } = usage
  const maxMemory = Math.max(...processes.map((p) => p.memoryMb), 1)

  return (
    <div className="rm-root">
      <div className="rm-tiles">
        <MetricTile
          icon={Cpu}
          value={totals.cpuPercent.toFixed(1)}
          unit="%"
          label="CPU"
          color="#ff9f0a"
          history={cpuHistory.current}
          historyLabel="Uso de CPU"
        />
        <MetricTile
          icon={MemoryStick}
          value={fmtMemory(totals.memoryMb)}
          label="Memoria"
          color="#0a84ff"
          history={memHistory.current}
          historyLabel="Uso de memoria"
        />
        <MetricTile
          icon={Layers}
          value={totals.processCount}
          label="Procesos"
          color="#30d158"
        />
        <MetricTile
          icon={Timer}
          value={fmtUptime(usage.uptimeMs)}
          label="En marcha"
          color="var(--text-secondary)"
        />
      </div>

      {heaviestService && (
        <div className="rm-heaviest" style={{ '--rm-service-color': heaviestService.color }}>
          <span className="rm-heaviest-dot" aria-hidden="true" />
          <div className="rm-heaviest-body">
            <p className="rm-heaviest-title">
              <strong>{heaviestService.label}</strong> es el servicio que más consume
            </p>
            <p className="rm-heaviest-sub">
              {fmtMemory(heaviestService.memoryMb)} · {heaviestService.sharePct}% de la memoria de Melo
              {heaviestService.cpuPercent > 0 && ` · ${heaviestService.cpuPercent.toFixed(1)}% CPU`}
            </p>
          </div>
        </div>
      )}

      <div className="rm-section">
        <h4 className="rm-section-title">Desglose por proceso</h4>
        <ul className="rm-process-list">
          {processes.map((proc) => (
            <li
              key={proc.pid}
              className={`rm-process ${proc.serviceId ? 'is-service' : ''} ${proc.isActiveService ? 'is-active' : ''}`}
            >
              <span
                className="rm-process-dot"
                style={{ background: proc.color || 'var(--text-quaternary, #666)' }}
                aria-hidden="true"
              />
              <span className="rm-process-label">
                <span className="rm-process-name" title={proc.label}>{proc.label}</span>
                {proc.isActiveService && <span className="rm-process-badge">activo</span>}
              </span>
              <span className="rm-process-stats">
                <span className="rm-process-cpu">{proc.cpuPercent.toFixed(1)}%</span>
                <span className="rm-process-mem">{fmtMemory(proc.memoryMb)}</span>
              </span>
              <span className="rm-process-bar" aria-hidden="true">
                <span
                  className="rm-process-bar-fill"
                  style={{
                    width: `${(proc.memoryMb / maxMemory) * 100}%`,
                    background: proc.color || 'var(--text-tertiary, #888)',
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>

      {diagnostics && (
        <div className="rm-section">
          <h4 className="rm-section-title">Diagnóstico</h4>
          <dl className="rm-diag">
            <div><dt>Vistas abiertas</dt><dd>{diagnostics.viewCount}</dd></div>
            <div><dt>Cola de cambios</dt><dd>{diagnostics.queueLength}</dd></div>
            <div>
              <dt>Latencia media de cambio</dt>
              <dd>{diagnostics.performance?.avgSwitchLatencyMs != null
                ? `${diagnostics.performance.avgSwitchLatencyMs} ms`
                : '—'}</dd>
            </div>
            <div>
              <dt>Arranque</dt>
              <dd>{diagnostics.performance?.startupDurationMs
                ? `${Math.round(diagnostics.performance.startupDurationMs)} ms`
                : '—'}</dd>
            </div>
            <div>
              <dt>Vistas fantasma</dt>
              <dd className={diagnostics.ghostViewViolations > 0 ? 'rm-diag-warn' : ''}>
                {diagnostics.ghostViewViolations}
              </dd>
            </div>
            <div><dt>Cargas canceladas</dt><dd>{diagnostics.loadCancelled}</dd></div>
            <div>
              <dt>Fallbacks de GPU</dt>
              <dd>{diagnostics.fallbackMetrics?.gpuFallbacksTriggered ?? 0}</dd>
            </div>
            <div>
              <dt>Reintentos</dt>
              <dd>{diagnostics.retryMetrics?.totalRetries ?? 0}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
