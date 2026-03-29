const STALE_STATE_THRESHOLD_MS = 60000

class HealthMonitor {
  constructor(playbackState, logger) {
    this.playbackState = playbackState
    this.logger = logger
    this.checkInterval = null
    this.lastStatus = null
    this.lastAdapterActionTime = Date.now()
    this.mediaSessionAvailable = true
    this.listeners = new Set()
    this.rendererMetrics = {
      gpuFallbacksTriggered: 0,
      noSandboxFallbacksTriggered: 0,
      fallbackExhausted: 0,
      launchSuccesses: 0,
      launchFailures: 0,
      incidents: [],
    }
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  notify(status) {
    this.listeners.forEach((listener) => {
      try {
        listener(status)
      } catch (error) {
        this.logger?.error?.('HealthMonitor', 'listener_error', {
          message: error?.message || 'unknown_error',
        })
      }
    })
  }

  initialize(intervalMs = 5000) {
    if (this.checkInterval) return
    this.checkInterval = setInterval(() => {
      const status = this.check()
      if (status.status !== this.lastStatus?.status || status.reason !== this.lastStatus?.reason) {
        this.logger?.warn?.('HealthMonitor', 'status_changed', {
          from: this.lastStatus?.status || 'unknown',
          to: status.status,
          reason: status.reason || null,
        })
        this.notify(status)
      }
      this.lastStatus = status
    }, intervalMs)
  }

  check() {
    const state = this.playbackState.getCurrent()
    const now = Date.now()
    const hasStateTimestamp = Number.isFinite(state.timestamp) && state.timestamp > 0
    const launchAttempts = this.rendererMetrics.launchSuccesses + this.rendererMetrics.launchFailures
    const rendererSnapshot = {
      ...this.rendererMetrics,
      launchAttempts,
      launchSuccessRate: launchAttempts > 0
        ? Math.round((this.rendererMetrics.launchSuccesses / launchAttempts) * 10000) / 10000
        : null,
    }

    if (state.isPlaying) {
      const adapterAge = now - this.lastAdapterActionTime
      if (adapterAge > 3000) {
        return {
          status: 'error',
          reason: 'adapter_timeout',
          timestamp: new Date().toISOString(),
          renderer: rendererSnapshot,
        }
      }
    }

    const stateAge = now - (state.timestamp || 0)
    const isRecentlyActive = now - this.lastAdapterActionTime < 60000
    const hasEverPlayed = Boolean(
      state.isPlaying
      || state.status === 'playing'
      || state.status === 'paused'
      || state.trackId
      || state.title
    )

    if (hasStateTimestamp && isRecentlyActive && hasEverPlayed && stateAge > STALE_STATE_THRESHOLD_MS) {
      return {
        status: 'error',
        reason: 'stale_state',
        timestamp: new Date().toISOString(),
        renderer: rendererSnapshot,
      }
    }

    if (!this.mediaSessionAvailable) {
      return {
        status: 'error',
        reason: 'no_media_session',
        timestamp: new Date().toISOString(),
        renderer: rendererSnapshot,
      }
    }

    return {
      status: 'healthy',
      reason: null,
      timestamp: new Date().toISOString(),
      renderer: rendererSnapshot,
    }
  }

  recordRendererEvent(event, payload = {}) {
    const next = {
      timestamp: new Date().toISOString(),
      event,
      ...payload,
    }

    if (event === 'gpu_fallback_triggered') this.rendererMetrics.gpuFallbacksTriggered += 1
    if (event === 'no_sandbox_fallback_triggered') this.rendererMetrics.noSandboxFallbacksTriggered += 1
    if (event === 'fallback_exhausted') this.rendererMetrics.fallbackExhausted += 1
    if (event === 'launch_success') this.rendererMetrics.launchSuccesses += 1
    if (event === 'launch_failure') this.rendererMetrics.launchFailures += 1

    this.rendererMetrics.incidents.push(next)
    if (this.rendererMetrics.incidents.length > 50) {
      this.rendererMetrics.incidents.shift()
    }
  }

  getMetrics() {
    const launchAttempts = this.rendererMetrics.launchSuccesses + this.rendererMetrics.launchFailures
    return {
      ...this.rendererMetrics,
      launchAttempts,
      launchSuccessRate: launchAttempts > 0
        ? Math.round((this.rendererMetrics.launchSuccesses / launchAttempts) * 10000) / 10000
        : null,
    }
  }

  recordAdapterAction() {
    this.lastAdapterActionTime = Date.now()
  }

  setLastAdapterActionTime(timestamp) {
    const ts = Number(timestamp)
    if (!Number.isFinite(ts) || ts <= 0) return
    this.lastAdapterActionTime = ts
  }

  setMediaSessionAvailable(available) {
    this.mediaSessionAvailable = Boolean(available)
  }

  shutdown() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    this.listeners.clear()
  }
}

module.exports = { HealthMonitor }
