/**
 * BrowserViewAdapter - Adaptador generico para servicios web
 * Controla la reproduccion via DOM en un BrowserView de Electron
 * Funciona con Apple Music, Spotify Web, YT Music, Tidal y Deezer
 */

const EXECUTE_TIMEOUT = 2000
// Margen para que el servicio procese la tecla multimedia antes de verificar.
// AdapterManager corta la accion completa a los 2000 ms, asi que la suma de
// (lectura + espera + lectura + respaldo) tiene que caber holgadamente dentro.
const SKIP_VERIFY_MS = 350
// Lecturas de verificacion: timeout corto y un solo intento, para que nunca
// consuman el presupuesto de la accion.
const QUICK_EXEC_TIMEOUT = 400
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

	// Envia una tecla multimedia REAL a la pagina.
	//
	// `sendInputEvent` inyecta el evento en el pipeline de entrada de Chromium,
	// asi que llega con isTrusted=true y lo recogen los handlers de MediaSession
	// que Spotify, YT Music, Tidal y Deezer ya registran para soportar teclas
	// multimedia en Chrome. No depende de selectores ni del idioma de la web.
	//
	// El `dispatchEvent(new KeyboardEvent(...))` que habia antes se generaba desde
	// executeJavaScript: isTrusted=false, y los servicios lo ignoran.
	async _sendMediaKey(keyCode) {
		const view = this.getView()
		if (!view || !view.webContents || view.webContents.isDestroyed()) {
			throw new Error('BrowserView no disponible')
		}

		view.webContents.sendInputEvent({ type: 'keyDown', keyCode })
		view.webContents.sendInputEvent({ type: 'keyUp', keyCode })
		return true
	}

	// Lectura rapida sin reintentos: solo para verificar efectos, nunca para
	// ejecutar acciones. Devuelve null en vez de lanzar.
	async _execQuick(script) {
		const view = this.getView()
		if (!view || !view.webContents || view.webContents.isDestroyed()) return null

		try {
			return await Promise.race([
				view.webContents.executeJavaScript(script, true),
				new Promise((resolve) => setTimeout(() => resolve(null), QUICK_EXEC_TIMEOUT)),
			])
		} catch (_) {
			return null
		}
	}

	// Estado de MediaSession, para verificar si una accion tuvo efecto.
	async _readTrackTitle() {
		return this._execQuick(`navigator.mediaSession?.metadata?.title || null`)
	}

	async _readPlaybackState() {
		return this._execQuick(`navigator.mediaSession?.playbackState || null`)
	}

	// Probar selectores en orden, cruzando shadow roots.
	//
	// Solo se usa como respaldo si la tecla multimedia no tuvo efecto. Los
	// `aria-label` dependen del idioma en que el servicio renderiza su UI, asi
	// que se comparan en minusculas y por substring, no por igualdad exacta.
	async _clickSelector(labelFragments, testIds = []) {
		const fragmentsJson = JSON.stringify(labelFragments.map((f) => f.toLowerCase()))
		const testIdsJson = JSON.stringify(testIds)

		return this._exec(`
			(() => {
				const fragments = ${fragmentsJson}
				const testIds = ${testIdsJson}
				const roots = [document]
				const candidates = []

				while (roots.length) {
					const root = roots.pop()
					if (!root || !root.querySelectorAll) continue
					for (const el of root.querySelectorAll('button, [role="button"], [data-testid]')) {
						candidates.push(el)
						if (el.shadowRoot) roots.push(el.shadowRoot)
					}
					for (const el of root.querySelectorAll('*')) {
						if (el.shadowRoot) roots.push(el.shadowRoot)
					}
				}

				const isUsable = (el) => el && !el.disabled && el.getClientRects().length > 0

				for (const id of testIds) {
					const el = candidates.find((c) => c.getAttribute('data-testid') === id)
					if (isUsable(el)) {
						el.click()
						return { clicked: true, via: 'testid:' + id }
					}
				}

				for (const fragment of fragments) {
					const el = candidates.find((c) => {
						const label = (c.getAttribute('aria-label') || c.title || '').toLowerCase()
						return label.includes(fragment) && isUsable(c)
					})
					if (el) {
						el.click()
						return { clicked: true, via: 'label:' + fragment }
					}
				}

				return { clicked: false }
			})()
		`)
	}

	async play() {
		// MediaPlayPause es un toggle: si el servicio lo atendio, playbackState
		// pasa de playing a paused o al reves.
		const before = await this._readPlaybackState()
		await this._sendMediaKey('MediaPlayPause')
		await new Promise((resolve) => setTimeout(resolve, SKIP_VERIFY_MS))
		const after = await this._readPlaybackState()

		if (before && after && before !== after) {
			return { handled: true, via: 'mediakey' }
		}

		return this._clickSelector(
			['pausar', 'pause', 'reproducir', 'play', 'lecture', 'wiedergabe'],
			['play-pause-btn', 'control-button-playpause']
		)
	}

	async pause() {
		// En esta implementacion pause es toggle para mantener compatibilidad.
		return this.play()
	}

	// Cambio de pista: tecla multimedia y, si el titulo no cambia, boton.
	async _skip(keyCode, labelFragments, testIds) {
		const before = await this._readTrackTitle()
		await this._sendMediaKey(keyCode)

		await new Promise((resolve) => setTimeout(resolve, SKIP_VERIFY_MS))
		const after = await this._readTrackTitle()

		if (before !== after) return { handled: true, via: 'mediakey' }

		logger.warn('BrowserViewAdapter', 'mediakey_no_effect', {
			serviceId: this.serviceId,
			keyCode,
		})
		return this._clickSelector(labelFragments, testIds)
	}

	async next() {
		return this._skip(
			'MediaNextTrack',
			['siguiente', 'next', 'skip forward', 'suivant', 'weiter', 'próxima'],
			['next-btn', 'control-button-skip-forward']
		)
	}

	async previous() {
		return this._skip(
			'MediaPreviousTrack',
			['anterior', 'previous', 'skip back', 'précédent', 'zurück'],
			['previous-btn', 'control-button-skip-back']
		)
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
		// Recorre shadow roots igual que el handler de `player:seek`. Con un
		// querySelector plano, los servicios basados en web components (Apple
		// Music) devolvian null y el scrubber salia siempre deshabilitado,
		// aunque el seek sobre esos mismos elementos si funcionaba.
		return this._exec(`
			(() => {
				const stack = [document]

				while (stack.length) {
					const root = stack.pop()
					if (!root || !root.querySelectorAll) continue

					for (const media of root.querySelectorAll('video, audio')) {
						if (Number.isFinite(media.duration) && media.duration > 0) {
							return {
								position: media.currentTime,
								duration: media.duration,
								state: navigator.mediaSession?.playbackState || 'none'
							}
						}
					}

					for (const el of root.querySelectorAll('*')) {
						if (el.shadowRoot) stack.push(el.shadowRoot)
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

