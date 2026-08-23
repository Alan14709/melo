import React, { memo, useEffect, useState } from 'react'
import { Repeat2, Flame, Sparkles } from 'lucide-react'

/**
 * El centro de la PlayerBar.
 *
 * Aqui NO van controles de reproduccion: los servicios embebidos ya traen los
 * suyos, y replicarlos obliga a inyectar JS contra su DOM — selectores por
 * `aria-label` que dependen del idioma de la web y se rompen en cada rediseño.
 *
 * Lo que si puede aportar Melo es lo que el servicio no sabe: tu historial
 * cruzado de TODOS los servicios. Spotify no puede decirte que esa cancion ya
 * la escuchaste tres veces este mes, dos de ellas en Apple Music.
 *
 * Solo lectura sobre el historial que main ya persiste. Cero DOM, cero polling.
 */

function fmtSessionTime(ms) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'recién empezada'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

function fmtSince(timestamp) {
  const days = Math.floor((Date.now() - timestamp) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 30) return `hace ${Math.floor(days / 7)} sem`
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`
  return 'hace más de un año'
}

function ordinal(n) {
  return n === 1 ? '1ª' : `${n}ª`
}

const NowPlayingContext = memo(function NowPlayingContext({ title, artist, hasTrack }) {
  const [context, setContext] = useState(null)

  useEffect(() => {
    let cancelled = false

    window.melo.stats.getNowPlayingContext({ title, artist })
      .then((data) => { if (!cancelled) setContext(data || null) })
      .catch(() => { if (!cancelled) setContext(null) })

    return () => { cancelled = true }
  }, [title, artist])

  if (!context) return null

  const { track, session } = context

  // Caso bueno: la cancion ya esta en el historial cruzado.
  if (hasTrack && track && track.totalPlays > 1) {
    const others = track.otherServices
    return (
      <div className="np-context">
        <p className="np-context-primary">
          <Repeat2 size={13} aria-hidden="true" />
          <span>
            {ordinal(track.playsThisMonth > 1 ? track.playsThisMonth : track.totalPlays)}
            {track.playsThisMonth > 1 ? ' vez este mes' : ' vez en total'}
          </span>
        </p>
        <p className="np-context-secondary">
          {others.length > 0 ? (
            <>
              también en{' '}
              {others.slice(0, 2).map((service, i) => (
                <React.Fragment key={service.id}>
                  {i > 0 && ' y '}
                  <span className="np-context-service" style={{ color: service.color }}>
                    {service.name}
                  </span>
                </React.Fragment>
              ))}
            </>
          ) : (
            track.previousPlayAt && <>la anterior, {fmtSince(track.previousPlayAt)}</>
          )}
        </p>
      </div>
    )
  }

  // Primera escucha registrada de esta cancion.
  if (hasTrack && (!track || track.totalPlays <= 1)) {
    return (
      <div className="np-context">
        <p className="np-context-primary">
          <Sparkles size={13} aria-hidden="true" />
          <span>primera vez</span>
        </p>
        <p className="np-context-secondary">
          {session.playsToday > 1
            ? `${session.playsToday} canciones hoy`
            : `sesión de ${fmtSessionTime(session.sessionMs)}`}
        </p>
      </div>
    )
  }

  // Sin reproduccion: contexto de sesion a secas.
  if (session.streakDays > 1) {
    return (
      <div className="np-context">
        <p className="np-context-primary">
          <Flame size={13} aria-hidden="true" />
          <span>{session.streakDays} días de racha</span>
        </p>
        <p className="np-context-secondary">
          {session.playsToday > 0
            ? `${session.playsToday} canciones hoy`
            : 'aún no suena nada hoy'}
        </p>
      </div>
    )
  }

  return null
})

export default NowPlayingContext
