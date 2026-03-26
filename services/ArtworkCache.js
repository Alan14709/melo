// Artwork Cache - Guardar imágenes de artistas/álbumes localmente para MPRIS y notificaciones
// Estrategia: hash-based cache en ~/.cache/melo/art/ con file:// URLs
// Beneficio: reduce transferencia de datos, acelera MPRIS metadata, funciona offline

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const { app } = require('electron')

const CACHE_DIR = path.join(os.homedir(), '.cache', 'melo', 'art')

class ArtworkCache {
  constructor() {
    this.initialized = false
    this.cache = new Map() // In-memory cache: url -> { path, expires }
    this.CACHE_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days
  }

  // Inicializar directorios y limpiar caché antiguo
  async init() {
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true })
      }
      this.initialized = true
      // Limpiar caché antiguo (archivos más de 30 días)
      this._cleanOldCache()
    } catch (e) {
      console.error('[ArtworkCache] Init failed:', e.message)
      this.initialized = false
    }
  }

  // Obtener hash MD5 de URL (más rápido que SHA1, suficiente para este caso)
  _hashUrl(url) {
    return crypto.createHash('md5').update(url).digest('hex')
  }

  // Limpiar archivos de caché más antiguos que TTL
  _cleanOldCache() {
    try {
      const files = fs.readdirSync(CACHE_DIR)
      const now = Date.now()
      files.forEach((file) => {
        const filePath = path.join(CACHE_DIR, file)
        const stats = fs.statSync(filePath)
        if (now - stats.mtime.getTime() > this.CACHE_TTL) {
          fs.unlinkSync(filePath)
        }
      })
    } catch (_) {
      // Ignorar errores de limpieza
    }
  }

  // Obtener URL local (file://) de artwork, descargar si no existe
  async get(remoteUrl) {
    if (!this.initialized || !remoteUrl) return remoteUrl // Fallback a URL remota

    try {
      const hash = this._hashUrl(remoteUrl)
      const filePath = path.join(CACHE_DIR, `${hash}.png`)

      // Si ya está en cache, devolverlo
      if (fs.existsSync(filePath)) {
        return `file://${filePath}`
      }

      // Descargar imagen
      const response = await fetch(remoteUrl, { timeout: 5000 })
      if (!response.ok) return remoteUrl

      const buffer = await response.arrayBuffer()
      fs.writeFileSync(filePath, Buffer.from(buffer))

      return `file://${filePath}`
    } catch (_) {
      // En caso de error, devolver URL remota
      return remoteUrl
    }
  }

  // Pre-caché (descargar en background sin esperar)
  cacheInBackground(remoteUrl) {
    if (!this.initialized || !remoteUrl) return
    setImmediate(() => {
      this.get(remoteUrl).catch(() => {})
    })
  }

  // Limpiar todo el caché (para desarrollo/debugging)
  async clear() {
    try {
      if (fs.existsSync(CACHE_DIR)) {
        fs.rmSync(CACHE_DIR, { recursive: true })
        fs.mkdirSync(CACHE_DIR, { recursive: true })
      }
      this.cache.clear()
    } catch (e) {
      console.error('[ArtworkCache] Clear failed:', e.message)
    }
  }
}

module.exports = new ArtworkCache()
