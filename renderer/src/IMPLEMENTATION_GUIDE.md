# FASE 1 + FASE 2 - GUÍA DE IMPLEMENTACIÓN COMPLETA

## Archivos Creados

### 1. **Toast System**
- `renderer/src/components/Toast.jsx` → Componente individual de notificación
- `renderer/src/components/ToastContainer.jsx` → Contenedor con cola
- `renderer/src/hooks/useToast.js` → Hook para acceso global
- `renderer/src/styles/toast.css` → Estilos + animaciones

**Uso:**
```javascript
import { useToast } from '../hooks/useToast'

export function MyComponent() {
  const { success, error, info } = useToast()
  
  success('¡Guardado!')
  error('Hubo un error')
  info('Información')
}
```

### 2. **Logger Mejorado**
- `renderer/src/utils/logger.js` → Sistema centralizado de logging

**Uso:**
```javascript
import { logger } from '../utils/logger'

logger.info('Acción exitosa')
logger.error('Error ocurrió', err)
logger.warn('Advertencia')
logger.debug('Info de debug')
```

### 3. **UI State System**
- Extendido `renderer/src/store/usePlayerStore.js`
- Nuevo campo: `uiState` → { settings, playback, connection, sync }
- Nueva acción: `setUIState(feature, state)`

**Uso:**
```javascript
const { setUIState, uiState } = usePlayerStore()

// En operación async:
try {
  setUIState('settings', 'loading')
  await saveSettings()
  setUIState('settings', 'success')
} catch (err) {
  setUIState('settings', 'error')
}

// En componente:
if (uiState.settings === 'loading') {
  return <Spinner />
}
```

### 4. **Motion Tokens**
- Actualizado `renderer/src/styles/globals.css`
- Variables: `--motion-fast` (150ms), `--motion-base` (200ms), `--motion-slow` (300ms)
- Easing: `--ease-standard`, `--ease-enter`, `--ease-exit`

**Uso en CSS:**
```css
.element {
  transition: opacity var(--motion-base) var(--ease-standard),
              transform var(--motion-base) var(--ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  .element {
    transition: none;
  }
}
```

### 5. **Accessibility**
- Focus visible (`--accent` outline en todos los elementos focusables)
- `aria-labels` en buttons principales
- `aria-live` en notificaciones
- Soporte para `prefers-reduced-motion`
- Soporte para `prefers-contrast: more`

---

## Matriz de Cambios por Componente

| Componente | Cambio | Prioridad |
|---|---|---|
| SettingsPanel | ✅ Mejorado (errores + logging) | ALTA |
| App.jsx | ✅ Agregado ToastContainer | ALTA |
| usePlayerStore | ✅ Agregado uiState | ALTA |
| globals.css | ✅ Agregados motion tokens + a11y | ALTA |
| Otros componentes | Aplicar pattern en `.catch()` | MEDIA |

---

## Cómo Aplicar los Patrones en Nuevos Componentes

### Paso 1: Importar necesarios
```javascript
import { useToast } from '../hooks/useToast'
import { logger } from '../utils/logger'
import { usePlayerStore } from '../store/usePlayerStore'
```

### Paso 2: Usar en funciones async
```javascript
const handleSave = async (data) => {
  const { success, error: showError } = useToast()
  const { setUIState, uiState } = usePlayerStore()

  try {
    setUIState('myFeature', 'loading')
    
    await window.melo.doSomething(data)
    
    setUIState('myFeature', 'success')
    success('Operación exitosa')
    logger.info('Operación completada', data)
    
  } catch (err) {
    setUIState('myFeature', 'error')
    showError('Error en operación')
    logger.error('Operación falló', err)
  }
}
```

### Paso 3: Mostrar estado en UI
```javascript
const { uiState } = usePlayerStore()

if (uiState.myFeature === 'loading') {
  return <Spinner />
}

if (uiState.myFeature === 'error') {
  return <ErrorBanner />
}
```

### Paso 4: Agregar accessibility
```jsx
<button
  onClick={handleSave}
  aria-label="Guardar cambios"
  disabled={uiState.myFeature === 'loading'}
>
  {uiState.myFeature === 'loading' ? 'Guardando...' : 'Guardar'}
</button>
```

---

## Performance Safety - Cómo Evitar Problemas

### 1. **Evitar Re-renders Innecesarios**

❌ MALO:
```javascript
const { setUIState } = usePlayerStore()  // Re-render en cada cambio de ui state

export function Component() {
  const allState = usePlayerStore()  // Suscribe a TODO el store
  return <div>{allState.uiState.feature}</div>
}
```

✅ BUENO:
```javascript
import { useShallow } from 'zustand/react/shallow'

export function Component() {
  const { uiState } = usePlayerStore(
    useShallow(s => ({ uiState: s.uiState }))
  )
  return <div>{uiState.feature}</div>
}
```

### 2. **Memoization Estratégica**

