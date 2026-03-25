/**
 * AdapterManager - Gestor central de adaptadores de audio
 * Cada servicio tiene su propio adaptador con metodos estandarizados
 * Si un adaptador falla, el sistema se recupera sin crashear
 */

const TIMEOUT_MS = 2000
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 300
const logger = require('../Logger')

class AdapterManager {
  constructor() {
    this.adapters = new Map()
    this.activeServiceId = null
    this.isExecutingAction = false
    this.actionQueue = []
    this.lastActionTime = 0
    this.DEBOUNCE_MS = 250
  }

  // Registrar un adaptador para un servicio.
  register(serviceId, adapter) {
    this.adapters.set(serviceId, adapter)
    logger.traceAction('AdapterManager', 'register', { serviceId })
  }

  // Establecer el servicio activo.
  setActive(serviceId) {
    this.activeServiceId = serviceId
    logger.traceAction('AdapterManager', 'setActive', { serviceId })
  }

  // Ejecutar una accion con debounce, retry y manejo de errores.
  async execute(action, ...args) {
    // Debounce: ignorar si se llamo muy recientemente.
    const now = Date.now()
    if (now - this.lastActionTime < this.DEBOUNCE_MS) {
      logger.debug('AdapterManager', 'debounced', { action })
      return { success: false, reason: 'debounced' }
    }
    this.lastActionTime = now

    // Guard: no ejecutar si ya hay una accion en curso.
    if (this.isExecutingAction) {
      logger.warn('AdapterManager', 'busy', { action })
      return { success: false, reason: 'busy' }
    }

    const adapter = this.adapters.get(this.activeServiceId)
    if (!adapter) {
      logger.warn('AdapterManager', 'no_adapter', { serviceId: this.activeServiceId })
      return { success: false, reason: 'no-adapter' }
    }

    if (typeof adapter[action] !== 'function') {
      logger.warn('AdapterManager', 'unsupported_action', { action })
      return { success: false, reason: 'unsupported' }
    }

    this.isExecutingAction = true
    let lastError = null

    // Retry loop.
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.debug('AdapterManager', 'attempt', { action, attempt, max: MAX_RETRIES })

        // Ejecutar con timeout para evitar bloqueos.
        const result = await Promise.race([
          adapter[action](...args),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
          )
        ])

        this.isExecutingAction = false
        logger.traceAction('AdapterManager', 'success', { action, attempt })
        return { success: true, result }
      } catch (err) {
        lastError = err
        logger.error('AdapterManager', 'attempt_failed', {
          action,
          attempt,
          message: err?.message || 'unknown_error',
          stack: err?.stack || null,
        })

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
        }
      }
    }

    // Todos los intentos fallaron.
    this.isExecutingAction = false
    logger.error('AdapterManager', 'failed_permanent', {
      action,
      message: lastError?.message || 'unknown_error',
      stack: lastError?.stack || null,
    })
    return { success: false, reason: 'failed', error: lastError?.message }
  }

  // Destruir todos los adaptadores al cerrar.
  async destroyAll() {
    for (const [id, adapter] of this.adapters) {
      try {
        if (typeof adapter.destroy === 'function') {
          await adapter.destroy()
        }
      } catch (err) {
        logger.error('AdapterManager', 'destroy_error', {
          serviceId: id,
          message: err?.message || 'unknown_error',
        })
      }
    }
    this.adapters.clear()
    logger.traceAction('AdapterManager', 'destroy_all')
  }
}

// Singleton: una sola instancia en todo el proceso main.
const adapterManager = new AdapterManager()
module.exports = { adapterManager }
