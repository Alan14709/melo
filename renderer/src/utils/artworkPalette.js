/**
 * artworkPalette.js
 *
 * Fusion de los dos extractores que existian antes:
 *
 *   - `extractColors()`  (extractColors.js)  -> dominant/vibrant/muted/palette
 *                                               para el degradado animado
 *   - `extractPalette()` (colorExtractor.js) -> tokens de tema dinamico
 *
 * Los dos cargaban la MISMA imagen, la pintaban en su propio canvas y llamaban
 * a getImageData por separado: dos decodificaciones completas por cada cambio
 * de cancion. Aqui se hace una sola pasada de pixeles y se derivan los dos
 * resultados, con cache por URL de artwork.
 *
 * Solo UI: no toca logica de reproduccion.
 */

const SAMPLE_SIZE = 64
const MAX_CACHE_ENTRIES = 24

// Guarda la PROMESA, no el valor: App y ArtworkGradient piden el mismo artwork
// casi a la vez, y asi la segunda llamada se engancha al trabajo de la primera
// en vez de decodificar la imagen otra vez.
const cache = new Map()

// ─── Helpers de color ────────────────────────────────────────────────────────

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

function getSaturation(r, g, b) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  return max === 0 ? 0 : (max - min) / max
}

export function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function darkenColor(hex, factor = 0.4) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - factor))
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - factor))
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - factor))
  return rgbToHex(r, g, b)
}

const GRADIENT_FALLBACK = {
  dominant: '#7c6aff',
  vibrant: '#7c6aff',
  muted: '#1a1a2e',
  palette: ['#7c6aff'],
}

// ─── Derivaciones sobre un unico buffer de pixeles ───────────────────────────

/** Cuantiza en buckets y saca dominante / vibrante / apagado. */
function deriveGradientColors(data) {
  const samples = []
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (data[i + 3] < 128) continue
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    if (brightness < 20 || brightness > 240) continue
    samples.push([r, g, b])
  }

  if (samples.length === 0) return GRADIENT_FALLBACK

  const buckets = {}
  samples.forEach(([r, g, b]) => {
    const key = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`
    buckets[key] = (buckets[key] || 0) + 1
  })

  const sorted = Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number)
      return { r, g, b, hex: rgbToHex(r, g, b) }
    })

  const dominant = sorted[0]
  const vibrant = sorted.find((c) => getSaturation(c.r, c.g, c.b) > 0.3) || dominant
  const muted = sorted.find((c) => getSaturation(c.r, c.g, c.b) < 0.2)
    || sorted[sorted.length - 1]
    || dominant

  return {
    dominant: dominant.hex,
    vibrant: vibrant.hex,
    muted: muted.hex,
    palette: sorted.map((c) => c.hex),
  }
}

/** Promedia los pixeles utiles y arma los tokens del tema dinamico. */
function deriveThemeTokens(data) {
  let r = 0
  let g = 0
  let b = 0
  let count = 0

  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i]
    const pg = data[i + 1]
    const pb = data[i + 2]
    const brightness = (pr + pg + pb) / 3
    if (brightness > 20 && brightness < 230) {
      r += pr
      g += pg
      b += pb
      count += 1
    }
  }

  if (count === 0) return null

  r = Math.round(r / count)
  g = Math.round(g / count)
  b = Math.round(b / count)

  const darkFactor = 0.16
  const dr = Math.max(14, Math.round(r * darkFactor))
  const dg = Math.max(14, Math.round(g * darkFactor))
  const db = Math.max(14, Math.round(b * darkFactor))

  const midFactor = 0.24
  const mr = Math.max(22, Math.round(r * midFactor))
  const mg = Math.max(22, Math.round(g * midFactor))
  const mb = Math.max(22, Math.round(b * midFactor))

  const max = Math.max(r, g, b) || 1
  const vibFactor = Math.min(255 / max, 1.8)
  const ar = Math.min(255, Math.round(r * vibFactor))
  const ag = Math.min(255, Math.round(g * vibFactor))
  const ab = Math.min(255, Math.round(b * vibFactor))

  return {
    bgBase: `rgb(${dr}, ${dg}, ${db})`,
    bgSidebar: `rgb(${Math.round(mr * 0.85)}, ${Math.round(mg * 0.85)}, ${Math.round(mb * 0.85)})`,
    bgTopbar: `rgb(${Math.round(dr * 0.9)}, ${Math.round(dg * 0.9)}, ${Math.round(db * 0.9)})`,
    bgPlayerbar: `rgb(${Math.round(dr * 0.85)}, ${Math.round(dg * 0.85)}, ${Math.round(db * 0.85)})`,
    bgCard: `rgb(${mr}, ${mg}, ${mb})`,
    bgHover: `rgba(${r}, ${g}, ${b}, 0.08)`,
    bgActive: `rgba(${r}, ${g}, ${b}, 0.14)`,
    border: `rgba(${r}, ${g}, ${b}, 0.15)`,
    accent: `rgb(${ar}, ${ag}, ${ab})`,
  }
}

// ─── API ─────────────────────────────────────────────────────────────────────

function computePalette(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve({ gradient: GRADIENT_FALLBACK, theme: null })
          return
        }

        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

        resolve({
          gradient: deriveGradientColors(data),
          theme: deriveThemeTokens(data),
        })
      } catch (_) {
        // Artwork de otro origen sin CORS: el canvas queda contaminado.
        resolve({ gradient: GRADIENT_FALLBACK, theme: null })
      }
    }

    img.onerror = () => resolve({ gradient: GRADIENT_FALLBACK, theme: null })
    img.src = imageUrl
  })
}

/**
 * Devuelve `{ gradient, theme }` para una URL de artwork.
 * `theme` puede ser null si la imagen no dio suficientes pixeles utiles.
 */
export function getArtworkPalette(imageUrl) {
  if (!imageUrl) return Promise.resolve(null)

  const cached = cache.get(imageUrl)
  if (cached) return cached

  const pending = computePalette(imageUrl)
  cache.set(imageUrl, pending)

  // Map conserva el orden de insercion: la primera clave es la mas antigua.
  if (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value)
  }

  return pending
}
