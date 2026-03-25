/**
 * BrowserViewAdapter - Adaptador generico para servicios web
 * Controla la reproduccion via DOM en un BrowserView de Electron
 * Funciona con Apple Music, Spotify Web, YT Music, Tidal y Deezer
 */

const EXECUTE_TIMEOUT = 2000
const MAX_EXEC_RETRIES = 2
const logger = require('../Logger')

class BrowserViewAdapter {
	constructor(serviceId, getView) {
		this.serviceId = serviceId
		// getView retorna el BrowserView activo para evitar referencias obsoletas.
		this.getView = getView
		this.isDestroyed = false
	}

	// Ejecutar JS en el BrowserView con timeout y manejo de errores.
	async _exec(script) {
		let lastError = null
		for (let attempt = 1; attempt <= MAX_EXEC_RETRIES; attempt++) {
			if (this.isDestroyed) {
				throw new Error('Adaptador destruido')
			}

			const view = this.getView()
			if (!view || !view.webContents || view.webContents.isDestroyed()) {
				throw new Error('BrowserView no disponible')
			}

			try {
				const result = await Promise.race([
					view.webContents.executeJavaScript(script, true),
					new Promise((_, reject) =>
						setTimeout(() => reject(new Error('executeJavaScript timeout')), EXECUTE_TIMEOUT)
					)
				])
				return result
			} catch (err) {
				lastError = err
				// Guard de cancelacion para no seguir reintentando sobre recursos destruidos.
				if (this.isDestroyed || view.webContents.isDestroyed()) break
				logger.warn('BrowserViewAdapter', 'exec_retry', {
					serviceId: this.serviceId,
					attempt,
					message: err?.message || 'unknown_error',
				})
			}
		}

		throw lastError || new Error('executeJavaScript failed')
	}

	// Probar selectores en orden con fallback por prioridad.
	async _clickSelector(selectors) {
		const selectorsJson = JSON.stringify(selectors)
		return this._exec(`
			(() => {
				const selectors = ${selectorsJson}
				for (const sel of selectors) {
					try {
						const el = document.querySelector(sel)
						if (el && !el.disabled && el.offsetParent !== null) {
							el.click()
							return { clicked: true, selector: sel }
						}
					} catch (_) {}
				}
				return { clicked: false }
			})()
		`)
	}

	async play() {
		const result = await this._clickSelector([
			'[aria-label="Pausar"]',
			'[aria-label="Pause"]',
			'[aria-label="pause"]',
			'[aria-label="Reproducir"]',
			'[aria-label="Play"]',
			'[aria-label="play"]',
			'amp-chrome-player button[aria-label*="ause"]',
			'amp-chrome-player button[aria-label*="lay"]',
			'[data-testid="play-pause-btn"]',
		])

		// Fallback: espacio para toggle cuando no hay boton detectado.
		if (!result?.clicked) {
			await this._exec(`
				document.dispatchEvent(
					new KeyboardEvent('keydown', { key: ' ', bubbles: true })
				)
			`)
		}
		return result
	}

	async pause() {
		// En esta implementacion pause es toggle para mantener compatibilidad.
		return this.play()
	}

	async next() {
		const result = await this._clickSelector([
			'[aria-label="Siguiente"]',
			'[aria-label="Next"]',
			'[aria-label="next"]',
			'[aria-label="Skip forward"]',
			'amp-chrome-player [aria-label*="iguiente"]',
			'amp-chrome-player [aria-label*="ext"]',
			'[data-testid="next-btn"]',
		])

		if (!result?.clicked) {
			await this._exec(`
				document.dispatchEvent(new KeyboardEvent('keydown', {
					key: 'ArrowRight', metaKey: true, bubbles: true
				}))
			`)
		}
		return result
	}

	async previous() {
		const result = await this._clickSelector([
			'[aria-label="Anterior"]',
			'[aria-label="Previous"]',
			'[aria-label="previous"]',
			'[aria-label="Skip back"]',
			'amp-chrome-player [aria-label*="nterior"]',
			'amp-chrome-player [aria-label*="rev"]',
			'[data-testid="previous-btn"]',
		])

		if (!result?.clicked) {
			await this._exec(`
				document.dispatchEvent(new KeyboardEvent('keydown', {
					key: 'ArrowLeft', metaKey: true, bubbles: true
				}))
			`)
		}
		return result
	}

	async seek(seconds) {
		return this._exec(`
			(() => {
				const media = document.querySelector('video, audio')
				if (media && !isNaN(media.duration)) {
					media.currentTime = ${Number(seconds)}
					return { seeked: true, to: ${Number(seconds)} }
				}
				return { seeked: false }
			})()
		`)
	}

	async setVolume(volume) {
		const vol = Math.max(0, Math.min(1, Number(volume)))
		const view = this.getView()
		if (view?.webContents && !view.webContents.isDestroyed()) {
			view.webContents.setAudioMuted(vol === 0)
		}
		return this._exec(`
			(() => {
				const media = document.querySelector('video, audio')
				if (media) {
					media.volume = ${vol}
					return { volume: ${vol} }
				}
				return { volume: null }
			})()
		`)
	}

	async getProgress() {
		return this._exec(`
			(() => {
				const media = document.querySelector('video, audio')
				if (media && !isNaN(media.duration) && media.duration > 0) {
					return {
						position: media.currentTime,
						duration: media.duration,
						state: navigator.mediaSession?.playbackState || 'none'
					}
				}
				return null
			})()
		`)
	}

	async destroy() {
		this.isDestroyed = true
		logger.traceAction('BrowserViewAdapter', 'destroy', { serviceId: this.serviceId })
	}
}

module.exports = { BrowserViewAdapter }

