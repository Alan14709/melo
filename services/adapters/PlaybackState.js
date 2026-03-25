/**
 * PlaybackState - Fuente unica de verdad del estado del reproductor
 * Elimina desincronizacion entre estado real y UI
 */

class PlaybackState {
  constructor() {
    this.state = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      trackId: null,
      title: null,
      artist: null,
      album: null,
      artwork: null,
      service: null,
      lastUpdate: 0,
      status: 'idle', // idle | playing | paused | error | buffering
    }

    // Simulacion de progreso entre polls reales.
    this._simulationInterval = null
    this._onUpdate = null
  }

  // Callback para sincronizar consumidores cuando cambia el estado.
  onUpdate(cb) {
    this._onUpdate = cb
  }

  // Actualizar estado con datos reales del servicio.
  update(patch) {
    const prev = this.state.trackId
    const hasIsPlaying = typeof patch?.isPlaying === 'boolean'

    this.state = {
      ...this.state,
      ...patch,
      ...(hasIsPlaying
        ? { status: patch.isPlaying ? 'playing' : 'paused' }
        : {}),
      lastUpdate: Date.now(),
    }

    if (patch.trackId && patch.trackId !== prev) {
      console.log('[PlaybackState] Nueva cancion:', patch.title)
    }

    this._onUpdate?.(this.state)
  }

  // Exponer snapshot inmutable para sistemas de salud/diagnostico.
  getCurrent() {
    return {
      ...this.state,
      timestamp: this.state.lastUpdate,
    }
  }

  // Solo para validaciones internas de salud/diagnostico.
  setLastUpdateTimestamp(timestamp) {
    const ts = Number(timestamp)
    if (!Number.isFinite(ts) || ts <= 0) return
    this.state.lastUpdate = ts
  }

  // Simular progreso para suavizar UI entre polls reales.
  startSimulation() {
    this.stopSimulation()
    this._simulationInterval = setInterval(() => {
      if (!this.state.isPlaying) return
      if (this.state.duration <= 0) return

      const elapsed = (Date.now() - this.state.lastUpdate) / 1000
      const simulated = this.state.currentTime + elapsed

      if (simulated > this.state.duration) return
      if (elapsed < 3) return

      this._onUpdate?.({
        ...this.state,
        currentTime: simulated,
      })
    }, 500)
  }

  stopSimulation() {
    if (this._simulationInterval) {
      clearInterval(this._simulationInterval)
      this._simulationInterval = null
    }
  }

  markError() {
    this.update({ status: 'error', isPlaying: false })
    console.error('[PlaybackState] Estado de error marcado')
  }

  reset() {
    this.stopSimulation()
    this.state = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      trackId: null,
      title: null,
      artist: null,
      album: null,
      artwork: null,
      service: null,
      lastUpdate: 0,
      status: 'idle',
    }
  }

  destroy() {
    this.stopSimulation()
    this._onUpdate = null
  }
}

const playbackState = new PlaybackState()
module.exports = { playbackState }
