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
