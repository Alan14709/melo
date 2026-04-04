import { useState, useEffect } from 'react'
import { Clock, Music, Headphones, BarChart2, Calendar, TrendingUp } from 'lucide-react'

function StatCard({ icon: Icon, value, label, color, style }) {
  return (
    <div className="stat-card" style={style}>
      <div className="stat-card-icon" style={{ color: color || 'var(--accent)' }}>
        <Icon size={18} />
      </div>
      <p className="stat-card-value">{value}</p>
      <p className="stat-card-label">{label}</p>
    </div>
  )
}

function TopBar({ name, count, max, color }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="top-bar-item">
      <span className="top-bar-name">{name}</span>
      <div className="top-bar-track">
        <div
          className="top-bar-fill"
          style={{ width: pct + '%', background: color }}
        />
      </div>
      <span className="top-bar-count">{count}</span>
    </div>
  )
}

function ActivityGrid({ activityMap = {} }) {
  const weeks = []
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 364)

  let current = new Date(start)
  current.setDate(current.getDate() - current.getDay())

  const maxCount = Math.max(1, ...Object.values(activityMap))

  for (let w = 0; w < 53; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const dateStr = current.toISOString().split('T')[0]
      const count = activityMap[dateStr] || 0
      const intensity = count === 0 ? 0 : Math.ceil((count / maxCount) * 4)
      week.push({ date: dateStr, count, intensity })
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
  }

  return (
    <div className="activity-grid-wrapper">
      <div className="activity-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="activity-week">
            {week.map((day, di) => (
              <div
                key={di}
                className={'activity-day intensity-' + day.intensity}
                title={day.count > 0 ? `${day.date}: ${day.count} canciones` : day.date}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="activity-legend">
        <span>Menos</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={'activity-day intensity-' + i} />
        ))}
        <span>Mas</span>
      </div>
    </div>
  )
}

const PERIODS = [
  { label: 'Hoy', days: 1 },
  { label: 'Semana', days: 7 },
  { label: 'Mes', days: 30 },
  { label: 'Año', days: 365 },
  { label: 'Todo', days: 0 },
]

export default function StatsView() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('Todo')

  const loadSummary = async (periodLabel) => {
    const selected = PERIODS.find((p) => p.label === periodLabel)
    if (!selected || selected.days === 0) {
      const data = await window.melo.stats.getSummary()
      setSummary(data)
      return
    }

    const now = Date.now()
    const from = now - selected.days * 24 * 3600 * 1000
    const data = await window.melo.stats.getWrapped({ from, to: now })
    setSummary(data?.summary || null)
  }

  useEffect(() => {
    loadSummary('Todo')
      .then(() => setLoading(false))
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    loadSummary(period).catch(() => {})
  }, [period, loading])

  const handleExport = async () => {
    const data = await window.melo.stats.export()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `melo-stats-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="stats-loading">
        <BarChart2 size={32} style={{ opacity: 0.3 }} />
        <p>Cargando estadisticas...</p>
      </div>
    )
  }

  if (!summary || summary.totalPlays === 0) {
    return (
      <div className="stats-empty">
        <Headphones size={48} style={{ opacity: 0.2 }} />
        <p>Aun no hay estadisticas</p>
        <span>Escucha musica para ver tus datos aqui</span>
      </div>
    )
  }

  const fmtTime = (h, m) => {
    if (h > 0) return `${h}h ${m}m`
    return `${m} min`
  }

  const fmtHour = (h) => {
    if (h === 0) return '12am'
    if (h < 12) return `${h}am`
    if (h === 12) return '12pm'
    return `${h - 12}pm`
  }

  const maxArtist = summary.topArtists?.[0]?.count || 1
  const maxTrack = summary.topTracks?.[0]?.count || 1
  const statCards = [
    {
      icon: Music,
      value: summary.totalPlays.toLocaleString(),
      label: 'canciones',
      color: 'var(--accent)',
    },
    {
      icon: Clock,
      value: fmtTime(summary.totalHours, summary.totalMinutes),
      label: 'escuchadas',
      color: '#30d158',
    },
    {
      icon: Calendar,
      value: summary.uniqueDays,
      label: 'dias activos',
      color: '#0a84ff',
    },
    {
      icon: TrendingUp,
      value: fmtHour(summary.peakHour),
      label: 'hora pico',
      color: '#ff9f0a',
    },
  ]

  return (
    <div className="stats-view">
      <div className="stats-header">
        <div>
          <h2 className="stats-title">Tus estadisticas</h2>
          <p className="stats-subtitle">
            Desde{' '}
            {summary.firstPlay
              ? new Date(summary.firstPlay).toLocaleDateString('es', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
              : '—'}
          </p>
        </div>
        <button className="stats-export-btn" onClick={handleExport}>
          Exportar datos
        </button>
      </div>

      <div className="period-filter">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            className={'period-btn ' + (period === p.label ? 'active' : '')}
            onClick={() => setPeriod(p.label)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="stat-cards-grid">
        {statCards.map((card, index) => (
          <StatCard
            key={card.label}
            icon={card.icon}
            value={card.value}
            label={card.label}
            color={card.color}
            style={{ animationDelay: `${index * 80}ms` }}
          />
        ))}
      </div>

      <div className="stats-section">
        <h3 className="stats-section-title">Tiempo por servicio</h3>
        <div className="service-time-list">
          {(summary.serviceStats || []).map((svc) => (
            <div key={svc.id} className="service-time-item">
              <div className="service-time-header">
                <span className="service-time-dot" style={{ background: svc.color }} />
                <span className="service-time-name">{svc.name}</span>
                <span className="service-time-value">{fmtTime(svc.hours, svc.minutes)}</span>
                <span className="service-time-pct">{svc.percent}%</span>
              </div>
              <div className="service-time-bar-track">
                <div
                  className="service-time-bar-fill"
                  style={{ width: svc.percent + '%', background: svc.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-two-col">
        <div className="stats-section">
          <h3 className="stats-section-title">Top artistas</h3>
          <div className="top-list">
            {(summary.topArtists || []).map((a, i) => (
              <TopBar
                key={i}
                name={a.name}
                count={a.count}
                max={maxArtist}
                color="var(--accent)"
              />
            ))}
          </div>
        </div>

        <div className="stats-section">
          <h3 className="stats-section-title">Top canciones</h3>
          <div className="top-list">
            {(summary.topTracks || []).map((t, i) => (
              <TopBar
                key={i}
                name={t.title}
                count={t.count}
                max={maxTrack}
                color="var(--accent)"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="stats-section">
        <h3 className="stats-section-title">Actividad del año</h3>
        <ActivityGrid activityMap={summary.activityMap || {}} />
      </div>
    </div>
  )
}
