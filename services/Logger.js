const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, '..', 'logs')
const RUNTIME_FILE = path.join(LOG_DIR, 'runtime.log')
const ERROR_FILE = path.join(LOG_DIR, 'error.log')
const MAX_ROTATED_FILES = 5
const ROTATE_CHECK_INTERVAL_MS = 1500
const rotateCheckAt = new Map()

const LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  } catch (_) {}
}

function rotateFile(filePath) {
  try {
    // Rotacion simple: file.4 -> file.5, ..., file -> file.1
    for (let idx = MAX_ROTATED_FILES - 1; idx >= 1; idx -= 1) {
      const src = `${filePath}.${idx}`
      const dest = `${filePath}.${idx + 1}`
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest)
      }
    }
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, `${filePath}.1`)
    }
  } catch (_) {}
}

function rotateIfNeeded(filePath) {
  const now = Date.now()
  const nextCheckAt = rotateCheckAt.get(filePath) || 0
  if (now < nextCheckAt) return
  rotateCheckAt.set(filePath, now + ROTATE_CHECK_INTERVAL_MS)

  try {
    const stats = fs.statSync(filePath)
    // Limitar tamano para evitar crecimiento indefinido.
    if (stats.size > 1024 * 1024) {
      rotateFile(filePath)
    }
  } catch (_) {}
}

function serializePayload(payload) {
  try {
    return JSON.stringify(payload)
  } catch {
    return JSON.stringify({ message: 'payload_unserializable' })
  }
}

function sanitizeString(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, 'Bearer [REDACTED]')
    .replace(/(token|secret|api[_-]?key|client_secret|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\/home\/[A-Za-z0-9._-]+/g, '/home/[REDACTED_USER]')
}

function sanitizePayload(value) {
  if (value == null) return value
  if (typeof value === 'string') return sanitizeString(value)
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item))
  if (typeof value === 'object') {
    const out = {}
    Object.entries(value).forEach(([k, v]) => {
      out[k] = sanitizePayload(v)
    })
    return out
  }
  return value
}

class Logger {
  constructor() {
    ensureLogDir()
    this.sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const isDebug = process.env.DEBUG
    const isProduction = process.env.NODE_ENV === 'production' || process.env.MELO_ENV === 'production'
    if (isDebug) this.level = 'debug'
    else if (isProduction) this.level = 'warn'
    else this.level = 'info'
  }

  setLevel(level) {
    if (LEVEL_WEIGHT[level] != null) {
      this.level = level
    }
  }

  shouldLog(level) {
    const activeWeight = LEVEL_WEIGHT[this.level] ?? LEVEL_WEIGHT.info
    const levelWeight = LEVEL_WEIGHT[level] ?? LEVEL_WEIGHT.info
    return levelWeight >= activeWeight
  }

  write(level, module, action, data) {
    if (!this.shouldLog(level)) return

    const timestamp = new Date().toISOString()
    const sanitizedData = sanitizePayload(data ?? null)
    const payload = {
      timestamp,
      sessionId: this.sessionId,
      level,
      module,
      action,
      data: sanitizedData,
    }

    const line = `${serializePayload(payload)}\n`

    // Conservar salida de consola para diagnostico en tiempo real.
    if (level === 'error') console.error('[Melo]', line.trim())
    else if (level === 'warn') console.warn('[Melo]', line.trim())
    else console.log('[Melo]', line.trim())

    try {
      rotateIfNeeded(RUNTIME_FILE)
      fs.appendFile(RUNTIME_FILE, line, 'utf8', () => {})
      if (level === 'error') {
        rotateIfNeeded(ERROR_FILE)
        fs.appendFile(ERROR_FILE, line, 'utf8', () => {})
      }
    } catch (_) {}
  }

  debug(module, action, data) {
    this.write('debug', module, action, data)
  }

  info(module, action, data) {
    this.write('info', module, action, data)
  }

  warn(module, action, data) {
    this.write('warn', module, action, data)
  }

  error(module, action, data) {
    this.write('error', module, action, data)
  }

  // Helper explicito para trazas de acciones de usuario/sistema.
  traceAction(module, action, data) {
    this.info(module, action, data)
  }
}

module.exports = new Logger()
