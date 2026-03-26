const { Notification, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

let lastNotifiedTrack = null
let ArtworkCache = null

try {
  ArtworkCache = require('../services/ArtworkCache')
} catch (_) {
  // ArtworkCache puede no estar disponible
}

async function notifyTrackChange({ title, artist, artwork }) {
  const trackId = `${title}-${artist}`
  if (trackId === lastNotifiedTrack) return
  lastNotifiedTrack = trackId

  try {
    let icon

    if (artwork) {
      try {
        // Intentar usar caché local primero
        let iconPath = artwork
        if (ArtworkCache?.get) {
          iconPath = await ArtworkCache.get(artwork)
        }

        // Si es file://, convertir a ruta local
        if (iconPath.startsWith('file://')) {
          const localPath = iconPath.slice(7) // Remover 'file://'
          if (fs.existsSync(localPath)) {
            icon = nativeImage.createFromPath(localPath)
          }
        } else {
          // Fallback: descargar si no está en caché
          const res = await fetch(iconPath)
          const buf = await res.arrayBuffer()
          icon = nativeImage.createFromBuffer(Buffer.from(buf))
        }
      } catch (_) {
        icon = undefined
      }
    }

    new Notification({
      title: title || 'Melo',
      body: artist || '',
      icon,
      silent: true,
      timeoutType: 'default'
    }).show()
  } catch (_) {}
}

module.exports = { notifyTrackChange }
