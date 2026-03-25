class RetryManager {
  constructor(logger) {
    this.logger = logger
    this.activeRetries = new Map()
    this.metrics = {
      executions: 0,
      deduplicated: 0,
      retriesScheduled: 0,
      recovered: 0,
      failed: 0,
      lastError: null,
    }
  }

  async execute(fn, options = {}) {
    const {
      maxAttempts = 3,
      initialDelayMs = 100,
      maxDelayMs = 10000,
      backoffMultiplier = 2,
      label = 'unknown_operation',
    } = options

    if (!label) {
      throw new Error('RetryManager.execute() requires options.label')
    }

    if (this.activeRetries.has(label)) {
      this.metrics.deduplicated += 1
      this.logger?.debug?.('RetryManager', 'deduplicated', { label })
      return this.activeRetries.get(label)
    }

    this.metrics.executions += 1

    const promise = this._executeWithRetry(fn, {
      maxAttempts,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
      label,
    })

    this.activeRetries.set(label, promise)
    promise
      .finally(() => {
        this.activeRetries.delete(label)
      })
      .catch(() => {})

    return promise
  }

  async _executeWithRetry(fn, options) {
    const {
      maxAttempts,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
      label,
    } = options

    let lastError = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await fn()
        if (attempt > 1) {
          this.metrics.recovered += 1
          this.logger?.info?.('RetryManager', 'recovered', {
            label,
            attempts: attempt,
          })
        }
        return result
      } catch (error) {
        lastError = error

        if (attempt < maxAttempts) {
          const delayMs = Math.min(
            initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
            maxDelayMs
          )

          this.logger?.warn?.('RetryManager', 'retry_scheduled', {
            label,
            attempt,
            maxAttempts,
            delayMs,
            message: error?.message || 'unknown_error',
          })

          this.metrics.retriesScheduled += 1

          await this.sleep(delayMs)
        }
      }
    }

    this.metrics.failed += 1
    this.metrics.lastError = {
      label,
      message: lastError?.message || 'unknown_error',
      timestamp: new Date().toISOString(),
    }

    this.logger?.error?.('RetryManager', 'failed', {
      label,
      maxAttempts,
      message: lastError?.message || 'unknown_error',
    })

    throw lastError || new Error('Retry failed')
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  getMetrics() {
    return {
      ...this.metrics,
      inFlight: this.activeRetries.size,
    }
  }
}

module.exports = { RetryManager }
