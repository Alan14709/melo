export async function extractPalette(imageUrl) {
  return new Promise((resolve) => {
    if (!imageUrl) {
      resolve(null)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const SIZE = 80
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }

      ctx.drawImage(img, 0, 0, SIZE, SIZE)

      const data = ctx.getImageData(0, 0, SIZE, SIZE).data
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

      if (count === 0) {
        resolve(null)
        return
      }

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

      resolve({
        bgBase: `rgb(${dr}, ${dg}, ${db})`,
        bgSidebar: `rgb(${Math.round(mr * 0.85)}, ${Math.round(mg * 0.85)}, ${Math.round(mb * 0.85)})`,
        bgTopbar: `rgb(${Math.round(dr * 0.9)}, ${Math.round(dg * 0.9)}, ${Math.round(db * 0.9)})`,
        bgPlayerbar: `rgb(${Math.round(dr * 0.85)}, ${Math.round(dg * 0.85)}, ${Math.round(db * 0.85)})`,
        bgCard: `rgb(${mr}, ${mg}, ${mb})`,
        bgHover: `rgba(${r}, ${g}, ${b}, 0.08)`,
        bgActive: `rgba(${r}, ${g}, ${b}, 0.14)`,
        border: `rgba(${r}, ${g}, ${b}, 0.15)`,
        accent: `rgb(${ar}, ${ag}, ${ab})`,
      })
    }

    img.onerror = () => resolve(null)
    img.src = imageUrl
  })
}

export function extractDominantColor(imageUrl) {
  return extractPalette(imageUrl).then((p) => p?.accent || null)
}
