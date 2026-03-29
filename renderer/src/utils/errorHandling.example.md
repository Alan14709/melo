# Error Handling Pattern - Fase 1

## Reemplazo de `.catch(() => {})`

### ❌ ANTES (Silent Error)
```javascript
useEffect(() => {
  window.melo.getSettings()
    .then(settings => setSettings(settings))
    .catch(() => {})  // ❌ Error silenciado
}, [])
```

### ✅ DESPUÉS (Con Logger + Toast)
```javascript
import { useToast } from '../hooks/useToast'
import { logger } from '../utils/logger'

export function MyComponent() {
  const { error: showError } = useToast()
  const { setUIState } = usePlayerStore()

  useEffect(() => {
    setUIState('settings', 'loading')
    
    window.melo.getSettings()
      .then(settings => {
        setSettings(settings)
        setUIState('settings', 'success')
        logger.info('Configuración cargada')
      })
      .catch(err => {
        logger.error('No pude cargar configuración', err)
        showError('Error al cargar configuración')
        setUIState('settings', 'error')
      })
  }, [showError, setUIState])
}
```

---

## Patrones de Uso por Caso

### 1. Async Persist (Guardar settings)
```javascript
const persist = (key, value) => {
  const { info, error: showError } = useToast()
  
  window.melo.saveSettings(key, value)
    .then(() => {
      info(`${key} guardado`)
      logger.info(`Guardado: ${key}`)
    })
    .catch(err => {
      showError(`No pude guardar ${key}`)
      logger.error(`Fallo al guardar ${key}`, err)
    })
}
```

### 2. Batch Operations (Con UI state)
```javascript
const handleThemeChange = async (theme) => {
  const { setUIState } = usePlayerStore()
  const { success, error: showError } = useToast()
  
  try {
    setUIState('theme', 'loading')
    
    applyTheme(theme)
    await window.melo.saveSettings('theme', theme)
    
    setUIState('theme', 'success')
    success('Tema aplicado')
    logger.info('Tema actualizado', { theme })
  } catch (err) {
    setUIState('theme', 'error')
    showError('Error al cambiar tema')
    logger.error('Fallo al cambiar tema', err)
  }
}
```

### 3. Optional Failures (No mostrar error si no es crítico)
```javascript
// Cargar Discord status - si falla, seguir sin error visible
window.melo.discordStatus()
  .then(setDiscordConnected)
  .catch(err => {
    logger.warn('Discord no disponible', err)
    // Sin toast - es opcional
  })
```

---

## Checklist por Componente

- [ ] Reemplazar todos `.catch(() => {})` con `logger + toast`
- [ ] Agregar `setUIState` donde sea apropiado (loading → success/error)
- [ ] Usar `success/error/info` según el tipo de mensaje
- [ ] Logging en INFO (exito) y ERROR (fallo)
- [ ] Sin toasts para operaciones opcionales ("Discord no disponible")

