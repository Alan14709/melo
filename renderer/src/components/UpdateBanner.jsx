import React, { useEffect, useState } from 'react'
import { useToast } from '../hooks/useToast'

export default function UpdateBanner() {
  const [update, setUpdate] = useState(null)
  const [progress, setProgress] = useState(null)
  const { success: showSuccess, info: showInfo } = useToast()

  useEffect(() => {
    // Los tres onX devuelven su unsubscribe; antes se descartaban y los
    // listeners se acumulaban en cada montaje del banner.
    const unsubscribers = [
      window.melo.update.onAvailable((info) => {
        setUpdate(info)
        showInfo(`Nueva versión disponible: ${info?.version || 'desconocida'}`)
      }),
      window.melo.update.onProgress((p) => setProgress(p)),
      window.melo.update.onDownloaded(() => {
        setUpdate((u) => ({ ...(u || {}), ready: true }))
        showSuccess('Actualización lista. Reinicia para instalarla.')
      }),
    ]

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe()
      })
    }
  }, [showInfo, showSuccess])

  if (!update) return null

  return (
    <div className="update-banner" role="status" aria-live="polite">
      {update.ready ? (
        <>
          <span>Melo {update.version || ''} listo para instalar</span>
          <button onClick={() => window.melo.update.install()}>
            Reiniciar e instalar
          </button>
        </>
      ) : progress ? (
        <>
          <span>Descargando actualización…</span>
          <span>{Math.round(progress.percent || 0)}%</span>
        </>
      ) : (
        <span>Nueva versión disponible: {update.version || 'desconocida'}</span>
      )}
    </div>
  )
}
