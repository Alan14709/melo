const THEME_VARS = [
  '--bg-base',
  '--bg-sidebar',
  '--bg-topbar',
  '--bg-playerbar',
  '--bg-card',
  '--bg-hover',
  '--bg-active',
  '--border',
  '--accent',
  '--text-primary',
  '--text-secondary',
  '--text-tertiary',
]

export function applyTheme(themeName, customTheme = null) {
  const root = document.documentElement

  THEME_VARS.forEach((v) => {
    root.style.removeProperty(v)
  })

  root.setAttribute('data-theme', themeName)

  if (themeName === 'custom' && customTheme) {
    Object.entries(customTheme).forEach(([key, val]) => {
      if (val) root.style.setProperty(key, val)
    })
  }
}

export function applyDynamicPalette(palette) {
  if (!palette) return
  const root = document.documentElement
  root.style.setProperty('--bg-base', palette.bgBase)
  root.style.setProperty('--bg-sidebar', palette.bgSidebar)
  root.style.setProperty('--bg-topbar', palette.bgTopbar)
  root.style.setProperty('--bg-playerbar', palette.bgPlayerbar)
  root.style.setProperty('--bg-card', palette.bgCard)
  root.style.setProperty('--bg-hover', palette.bgHover)
  root.style.setProperty('--bg-active', palette.bgActive)
  root.style.setProperty('--border', palette.border)
  root.style.setProperty('--accent', palette.accent)
}

export function applyDynamicAccent(color) {
  if (!color) return
  const root = document.documentElement
  root.style.setProperty('--accent', color)
  // Generar variantes del accent dinamicamente
  root.style.setProperty('--accent-hover', lightenColor(color, 0.15))
  root.style.setProperty('--accent-active', darkenColor(color, 0.15))
  root.style.setProperty('--accent-subtle', hexToRgba(color, 0.15))
  root.style.setProperty('--accent-glow', hexToRgba(color, 0.25))
}

function lightenColor(hex, factor = 0.2) {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * (1 + factor)))
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * (1 + factor)))
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * (1 + factor)))
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function darkenColor(hex, factor = 0.2) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - factor))
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - factor))
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - factor))
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
