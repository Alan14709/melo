import React, { useEffect, useMemo, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'

function StatCard({ emoji, value, label }) {
  return (
    <article className="stat-card fade-up-enter">
      <p className="stat-emoji">{emoji}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </article>
  )
}

function TopList({ title, items = [], max = 1, isTrack = false }) {
  return (
    <section className="stats-panel-card fade-up-enter">
      <h3>{title}</h3>
      <div className="top-list">
        {items.map((item, idx) => {
          const value = item.count || 0
          const pct = Math.max(6, Math.round((value / max) * 100))
          return (
            <div className="top-row" key={`${title}-${idx}-${item.name || item.title}`}>
              <span className="top-rank">{idx + 1}.</span>
              <span className="top-name">
                {isTrack
                  ? `${item.title} - ${item.artist || '---'}`
                  : item.name}
              </span>
              <div className="top-bar-wrap">
                <div className="top-bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="top-count">{value}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PeriodFilter({ period, setPeriod, from, to, setFrom, setTo, onApply }) {
  return (
    <div className="period-filter fade-up-enter">
      <button className={period === 'today' ? 'active' : ''} onClick={() => setPeriod('today')}>Hoy</button>
      <button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')}>Semana</button>
      <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Mes</button>
      <button className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>Ano</button>
      <button className={period === 'custom' ? 'active' : ''} onClick={() => setPeriod('custom')}>Custom</button>
      {period === 'custom' && (
        <div className="custom-range">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>-</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button onClick={onApply}>Aplicar</button>
        </div>
      )}
    </div>
  )
}

function HistoryList({ history = [] }) {
  return (
    <section className="stats-panel-card fade-up-enter history-panel">
      <h3>Historial reciente</h3>
      <div className="history-list">
        {history.map((entry) => (
          <div key={entry.id} className="history-item">
            <div className="history-meta">
              <p>{entry.title}</p>
              <small>{entry.artist || '---'} - {entry.service}</small>
            </div>
            <time>{new Date(entry.playedAt).toLocaleString()}</time>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function StatsView() {
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [period, setPeriod] = useState('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const refresh = () => {
    window.melo.stats.getSummary().then((data) => setSummary(data)).catch(() => {})
    window.melo.stats.getHistory({ limit: 100, offset: 0 }).then((data) => setHistory(data || [])).catch(() => {})
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    const now = Date.now()
    let fromTs

    if (period === 'today') {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      fromTs = d.getTime()
    }
    if (period === 'week') fromTs = now - 7 * 24 * 60 * 60 * 1000
    if (period === 'month') fromTs = now - 30 * 24 * 60 * 60 * 1000
    if (period === 'year') fromTs = now - 365 * 24 * 60 * 60 * 1000

    if (period === 'custom') return

    window.melo.stats.getWrapped({ from: fromTs, to: now })
      .then((data) => setSummary(data?.summary || null))
      .catch(() => {})
  }, [period])

  const maxArtist = useMemo(() => Math.max(1, ...(summary?.topArtists || []).map((x) => x.count)), [summary])
  const maxTrack = useMemo(() => Math.max(1, ...(summary?.topTracks || []).map((x) => x.count)), [summary])

  const exportHistory = async () => {
    const payload = await window.melo.stats.export()
    if (!payload) return
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'melo-history.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearHistory = async () => {
    await window.melo.stats.clear()
    refresh()
  }

  const applyCustomRange = async () => {
    const fromTs = from ? new Date(from).getTime() : undefined
    const toTs = to ? new Date(to).getTime() + 86400000 - 1 : undefined
    const data = await window.melo.stats.getWrapped({ from: fromTs, to: toTs })
    setSummary(data?.summary || null)
  }

  return (
    <main className="stats-view">
      <header className="stats-header fade-up-enter">
        <h2>Tus Stats de Melo</h2>
        <div className="stats-actions">
          <button onClick={exportHistory}><Download size={14} /> Exportar</button>
          <button onClick={clearHistory}><Trash2 size={14} /> Limpiar</button>
        </div>
      </header>

      <PeriodFilter
        period={period}
        setPeriod={setPeriod}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onApply={applyCustomRange}
      />

      <section className="stats-cards-grid">
        <StatCard emoji="PLAYS" value={summary?.totalPlays || 0} label="canciones" />
        <StatCard emoji="DAYS" value={summary?.uniqueDays || 0} label="dias activos" />
      </section>

      <section className="stats-grid">
        <TopList title="Top Artistas" items={summary?.topArtists || []} max={maxArtist} />
        <TopList title="Top Canciones" items={summary?.topTracks || []} max={maxTrack} isTrack />
      </section>

      <section className="stats-panel-card fade-up-enter stats-inline">
        <p>Tu hora pico: {summary?.peakHour ?? '-'}:00</p>
        <p>Servicio favorito: {summary?.topService || '-'}</p>
      </section>

      <HistoryList history={history} />
    </main>
  )
}
