import { memo, useState, useEffect } from 'react'
import { Moon, X } from 'lucide-react'

const OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '2 horas', minutes: 120 },
  { label: 'Al fin de la cancion', afterSong: true },
]

function SleepTimer() {
  const [active, setActive] = useState(false)
  const [endsAt, setEndsAt] = useState(null)
  const [afterSong, setAfterSong] = useState(false)
  const [remaining, setRemaining] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.melo.sleep.status().then((s) => {
      setActive(s.active)
      setEndsAt(s.endsAt)
      setAfterSong(s.afterSong)
    })

    const onTriggered = () => {
      setActive(false)
      setEndsAt(null)
      setAfterSong(false)
      setRemaining('')
    }

    window.melo.sleep.onTriggered(onTriggered)

    return () => {
      window.melo.removeAllListeners('sleep:triggered')
    }
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('melo:sleep-menu', {
      detail: { open },
    }))

    return () => {
      window.dispatchEvent(new CustomEvent('melo:sleep-menu', {
        detail: { open: false },
      }))
    }
  }, [open])

  useEffect(() => {
    if (!active || !endsAt) return
    const interval = setInterval(() => {
      const diff = endsAt - Date.now()
      if (diff <= 0) {
        setRemaining('')
        setActive(false)
        return
      }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [active, endsAt])

  const handleSet = async (opt) => {
    const result = await window.melo.sleep.set(opt)
    setActive(result.active)
    setEndsAt(result.endsAt || null)
    setAfterSong(result.afterSong || false)
    setRemaining('')
    setOpen(false)
  }

  const handleCancel = async () => {
    await window.melo.sleep.cancel()
    setActive(false)
    setEndsAt(null)
    setAfterSong(false)
    setRemaining('')
  }

  return (
    <div className="sleep-timer">
      <button
        className={`sleep-btn ${active ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Sleep Timer"
      >
        <Moon size={14} />
        {active && (
          <span className="sleep-indicator">
            {afterSong ? '♪' : remaining}
          </span>
        )}
      </button>

      {active && (
        <button
          className="sleep-cancel"
          onClick={handleCancel}
          title="Cancelar sleep timer"
        >
          <X size={10} />
        </button>
      )}

      {open && (
        <div className="sleep-menu">
          <p className="sleep-menu-title">Sleep Timer</p>
          {OPTIONS.map((opt, i) => (
            <button
              key={i}
              className="sleep-option"
              onClick={() => handleSet(opt)}
            >
              {opt.label}
            </button>
          ))}
          {active && (
            <button
              className="sleep-option sleep-option-cancel"
              onClick={handleCancel}
            >
              Cancelar timer
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(SleepTimer)
