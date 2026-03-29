/**
 * Logger - Sistema de logging centralizado
 * Opcional: integrar con main process logger después
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
}

class Logger {
  constructor(namespace = 'Melo') {
    this.namespace = namespace
    this.level = LOG_LEVELS.DEBUG // En dev es DEBUG, en prod sería WARN
  }

  _log(level, levelName, message, data = null) {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${this.namespace}] [${levelName}]`

    if (level <= this.level) {
      const args = [prefix, message]
      if (data) args.push(data)

      if (level === LOG_LEVELS.ERROR) {
        console.error(...args)
      } else if (level === LOG_LEVELS.WARN) {
        console.warn(...args)
      } else {
        console.log(...args)
      }
    }

    return { level: levelName, message, data, timestamp }
  }

  error(message, data) {
    return this._log(LOG_LEVELS.ERROR, 'ERROR', message, data)
  }

  warn(message, data) {
    return this._log(LOG_LEVELS.WARN, 'WARN', message, data)
  }

  info(message, data) {
    return this._log(LOG_LEVELS.INFO, 'INFO', message, data)
  }

  debug(message, data) {
    return this._log(LOG_LEVELS.DEBUG, 'DEBUG', message, data)
  }

  /**
   * Contexto para IPC y Promises
   * @param {string} context - Descripción de qué se está haciendo
   * @returns {{ onSuccess, onError }}
   */
  context(context) {
    return {
      onSuccess: (result) => this.info(`✓ ${context}`, result),
      onError: (error) => this.error(`✗ ${context}`, error?.message || error),
    }
  }
}

export const logger = new Logger('Melo')
