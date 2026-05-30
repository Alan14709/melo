# Melo

![Version](https://img.shields.io/badge/version-v1.7.0-success)
![Platform](https://img.shields.io/badge/platform-Linux-blue)
![Node](https://img.shields.io/badge/node-20_LTS-339933)
![DRM](https://img.shields.io/badge/DRM-Widevine%20WVCUS-green)
![Stack](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20Vite-black)

Melo es una app de escritorio Linux para música en streaming sobre Electron. Envuelve Apple Music, Spotify, YouTube Music, Tidal y Deezer en una sola interfaz nativa con integraciones de sistema, persistencia de sesión por servicio y soporte DRM con Widevine.

---

## Novedades v1.7.0

### 🎨 UI Redesign completo

**Estadísticas**
- Hero editorial con tiempo total y artista top
- Racha de escucha (streak) con récord histórico
- Tarjeta Melo Monthly: resumen visual de tiempo, artista, canción y servicio top
- Sección de reproducción reciente desde el historial en vivo
- Insights en lenguaje natural generados desde los datos de actividad
- Cada sección en su propio card oscuro para garantizar legibilidad

**Sidebar**
- Grupos con headers de sección (Servicios / Melo)
- Indicador activo: barra lateral con el color del servicio
- Pip animado de now-playing en el servicio activo
- Toggle de Focus Mode integrado

**Command Palette**
- Acciones agrupadas por categoría (Servicios / Reproducción / Navegación / Interfaz)
- Hints de teclado por acción
- Footer con guía de navegación (↑↓ / ↵ / ⌘K)

**Settings Panel**
- Navegación por 6 tabs: Servicios · Apariencia · Sistema · Integraciones · Atajos · Datos

### 🎯 Focus Mode
- Nuevo modo de concentración: sidebar, topbar y playerbar se difuminan a baja opacidad
- Cada elemento recupera opacidad completa al pasar el cursor
- Oculta banners de actualización, offline y salud del sistema
- Toggle desde sidebar o Command Palette

### 🔧 Estabilidad de BrowserView
- `scheduleBoundsUpdate(delayMs)` centralizado — un único path debounced para todos los eventos de resize
- Handlers adicionales: `moved`, `enter-full-screen`, `leave-full-screen`, `restore`
- Bounds integer-aligned (`Math.floor`) para evitar drift en pantallas con DPI fraccional
- Constantes `TOP_HEIGHT` y `BOTTOM_HEIGHT` corregidas para coincidir con los tokens CSS del layout
- Auto-resize de Electron deshabilitado en BrowserViews — bounds manuales con control total
- **Bug de loading bar resuelto**: `did-stop-loading`, `did-finish-load`, completación de switch y timeout de lock ahora envían `isLoading: false` correctamente

### ⌨️ Teclado
- **Space** ya no se intercepta desde BrowserViews — Apple Music, Spotify y el resto lo reciben de forma nativa (scroll, typing, etc.)
- **K** es el nuevo shortcut de play/pause (estilo YouTube / VLC)

### 🌈 Gradiente de artwork
- Opacidad de capas reducida para mejorar legibilidad del texto sobre el gradiente
- Viñeta reforzada en las áreas de contenido
- Intensidad del chroma drift reducida
- Scrim del stats-view en 0.76 de opacidad

---

## Servicios soportados

| Servicio | Shortcut |
|---|---|
| Apple Music | `⌘1` / `Ctrl+1` |
| Spotify | `⌘2` / `Ctrl+2` |
| YouTube Music | `⌘3` / `Ctrl+3` |
| Tidal | `⌘4` / `Ctrl+4` |
| Deezer | `⌘5` / `Ctrl+5` |

---

## Especificaciones funcionales

### Reproducción e interfaz

- Shell multi-servicio con cambio rápido de proveedor
- Último servicio persistido entre reinicios
- Control desde bandeja de sistema (tray)
- Modo inmersivo y Focus Mode
- Volumen persistente
- Mini Player (Picture-in-Picture)

### Estadísticas de escucha

- Historial de reproducción en tiempo real
- Resumen por período: hoy, semana, mes, año, todo
- Top artistas y canciones con barras de progreso
- Desglose de tiempo por servicio
- Heatmap de actividad anual (estilo GitHub)
- Racha de días consecutivos
- Exportación JSON

### Integraciones del sistema

- Media keys globales
- Notificaciones nativas
- MPRIS para GNOME / KDE
- Auto inicio Linux vía `.desktop`
- Discord Rich Presence
- Last.fm scrobbling

### Persistencia y estabilidad

- Sesión persistente por servicio (cookies / localStorage / IndexedDB)
- Manejo de salud y reintentos para procesos críticos
- Caché local de artwork
- Estrategias de fallback para GPU/sandbox en Linux

### DRM y media

- Integración Widevine para streaming protegido
- Pipeline castLabs WVCUS en CI
- Validación de `libwidevinecdm.so` en install

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Shell | Electron (main / preload) |
| UI | React 18 + Vite |
| Estado | Zustand |
| Empaquetado | electron-builder + electron-updater |
| Persistencia | electron-store |
| Integraciones | dbus-next, discord-rpc |

---

## Arquitectura del proyecto

```
main.js              — ciclo de vida Electron, BrowserView, IPC, integraciones
preload.js           — bridge seguro para renderer
renderer/src/        — UI React y estado global (Zustand)
  components/        — App, Sidebar, StatsView, CommandPalette, SettingsPanel…
  store/             — usePlayerStore (estado global)
  styles/            — globals.css, artwork-gradient.css, themes.css
integrations/        — Discord, Last.fm, MPRIS, notificaciones, updater
services/            — retry, health, gpu, autostart, cache, adapters
tests/               — unit tests de componentes de estabilidad
```

---

## Requisitos

- Linux x64
- Node.js 20 LTS
- npm
- git

---

## Instalación para desarrollo

```bash
npm install
npm run dev
```

## Scripts principales

```bash
npm run dev          # dev server + Electron
npm run build        # build de producción (Vite + electron-builder)
npm run test
npm run test:unit
npm run test:syntax
npm run release:linux
npm run release:publish
```

---

## Instalación de artefactos

### AppImage (cualquier distro)

```bash
chmod +x Melo-1.7.0.AppImage
./Melo-1.7.0.AppImage
```

### DEB (Debian / Ubuntu)

```bash
sudo dpkg -i Melo-1.7.0.deb
sudo apt-get install -f -y
```

---

## Pipeline de release (producción)

Workflow principal: `.github/workflows/release.yml`

1. Ejecuta en `ubuntu-latest` con Node 20
2. Instala Electron castLabs con fallback secuencial (`28.x`, `27.x`, `26.x` WVCUS)
3. Valida runtime DRM (`libwidevinecdm.so`) antes de build
4. Si castLabs falla en todas las versiones → fallback debug, bloquea publicación
5. Solo publica release si castLabs fue exitoso
6. Publicación idempotente con `softprops/action-gh-release`

### Flujo de release manual

```bash
# 1. Bump de versión en package.json
# 2. Commit + tag
git tag -a v1.x.x -m "Release 1.x.x"

# 3. Push
git push origin main
git push origin v1.x.x
```

---

## Licencia

MIT
