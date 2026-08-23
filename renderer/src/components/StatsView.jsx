import { useState, useEffect, useMemo, memo } from 'react'
import { Clock, Music, Headphones, BarChart2, Calendar, TrendingUp, Download, Flame, Zap } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'
import { localDayKey, todayKey, shiftDayKey } from '../utils/dateKeys'
import { SERVICES } from '../../../services/registry'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(h, m) {
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

function fmtHour(h) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function peakWeekday(activityMap) {
  const days = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
  const totals = [0, 0, 0, 0, 0, 0, 0]
  Object.entries(activityMap).forEach(([dateStr, count]) => {
    const dow = new Date(dateStr + 'T12:00:00').getDay()
    totals[dow] += count
  })
  const maxIdx = totals.indexOf(Math.max(...totals))
  return totals[maxIdx] > 0 ? days[maxIdx] : null
}

function buildInsights(summary) {
  const insights = []

  const topService = summary.serviceStats?.[0]
  if (topService && topService.percent >= 70) {
    insights.push(`${topService.name} sigue siendo tu hogar — acapara el ${topService.percent}% de tu tiempo.`)
  } else if (topService && summary.serviceStats?.length >= 2) {
    const second = summary.serviceStats[1]
    insights.push(`${topService.name} lidera, pero ${second.name} empieza a entrar.`)
  }

  const activeDay = summary.activityMap ? peakWeekday(summary.activityMap) : null
  if (activeDay) {
    insights.push(`Escuchas más los ${activeDay} — tu día favorito para la música.`)
  }

  if (summary.peakHour !== undefined) {
    const h = summary.peakHour
    const isNight = h >= 20 || h < 4
    const isEvening = h >= 17 && h < 20
    const isMorning = h >= 6 && h < 12
    if (isNight) insights.push(`Tu hora pico es las ${fmtHour(h)} — música de noche larga.`)
    else if (isEvening) insights.push(`Pico a las ${fmtHour(h)} — la hora dorada del trabajo.`)
    else if (isMorning) insights.push(`Comienzas el día con música — pico a las ${fmtHour(h)}.`)
  }

  const topArtist = summary.topArtists?.[0]
  if (topArtist && topArtist.count > 3) {
    insights.push(`${topArtist.name} fue tu artista más escuchado, con ${topArtist.count} reproducciones.`)
  }

  return insights.slice(0, 3)
}

function computeStreak(activityMap = {}) {
  const active = new Set(Object.keys(activityMap).filter((day) => activityMap[day] > 0))
  if (active.size === 0) return { current: 0, longest: 0 }

  // Racha mas larga: recorre los dias activos en orden y corta cuando el salto
  // respecto al anterior no es exactamente de un dia.
  let longest = 0
  let run = 0
  let prev = null
  for (const day of [...active].sort()) {
    run = prev && shiftDayKey(prev, 1) === day ? run + 1 : 1
    if (run > longest) longest = run
    prev = day
  }

  // Racha actual: solo sigue viva si hay escucha hoy o ayer.
  const today = todayKey()
  const yesterday = shiftDayKey(today, -1)
  let cursor = active.has(today) ? today : active.has(yesterday) ? yesterday : null

  let current = 0
  while (cursor && active.has(cursor)) {
    current += 1
    cursor = shiftDayKey(cursor, -1)
  }

  return { current, longest }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const StatsHero = memo(function StatsHero({ summary }) {
  const totalTime = fmtTime(summary.totalHours, summary.totalMinutes)
  const topArtist = summary.topArtists?.[0]?.name
  const topService = summary.serviceStats?.[0]

  return (
    <div className="stats-hero">
      <p className="stats-hero-eyebrow">Tu año en sonido</p>
      <h1 className="stats-hero-headline">
        Escuchaste{' '}
        <span className="stats-hero-accent">{totalTime}</span>
        {topArtist ? <> de {topArtist} y más.</> : <> de música.</>}
      </h1>
      <p className="stats-hero-sub">
        Una temporada construida sobre{' '}
        <strong>{summary.totalPlays.toLocaleString()} canciones</strong>
        {summary.uniqueDays > 0 && (
          <>, repartidas en <strong>{summary.uniqueDays} días</strong> activos</>
        )}.
        {summary.peakHour !== undefined && (
          <> Tu hora pico — siempre las {fmtHour(summary.peakHour)}.</>
        )}
      </p>
      <div className="stats-hero-meta">
        {topService && (
          <span className="stats-hero-chip">
            <span className="stats-hero-chip-dot" style={{ background: topService.color }} />
            {topService.name}
          </span>
        )}
        {summary.firstPlay && (
          <span className="stats-hero-date">
            Desde{' '}
            {new Date(summary.firstPlay).toLocaleDateString('es', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </span>
        )}
      </div>
    </div>
  )
})

const StatCard = memo(function StatCard({ icon: Icon, value, label, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ color: color || 'var(--accent)' }}>
        <Icon size={16} />
      </div>
      <p className="stat-card-value" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </p>
      <p className="stat-card-label">{label}</p>
    </div>
  )
})

function InsightsSection({ insights }) {
  if (!insights.length) return null
  return (
    <div className="stats-insights">
      {insights.map((text, i) => (
        <div key={i} className="stats-insight-item">
          <span className="stats-insight-dot" />
          <span>{text}</span>
        </div>
      ))}
    </div>
  )
}

function TopBar({ name, count, max, color, rank }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="top-bar-item">
      <span className="top-bar-rank">{rank}</span>
      <span className="top-bar-name">{name}</span>
      <div className="top-bar-track">
        <div className="top-bar-fill" style={{ width: pct + '%', background: color || 'var(--accent)' }} />
      </div>
      <span className="top-bar-count">{count}</span>
    </div>
  )
}

const ActivityGrid = memo(function ActivityGrid({ activityMap = {} }) {
  // 371 celdas con su Date: fuera del render para no rehacerlas en cada pintado.
  const weeks = useMemo(() => {
    const cursor = new Date()
    cursor.setHours(12, 0, 0, 0) // mediodia local: inmune a saltos de horario de verano
    cursor.setDate(cursor.getDate() - 364)
    cursor.setDate(cursor.getDate() - cursor.getDay()) // alinear al domingo

    const maxCount = Math.max(1, ...Object.values(activityMap))
    const built = []

    for (let w = 0; w < 53; w++) {
      const week = []
      for (let d = 0; d < 7; d++) {
        const date = localDayKey(cursor)
        const count = activityMap[date] || 0
        week.push({
          date,
          count,
          intensity: count === 0 ? 0 : Math.ceil((count / maxCount) * 4),
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      built.push(week)
    }

    return built
  }, [activityMap])

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
        <span>Más</span>
      </div>
    </div>
  )
})

function StreakCard({ streak }) {
  if (!streak || streak.current === 0) return null
  return (
    <div className="stats-streak-card">
      <div className="stats-streak-icon">
        <Flame size={20} color="#ff9f0a" />
      </div>
      <div className="stats-streak-body">
        <p className="stats-streak-value">{streak.current} días</p>
        <p className="stats-streak-label">racha actual</p>
      </div>
      {streak.longest > streak.current && (
        <div className="stats-streak-best">
          <p className="stats-streak-best-value">{streak.longest}</p>
          <p className="stats-streak-best-label">récord</p>
        </div>
      )}
    </div>
  )
}

function fmtRelative(timestamp) {
  if (!timestamp) return null
  const minutes = Math.round((Date.now() - timestamp) / 60000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return new Date(timestamp).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

// Lee el historial PERSISTIDO de main, no el array en memoria del store: ese
// se vacia en cada arranque y dejaba la seccion siempre vacia al abrir la app.
const RecentlyPlayed = memo(function RecentlyPlayed({ refreshKey }) {
  const [recent, setRecent] = useState([])

  useEffect(() => {
    let cancelled = false

    window.melo.stats.getHistory({ limit: 8 })
      .then((rows) => {
        if (!cancelled) setRecent(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [refreshKey])

  if (recent.length === 0) return null

  return (
    <div className="stats-section">
      <h3 className="stats-section-title">Escuchado recientemente</h3>
      <ol className="recent-list">
        {recent.map((track, i) => {
          const service = SERVICES[track.service]
          return (
            <li key={`${track.playedAt}-${i}`} className="recent-item">
              {track.artwork ? (
                <img className="recent-item-art" src={track.artwork} alt="" loading="lazy" />
              ) : (
                <span className="recent-item-art recent-item-art-empty" aria-hidden="true">
                  <Music size={12} />
                </span>
              )}
              <div className="recent-item-info">
                <p className="recent-item-title">{track.title}</p>
                {track.artist && <p className="recent-item-artist">{track.artist}</p>}
              </div>
              <span className="recent-item-time">{fmtRelative(track.playedAt)}</span>
              {service && (
                <span
                  className="recent-item-dot"
                  style={{ background: service.color }}
                  title={service.name}
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
})

const MeloMonthlyCard = memo(function MeloMonthlyCard({ summary }) {
  const topArtist = summary.topArtists?.[0]
  const topTrack = summary.topTracks?.[0]
  const topService = summary.serviceStats?.[0]
  const totalTime = fmtTime(summary.totalHours, summary.totalMinutes)

  return (
    <div className="melo-monthly-card">
      <div className="melo-monthly-header">
        <Zap size={14} color="var(--accent)" />
        <span className="melo-monthly-title">Melo Monthly</span>
      </div>
      <div className="melo-monthly-grid">
        <div className="melo-monthly-item">
          <p className="melo-monthly-value">{totalTime}</p>
          <p className="melo-monthly-label">escuchadas</p>
        </div>
        {topArtist && (
          <div className="melo-monthly-item">
            <p className="melo-monthly-value melo-monthly-truncate">{topArtist.name}</p>
            <p className="melo-monthly-label">artista top</p>
          </div>
        )}
        {topTrack && (
          <div className="melo-monthly-item">
            <p className="melo-monthly-value melo-monthly-truncate">{topTrack.title}</p>
            <p className="melo-monthly-label">canción top</p>
          </div>
        )}
        {topService && (
          <div className="melo-monthly-item">
            <p className="melo-monthly-value" style={{ color: topService.color }}>{topService.name}</p>
            <p className="melo-monthly-label">servicio top</p>
          </div>
        )}
      </div>
    </div>
  )
})

// ─── Period selector ─────────────────────────────────────────────────────────

const PERIODS = [
  { label: 'Hoy', days: 1 },
  { label: 'Semana', days: 7 },
  { label: 'Mes', days: 30 },
  { label: 'Año', days: 365 },
  { label: 'Todo', days: 0 },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function StatsView() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('Todo')
  // Solo el titulo: refresca la lista de recientes sin suscribirse al store entero.
  const currentTrackTitle = usePlayerStore((s) => s.currentTrack?.title)

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

  const insights = useMemo(
    () => (summary ? buildInsights(summary) : []),
    [summary]
  )

  const streak = useMemo(
    () => (summary?.activityMap ? computeStreak(summary.activityMap) : { current: 0, longest: 0 }),
    [summary]
  )

  if (loading) {
    return (
      <div className="stats-loading">
        <BarChart2 size={32} style={{ opacity: 0.25 }} />
        <p>Cargando estadísticas…</p>
      </div>
    )
  }

  if (!summary || summary.totalPlays === 0) {
    return (
      <div className="stats-empty">
        <Headphones size={44} style={{ opacity: 0.18 }} />
        <p>Aún no hay estadísticas</p>
        <span>Escucha música para ver tus datos aquí</span>
      </div>
    )
  }

  const maxArtist = summary.topArtists?.[0]?.count || 1
  const maxTrack = summary.topTracks?.[0]?.count || 1

  const statCards = [
    { icon: Music, value: summary.totalPlays.toLocaleString(), label: 'canciones', color: 'var(--accent)' },
    { icon: Clock, value: fmtTime(summary.totalHours, summary.totalMinutes), label: 'escuchadas', color: '#30d158' },
    { icon: Calendar, value: summary.uniqueDays, label: 'días activos', color: '#0a84ff' },
    { icon: TrendingUp, value: fmtHour(summary.peakHour), label: 'hora pico', color: '#ff9f0a' },
  ]

  return (
    <div className="stats-view">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <StatsHero summary={summary} />

      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="stats-toolbar">
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
        <button className="stats-export-btn" onClick={handleExport}>
          <Download size={12} />
          Exportar
        </button>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────── */}
      <div className="stat-cards-grid">
        {statCards.map((card) => (
          <StatCard key={card.label} icon={card.icon} value={card.value} label={card.label} color={card.color} />
        ))}
      </div>

      {/* ── Streak + Insights row ─────────────────────────────────── */}
      <div className="stats-streak-insights-row">
        <StreakCard streak={streak} />
        <InsightsSection insights={insights} />
      </div>

      {/* ── Melo Monthly ─────────────────────────────────────────── */}
      <MeloMonthlyCard summary={summary} />

      {/* ── Service breakdown ─────────────────────────────────────── */}
      {summary.serviceStats?.length > 0 && (
        <div className="stats-section">
          <h3 className="stats-section-title">Tiempo por servicio</h3>
          <div className="service-time-list">
            {summary.serviceStats.map((svc) => (
              <div key={svc.id} className="service-time-item">
                <div className="service-time-header">
                  <span className="service-time-dot" style={{ background: svc.color }} />
                  <span className="service-time-name">{svc.name}</span>
                  <span className="service-time-value">{fmtTime(svc.hours, svc.minutes)}</span>
                  <span className="service-time-pct">{svc.percent}%</span>
                </div>
                <div className="service-time-bar-track">
                  <div className="service-time-bar-fill" style={{ width: svc.percent + '%', background: svc.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top artists & tracks ──────────────────────────────────── */}
      <div className="stats-two-col">
        {summary.topArtists?.length > 0 && (
          <div className="stats-section">
            <h3 className="stats-section-title">Top artistas</h3>
            <div className="top-list">
              {summary.topArtists.map((a, i) => (
                <TopBar key={i} rank={i + 1} name={a.name} count={a.count} max={maxArtist} color="var(--accent)" />
              ))}
            </div>
          </div>
        )}

        {summary.topTracks?.length > 0 && (
          <div className="stats-section">
            <h3 className="stats-section-title">Top canciones</h3>
            <div className="top-list">
              {summary.topTracks.map((t, i) => (
                <TopBar key={i} rank={i + 1} name={t.title} count={t.count} max={maxTrack} color="var(--accent)" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Recently played ───────────────────────────────────────── */}
      <RecentlyPlayed refreshKey={currentTrackTitle} />

      {/* ── Activity heatmap ──────────────────────────────────────── */}
      <div className="stats-section">
        <h3 className="stats-section-title">Actividad del año</h3>
        <ActivityGrid activityMap={summary.activityMap || {}} />
      </div>

    </div>
  )
}