```javascript
import { useMemo, useCallback } from 'react'

// Callbacks que se pasan a hijos:
const handleSave = useCallback(async (data) => {
  // ...
}, [dependency])

// Transformaciones caras:
const processedData = useMemo(() => {
  return data.map(item => expensiveComputation(item))
}, [data])
```

### 3. **Evitar Layout Thrashing en Animaciones**

✅ USAR transform + opacity (sin layout changes):
```css
.element {
  transition: transform var(--motion-base), opacity var(--motion-base);
}
```

❌ NO USAR (layout thrashing):
```css
.element {
  transition: width, height, margin, padding;
}
```

### 4. **Lazy Load Toast Hook**
```javascript
// En useToast.js - ya está optimizado con useShallow
export function useToast() {
  const { add, remove } = useToastStore(useShallow(state => ({
    add: state.add,
    remove: state.remove,
  })))
  // ...
}
```

---

## Checklist de Implementación

### ✅ Fase 1 - UX Feedback

- [x] Toast System creado y funcionando
  - [x] Componente Toast.jsx
  - [x] Hook useToast.js
  - [x] ToastContainer integrado en App.jsx
  - [x] Estilos toast.css

- [x] Logger mejorado
  - [x] Archivo logger.js creado
  - [x] Métodos: error, warn, info, debug

- [x] UI State System
  - [x] Extendido usePlayerStore con `uiState`
  - [x] Acción `setUIState` agregada
  - [x] Ejemplo en SettingsPanel

- [x] Error Handling Pattern
  - [x] Reemplazados .catch(() => {}) en SettingsPanel
  - [x] Logging centralizado
  - [x] Toast feedback en errores
  - [x] Documentación en errorHandling.example.md

### ✅ Fase 2 - Motion System + Accessibility

- [x] Motion Tokens agregados a globals.css
  - [x] --motion-fast (150ms)
  - [x] --motion-base (200ms)
  - [x] --motion-slow (300ms)
  - [x] --ease-standard, --ease-enter, --ease-exit

- [x] Animaciones aplicadas
  - [x] Settings panel: deslizante con shadow
  - [x] Toast: fade + slide suave
  - [x] Overlay: fade in/out

- [x] Accessibility basics
  - [x] Focus visible en todos los elementos
  - [x] aria-labels en componentes principales
  - [x] aria-live en notificaciones
  - [x] Soporte para prefers-reduced-motion
  - [x] Soporte para prefers-contrast

- [x] Performance Safety
  - [x] useShallow en hooks de store
  - [x] useCallback en callbacks pasados a hijos
  - [x] Animaciones con transform + opacity
  - [x] No layout thrashing

---

## Próximos Pasos (Fase 3+)

1. **Aplicar pattern en otros componentes**
   - LoginView
   - CommandPalette
   - PlayerBar

2. **Mejorar carga de configuración**
   - Agregar loading skeleton
   - Mejor feedback mientras se carga

3. **Agregar analytics**
   - Trackear errores comunes
   - Monitorear performance

4. **Testing**
   - Tests unitarios para hooks
   - Tests de integración para flujos completos

---

## Referencias Rápidas

### Import Toast
```javascript
import { useToast } from '../hooks/useToast'
const { success, error, info } = useToast()
```

### Import Logger
```javascript
import { logger } from '../utils/logger'
logger.info('message')
logger.error('message', error)
```

### Import Store State
```javascript
import { usePlayerStore } from '../store/usePlayerStore'
const { uiState, setUIState } = usePlayerStore()
```

### CSS Variables Disponibles
```css
/* Motion */
var(--motion-fast)     /* 150ms */
var(--motion-base)     /* 200ms */
var(--motion-slow)     /* 300ms */
var(--ease-standard)   /* cubic-bezier(0.4, 0, 0.2, 1) */
var(--ease-enter)      /* cubic-bezier(0.34, 1.56, 0.64, 1) */
var(--ease-exit)       /* cubic-bezier(0.3, 0, 0.8, 0.15) */

/* Color */
var(--accent)          /* #fc3c44 */
var(--bg-card)         /* #1c1c1e */
var(--border)          /* rgba(255,255,255,0.08) */
```

---

## Support & Troubleshooting

### Toast n aparece
- ✓ Verificar que `<ToastContainer />` está en App.jsx
- ✓ Verificar imports en componente
- ✓ Revisar console para errores

### UI State no actualiza
- ✓ Verificar que `setUIState` tiene 2 parámetros (feature, state)
- ✓ Revisar que feature existe en uiState inicial
- ✓ Verificar que componente está suscrito a `uiState`

### Animaciones no son suaves
- ✓ Revisar que usa `transform + opacity` (no width/height)
- ✓ Verificar motion tokens están en `:root`
- ✓ Revisar que no hay 100+ elementos re-renderizando

### Logger no funciona
- ✓ Verificar import correcto
- ✓ Abrir DevTools Console (F12)
- ✓ Log levels: ERROR > WARN > INFO > DEBUG
