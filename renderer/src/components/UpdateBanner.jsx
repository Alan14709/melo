import React, { useEffect, useState } from 'react'

export default function UpdateBanner() {
  const [update, setUpdate] = useState(null)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    // Suscribe los eventos del auto updater enviados por Electron main.
    window.melo.update.onAvailable((info) => setUpdate(info))
    window.melo.update.onProgress((p) => setProgress(p))
    window.melo.update.onDownloaded(() => {
      setUpdate((u) => ({ ...(u || {}), ready: true }))
    })
  }, [])

  if (!update) return null

  return (
    <div className="update-banner">
      {update.ready ? (
        <>
          <span>Melo {update.version || ''} listo para instalar</span>
          <button onClick={() => window.melo.update.install()}>
            Reiniciar e instalar
          </button>
        </>
      ) : progress ? (
        <>
          <span>Descargando actualizacion...</span>
          <span>{Math.round(progress.percent || 0)}%</span>
        </>
      ) : (
        <span>Nueva version disponible: {update.version || 'desconocida'}</span>
      )}
    </div>
  )
}
