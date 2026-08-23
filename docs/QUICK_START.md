# ⚡ QUICK START - 5 MINUTOS PARA EMPEZAR

## 🎯 Tu primer Toast

```javascript
// En cualquier componente:
import { useToast } from '../hooks/useToast'

export function MyComponent() {
  const { success, error, info } = useToast()

  const handleSave = async () => {
    try {
      await saveData()
      success('✅ Guardado exitosamente')  // ← Verde, 4s
    } catch (err) {
      error('❌ Error al guardar')          // ← Rojo, 5s
    }
  }

  return <button onClick={handleSave}>Guardar</button>
}
```

✅ **¡Listo!** Toast funciona globalmente en tu app.

---

## 🎯 Tu primer Logger

```javascript
// En cualquier componente:
import { logger } from '../utils/logger'

logger.info('Usuario conectado', { userId: 123 })
logger.error('Fallo la conexión', error)
logger.warn('Algo inesperado pasó')
logger.debug('Info para debugging')  // Solo en dev

// Resultado en DevTools Console:
// [2026-03-27T10:30:45.123Z] [Melo] [INFO] Usuario conectado { userId: 123 }
```

✅ **¡Listo!** Todos tus logs centralizados.

---

## 🎯 Tu primer UI State

```javascript
// Importar:
import { usePlayerStore } from '../store/usePlayerStore'
import { useToast } from '../hooks/useToast'

export function Settings() {
  const { uiState, setUIState } = usePlayerStore()
  const { success, error } = useToast()

  const handleSave = async (data) => {
    // 1. Mostrar loading
    setUIState('settings', 'loading')

    try {
      // 2. Hacer operación
      await window.melo.saveSettings('theme', data)
      
      // 3. Mostrar success
      setUIState('settings', 'success')
      success('Tema cambiado')
      
    } catch (err) {
      // 3. Mostrar error
      setUIState('settings', 'error')
      error('Error al cambiar tema')
    }
  }

  // 4. Usar estado en render
  return (
    <>
      {uiState.settings === 'loading' && <div>Cargando...</div>}
      {uiState.settings === 'success' && <div>✅ Guardado</div>}
      {uiState.settings === 'error' && <div>❌ Error</div>}
      
      <button onClick={() => handleSave({})}>
        {uiState.settings === 'loading' ? 'Guardando...' : 'Guardar'}
      </button>
    </>
  )
}
```

✅ **¡Listo!** Feedback visual en cada acción.

---

## 🎯 Tu primera Animación Suave

```css
/* En tu archivo CSS */
.my-panel {
  transform: translateX(100%);
  transition: transform var(--motion-base) var(--ease-standard);
}

.my-panel.open {
  transform: translateX(0);
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.3);
}

/* ✅ Usa los tokens, es así de simple */
```

Duraciones disponibles:
- `var(--motion-fast)` → 150ms
- `var(--motion-base)` → 200ms
- `var(--motion-slow)` → 300ms

✅ **¡Listo!** Animaciones profesionales.

---

## 🎯 Tu primer Focus Visible (Accesibilidad)

```jsx
<button
  onClick={handleClick}
  aria-label="Guardar cambios"  // ← Para screen readers
  type="button"
>
  Save
</button>

// CSS ya lo maneja automáticamente:
// :focus-visible {
//   outline: 2px solid var(--accent);
//   outline-offset: 2px;
// }

// ✅ Presiona TAB para ver el outline
```

✅ **¡Listo!** Navegación accesible.

---

## 📚 PATRONES COMUNES

### Patrón 1: Guardar Configuración
```javascript
const { success, error } = useToast()

const saveConfig = async (key, value) => {
  try {
    await window.melo.saveSettings(key, value)
    success(`${key} guardado`)
    logger.info(`Config saved: ${key}`)
  } catch (err) {
    error(`Error al guardar ${key}`)
    logger.error(`Config save failed: ${key}`, err)
  }
}
```

### Patrón 2: Cargar Datos
```javascript
const { error: showError } = useToast()
const { setUIState } = usePlayerStore()

useEffect(() => {
  setUIState('data', 'loading')
  
  fetchData()
    .then(data => {
      setUIState('data', 'success')
      setData(data)
    })
    .catch(err => {
      setUIState('data', 'error')
      showError('Error al cargar datos')
      logger.error('Data fetch failed', err)
    })
}, [])
```

### Patrón 3: Operación Async con Feedback
```javascript
const handleAction = async () => {
  const { success, error } = useToast()
  
  try {
    showLoading(true)
    const result = await doAsyncAction()
    success('¡Acción completada!')
    logger.info('Action successful', result)
    return result
  } catch (err) {
    error('Error en la acción')
    logger.error('Action failed', err)
  } finally {
    showLoading(false)
  }
}
```

---

## 🚀 APLICAR A UN COMPONENTE EXISTENTE

### Antes:
```javascript
useEffect(() => {
  window.melo.discordStatus()
    .then(setStatus)
    .catch(() => {})  // ❌ Error silenciado
}, [])
```

### Después:
```javascript
import { useToast } from '../hooks/useToast'
import { logger } from '../utils/logger'

useEffect(() => {
  window.melo.discordStatus()
    .then(status => {
      setStatus(status)
      logger.info('Discord status loaded')
    })
    .catch(err => {
      logger.error('Discord check failed', err)
      // Toast solo si es crítico:
      // showError('Discord no disponible')
    })
}, [])
```

---

## ✨ VARIABLES CSS DISPONIBLES

```css
/* Motion */
--motion-fast: 150ms;             /* Hover states */
--motion-base: 200ms;             /* Panel transitions */
--motion-slow: 300ms;             /* Complex animations */

/* Easing */
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-enter: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-exit: cubic-bezier(0.3, 0, 0.8, 0.15);

/* Colors */
--accent: #fc3c44;
--bg-card: #1c1c1e;
--border: rgba(255,255,255,0.08);
--text-primary: #ffffff;
--text-secondary: rgba(255,255,255,0.55);

/* Sizing */
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
```

---

## 🆘 TROUBLESHOOTING RÁPIDO

| Problema | Solución |
|----------|----------|
| **Toast no aparece** | Verificar `<ToastContainer />` en App.jsx |
| **Logger no funciona** | Abrir DevTools (F12) → Console tab |
| **UI State no actualiza** | Verificar `setUIState('feature', 'state')` |
| **Animación jumping** | Usar `transform` + `opacity`, no `width`/`height` |
| **Focus outline no visible** | Presionar TAB, outline debe aparecer |

---

## 📖 MÁS INFORMACIÓN

- **Guía completa:** `IMPLEMENTATION_GUIDE.md`
- **Resumen ejecutivo:** `PHASE_1_2_SUMMARY.md`
- **Patrones de error:** `errorHandling.example.md`
- **Ejemplo real:** `SettingsPanel.upgraded.jsx`
- **Checklist completo:** `PHASE_1_2_CHECKLIST.md`

---

## 🎓 PRÓXIMO PASO

Aplicar estos patrones en:
1. LoginView
2. CommandPalette
3. PlayerBar
4. Sidebar

¡Cada componente es 5 minutos! 🚀

---

**¿Necesitas ayuda? Revisa la Guía de Implementación o el Checklist.**
