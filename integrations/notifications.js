const { Notification, nativeImage } = require('electron')

let lastNotifiedTrack = null

async function notifyTrackChange({ title, artist, artwork }) {
  const trackId = `${title}-${artist}`
  if (trackId === lastNotifiedTrack) return
  lastNotifiedTrack = trackId

  try {
    let icon

    if (artwork) {
      try {
        const res = await fetch(artwork)
        const buf = await res.arrayBuffer()
        icon = nativeImage.createFromBuffer(Buffer.from(buf))
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
