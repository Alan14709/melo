import { useState, useEffect } from 'react'
import { Download, Upload, RotateCcw } from 'lucide-react'
import { usePlayerStore } from '../store/usePlayerStore'

const DEFAULT_CUSTOM = {
  '--bg-base': '#0d0d0d',
  '--bg-sidebar': '#141414',
  '--bg-topbar': '#111111',
  '--bg-playerbar': '#111111',
  '--bg-card': '#1c1c1e',
  '--accent': '#fc3c44',
  '--text-primary': '#ffffff',
  '--text-secondary': 'rgba(255,255,255,0.55)',
  '--border': 'rgba(255,255,255,0.08)',
}

export default function ThemeEditor({ onClose }) {
  const theme = usePlayerStore((s) => s.theme)
  const setCustomTheme = usePlayerStore((s) => s.setCustomTheme)
  const [values, setValues] = useState(() => {
    try {
      const saved = localStorage.getItem('melo-custom-theme')
      return saved ? JSON.parse(saved) : DEFAULT_CUSTOM
    } catch {
      return DEFAULT_CUSTOM
    }
  })

  useEffect(() => {
    if (theme !== 'custom') return
    Object.entries(values).forEach(([key, val]) => {
      document.documentElement.style.setProperty(key, val)
    })
  }, [values, theme])

  const handleChange = (key, val) => {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  const handleSave = async () => {
    localStorage.setItem('melo-custom-theme', JSON.stringify(values))
    setCustomTheme(values)
    await window.melo.saveSettings('customTheme', values)
    onClose?.()
  }

  const handleReset = () => setValues(DEFAULT_CUSTOM)

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(values, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'melo-theme.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result)
          setValues(imported)
          setCustomTheme(imported)
        } catch {
          alert('Archivo de tema invalido')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const FIELDS = [
    { key: '--bg-base', label: 'Fondo principal', type: 'color' },
    { key: '--bg-sidebar', label: 'Fondo sidebar', type: 'color' },
    { key: '--bg-topbar', label: 'Fondo topbar', type: 'color' },
    { key: '--bg-playerbar', label: 'Fondo playerbar', type: 'color' },
    { key: '--bg-card', label: 'Fondo cards', type: 'color' },
    { key: '--accent', label: 'Color accent', type: 'color' },
    { key: '--text-primary', label: 'Texto principal', type: 'color' },
    { key: '--text-secondary', label: 'Texto secundario', type: 'color' },
    { key: '--border', label: 'Color bordes', type: 'color' },
  ]

  return (
    <div className="theme-editor">
      <div className="theme-editor-header">
        <h3>Editor de tema</h3>
        <div className="theme-editor-actions">
          <button onClick={handleImport} title="Importar tema">
            <Upload size={14} /> Importar
          </button>
          <button onClick={handleExport} title="Exportar tema">
            <Download size={14} /> Exportar
          </button>
          <button onClick={handleReset} title="Resetear">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <div className="theme-editor-fields">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="theme-field">
            <label className="theme-field-label">{label}</label>
            <div className="theme-field-control">
              <input
                type="color"
                value={values[key]?.startsWith('#') ? values[key] : '#ffffff'}
                onChange={(e) => handleChange(key, e.target.value)}
                className="color-picker"
              />
              <input
                type="text"
                value={values[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                className="color-text"
                placeholder="#000000 o rgba(...)"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="theme-editor-footer">
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          style={{ background: 'var(--accent)' }}
        >
          Guardar tema
        </button>
      </div>
    </div>
  )
}
