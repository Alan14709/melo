// Artwork Cache - Guardar imágenes de artistas/álbumes localmente para MPRIS y notificaciones
// Estrategia: hash-based cache en ~/.cache/melo/art/ con file:// URLs
// Beneficio: reduce transferencia de datos, acelera MPRIS metadata, funciona offline

const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const os = require('os')

const CACHE_DIR = path.join(os.homedir(), '.cache', 'melo', 'art')
const DOWNLOAD_TIMEOUT_MS = 5000

async function pathExists(filePath) {
  try {
    await fsp.access(filePath)
    return true
  } catch (_) {
    return false
  }
}

async function fetchWithTimeout(url, timeoutMs = DOWNLOAD_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

class ArtworkCache {
  constructor() {
    this.initialized = false
    this.cache = new Map() // In-memory cache: url -> { path, expires }
    this.inflight = new Map()
    this.CACHE_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days
  }

  // Inicializar directorios y limpiar caché antiguo
  async init() {
    try {
      await fsp.mkdir(CACHE_DIR, { recursive: true })
      this.initialized = true
      // Limpiar caché antiguo (archivos más de 30 días)
      await this._cleanOldCache()
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
  async _cleanOldCache() {
    try {
      const files = await fsp.readdir(CACHE_DIR)
      const now = Date.now()
      await Promise.all(files.map(async (file) => {
        const filePath = path.join(CACHE_DIR, file)
        const stats = await fsp.stat(filePath)
        if ((now - stats.mtime.getTime()) > this.CACHE_TTL) {
          await fsp.unlink(filePath)
        }
      }))
    } catch (_) {
      // Ignorar errores de limpieza
    }
  }

  // Obtener URL local (file://) de artwork, descargar si no existe
  async get(remoteUrl) {
    if (!this.initialized || !remoteUrl) return remoteUrl // Fallback a URL remota

    const cached = this.cache.get(remoteUrl)
    if (cached && await pathExists(cached.path)) {
      return cached.fileUrl
    }

    if (this.inflight.has(remoteUrl)) {
      return this.inflight.get(remoteUrl)
    }

    const pending = this._getOrDownload(remoteUrl)
    this.inflight.set(remoteUrl, pending)

    try {
      return await pending
    } catch (_) {
      // En caso de error, devolver URL remota
      return remoteUrl
    } finally {
      this.inflight.delete(remoteUrl)
    }
  }

  async _getOrDownload(remoteUrl) {
    const hash = this._hashUrl(remoteUrl)
    const filePath = path.join(CACHE_DIR, `${hash}.png`)
    const fileUrl = `file://${filePath}`

    if (await pathExists(filePath)) {
      this.cache.set(remoteUrl, { path: filePath, fileUrl })
      return fileUrl
    }

    const response = await fetchWithTimeout(remoteUrl, DOWNLOAD_TIMEOUT_MS)
    if (!response.ok) return remoteUrl

    const buffer = await response.arrayBuffer()
    await fsp.writeFile(filePath, Buffer.from(buffer))
    this.cache.set(remoteUrl, { path: filePath, fileUrl })

    return fileUrl
  }

  async _clearDirectory(dirPath) {
    if (!(await pathExists(dirPath))) return
    const files = await fsp.readdir(dirPath)
    await Promise.all(files.map(async (file) => {
      await fsp.unlink(path.join(dirPath, file)).catch(() => {})
    }))
  }

  async _resetDirectory(dirPath) {
    await this._clearDirectory(dirPath)
    await fsp.mkdir(dirPath, { recursive: true })
  }

  async ensureReady() {
    if (!this.initialized) {
      await this.init()
    }
  }

  // Pre-caché (descargar en background sin esperar)
  cacheInBackground(remoteUrl) {
    if (!this.initialized || !remoteUrl) return
    queueMicrotask(() => {
      this.get(remoteUrl).catch(() => {})
    })
  }

  // Limpiar todo el caché (para desarrollo/debugging)
  async clear() {
    try {
      await this._resetDirectory(CACHE_DIR)
      this.cache.clear()
      this.inflight.clear()
    } catch (e) {
      console.error('[ArtworkCache] Clear failed:', e.message)
    }
  }
}

module.exports = new ArtworkCache()
