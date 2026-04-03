/**
 * extractColors.js
 * Extrae paleta de colores dominantes de una imagen de artwork.
 * Usado para degradados dinamicos animados por cancion.
 * NO modifica logica de reproduccion ni sistema.
 */

/**
 * Extrae los colores dominantes de una imagen via canvas.
 * @param {string} imageUrl - URL del artwork
 * @param {number} sampleSize - cuantos pixeles samplear (default 20)
 * @returns {Promise<{dominant: string, palette: string[], vibrant: string, muted: string}>}
 */
export async function extractColors(imageUrl, sampleSize = 20) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = sampleSize
        canvas.height = sampleSize
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize)
        const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data

        const colors = []
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
          if (a < 128) continue
          // Ignorar colores muy oscuros o muy claros
          const brightness = (r * 299 + g * 587 + b * 114) / 1000
          if (brightness < 20 || brightness > 240) continue
          colors.push([r, g, b])
        }

        if (colors.length === 0) {
          resolve(getFallback())
          return
        }

        // Agrupar colores por cuantizacion simple
        const buckets = {}
        colors.forEach(([r, g, b]) => {
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
        const vibrant = sorted.find(c => getSaturation(c.r, c.g, c.b) > 0.3) || dominant
        const muted = sorted.find(c => getSaturation(c.r, c.g, c.b) < 0.2) || sorted[sorted.length - 1] || dominant

        resolve({
          dominant: dominant.hex,
          vibrant: vibrant.hex,
          muted: muted.hex,
          palette: sorted.map(c => c.hex),
        })
      } catch {
        resolve(getFallback())
      }
    }
    img.onerror = () => resolve(getFallback())
    img.src = imageUrl
  })
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function getSaturation(r, g, b) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  return max === 0 ? 0 : (max - min) / max
}

function getFallback() {
  return {
    dominant: '#7c6aff',
    vibrant: '#7c6aff',
    muted: '#1a1a2e',
    palette: ['#7c6aff'],
  }
}

/**
 * Convierte un color hex a rgba con opacidad
 */
export function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Oscurece un color hex por un factor (0-1)
 */
export function darkenColor(hex, factor = 0.4) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - factor))
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - factor))
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - factor))
  return rgbToHex(r, g, b)
}
