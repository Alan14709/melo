# Melo

![Version](https://img.shields.io/badge/version-v1.5.3-success)
![Downloads](https://img.shields.io/badge/downloads-see%20releases-blue)
![Platform](https://img.shields.io/badge/platform-Linux-blue)
![DRM](https://img.shields.io/badge/DRM-Widevine%20%2B%20HEVC-green)
![Stack](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20Vite-black)

Cliente de escritorio Linux para streaming musical en una sola app.
Incluye integracion con **Apple Music, Spotify, YouTube Music, Tidal y Deezer** con DRM completo.

## Que es Melo

Melo es un contenedor de servicios de streaming basado en Electron con enfoque Linux-first.
El proyecto esta orientado a experiencia de escritorio real y estabilidad operativa:

- control por bandeja (tray)
- autostart via .desktop
- media keys globales
- notificaciones nativas
- integracion MPRIS (GNOME/KDE)
- **DRM Widevine con codecs HEVC/VP9**
- **Sesión persistente por servicio**

## Estado del proyecto

- Version actual de release: **v1.5.3**
- Plataforma soportada: Linux
- Build targets: AppImage y DEB
- Estado: publicado en produccion
- DRM: ✅ Apple Music + YouTube funcional
- Session Persistence: ✅ Cookies/localStorage/IndexedDB guardadas
- Release Automation: ✅ Fully automated CI/CD

## Novedades v1.5.3

### 🎵 Apple Music & YouTube - DRM Fixes

- ✅ **Apple Music sin "Update Browser"**: Chrome UA moderno (no Safari, no Electron detection)
- ✅ **Lyrics funcionales**: Sesión independiente limpia por servicio
- ✅ **YouTube sin congelamiento a 59s**: UA estable + partición dedicada
- ✅ **Codecs HEVC/VP9 habilitados**: PlatformHEVCDecoderSupport activado
- ✅ **DRM Widevine mejorado**: Enable-widevine-cdm + plugins integrados
- Ver detalles: [APPLE_MUSIC_DRM_FIX.md](./APPLE_MUSIC_DRM_FIX.md)

### 💾 Persistencia de Sesión

- ✅ **userData path explícito**: `~/.config/Melo/`
- ✅ **Particiones persistentes por servicio**: apple-music, youtube, spotify, tidal, deezer
- ✅ **Cookies guardadas en disco**: No se pierden al reiniciar
- ✅ **localStorage/IndexedDB persistente**: Datos de usuario preservados
- ✅ **Login no se pierde**: Entre reinicios de app mantiene sesión
- ✅ **Permisos centralizados**: Media, fullscreen, clipboard configurados por servicio

### 🚀 Release Automation

- ✅ **Script `release.sh` totalmente automatizado**: 12 pasos integrados
- ✅ **Pre-flight validation**: 6 checks antes de iniciar
- ✅ **Clean build from scratch**: node_modules + dist + caches
- ✅ **Verified artifacts**: Verifica AppImage + .deb existen
- ✅ **Git operations**: Commit + tag + push automatizado
- ✅ **GitHub release**: Crea release automáticamente (si `gh` CLI disponible)
- ✅ **Fail-fast safety**: 17 validaciones, se detiene en primer error
- Ver detalles: [RELEASE_GUIDE.md](./RELEASE_GUIDE.md)
- Ejecución: `./release.sh` (6-7 minutos, cero pasos manuales)

## Novedades v1.5.2

- Sistema de feedback UX con toasts en cola, autocierre y animaciones.
- Logger centralizado para trazabilidad de errores y eventos de UI.
- Mejoras de accesibilidad WCAG 2.1 AA (focus-visible, etiquetas ARIA y soporte semantic HTML).
- Respeto de `prefers-reduced-motion` para experiencia accesible.
- Refinamientos de estabilidad Linux en MPRIS, deduplicacion de eventos y hardening de metadata.
- Flujo de release automatizado por tags `v*` via GitHub Actions.

## Stack tecnico

- Electron (main/preload)
- React 18 + Zustand (renderer)
- Vite (build frontend)
- electron-store (persistencia de settings)
- dbus-next (MPRIS)
- discord-rpc (Rich Presence)
- electron-updater (actualizaciones)

## Arquitectura 

### Main process

- Gestion de BrowserView por servicio activo
- Orquestacion de IPC
- Integraciones de sistema (tray, shortcuts, notificaciones, MPRIS)
- Persistencia de configuraciones
- Fallback de estabilidad (GPU/sandbox)

### Preload bridge

- API segura expuesta a renderer via contextBridge
- Wrappers de IPC con manejo de errores

### Renderer

- UI React (views, settings, player shell)
- Store global Zustand para estado de app
- Tema dinamico por artwork + fallback de tema base

## Funcionalidad incluida

### Core

- Multi-servicio con ultima sesion recordada
- Single instance lock + focus de instancia activa
- Modo inmersivo (oculta sidebar, expande contenido)
- Volumen persistente

### Integraciones

- Tray menu con acciones rapidas
- Autostart Linux (`~/.config/autostart/melo.desktop`)
- Media keys globales (play/pause, next, previous)
- Notificaciones de cambio de track
- MPRIS (`org.mpris.MediaPlayer2.melo`)
- Discord Rich Presence
- Last.fm scrobbling

### Estabilidad y performance

- Debounce/dedupe de `media:update` en main process
- Deduplicacion de `PropertiesChanged` en MPRIS
- Hardening de metadata MPRIS (limpieza en estado idle/stopped)
- Artwork cache local en `~/.cache/melo/art`
- Logging verbose desactivado por defecto

## Estructura relevante del repo

- `main.js`: ciclo de vida Electron + IPC + integraciones
- `preload.js`: bridge seguro entre renderer y main
- `renderer/src/`: app React (UI)
- `integrations/`: Discord, Last.fm, MPRIS, notificaciones, updater
- `services/`: autostart, cache, health/retry, adapters
- `tests/`: unit tests de modulos criticos

## Instalacion

### AppImage

```bash
chmod +x Melo-*.AppImage
./Melo-*.AppImage
```

### DEB

```bash
sudo dpkg -i dist-electron/melo_*.deb
sudo apt-get install -f -y
```

## Reinstalacion limpia para QA (.deb)

```bash
pkill -f '/melo|Melo' || true
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$HOME/.melo-backups"
[ -d "$HOME/.config/melo" ] && mv "$HOME/.config/melo" "$HOME/.melo-backups/melo-config-$TS"
[ -d "$HOME/.cache/melo" ] && mv "$HOME/.cache/melo" "$HOME/.melo-backups/melo-cache-$TS"
sudo dpkg --purge melo || true
sudo dpkg -i dist-electron/melo_*.deb
sudo apt-get install -f -y
```

Verificacion rapida:

```bash
dpkg -s melo | grep -E '^(Package|Version|Status):'
which melo
```

## Desarrollo

Requisitos:

- Node.js 20+
- npm
- git

```bash
npm install
npm run dev
```

## Release Automation (v1.5.3+)

### Quick Start

```bash
# 1. Verificar prerequisitos
git status               # Debe estar limpio
git branch              # Debe ser 'main'
git tag | grep v1.5.3   # Debe estar vacío

# 2. Ejecutar release (único comando, 6-7 minutos)
./release.sh

# 3. Verificar éxito
git tag | grep v1.5.3
ls -lh dist-electron/Melo-*.AppImage
```

### Qué hace el script

| Paso | Acción | Verificación |
|------|--------|-------------|
| 1 | Pre-flight checks | 6 validaciones |
| 2 | Clean artifacts | node_modules, dist, caches |
| 3 | npm install | Instalación fresh |
| 4 | Build project | Vite + Electron Builder |
| 5 | Verify artifacts | AppImage + .deb |
| 6 | Update version | 1.5.2 → 1.5.3 |
| 7 | Git commit | Mensaje descriptivo |
| 8 | Git tag | Crea v1.5.3 |
| 9 | Git push | push origin main |
| 10 | GitHub release | (Si `gh` CLI disponible) |

**Status**: ✅ Production-ready, fully automated, fail-fast design

Ver guía completa: [RELEASE_GUIDE.md](./RELEASE_GUIDE.md)

## Scripts

```bash
npm run test:syntax
npm run test:unit
npm run test
npm run release:linux
```

Nota: `release.sh` maneja toda la orquestación de release, incluyendo versioning y push a GitHub.

## Checklist de release (automated via release.sh)

El script `release.sh` automáticamente verifica:

1. ✅ Build Linux actualizado
2. ✅ Artefactos validados (AppImage, .deb)
3. ✅ Version actualizada en package.json
4. ✅ Git commit creado
5. ✅ Tag v1.5.3 creado
6. ✅ Push a main completado
7. ✅ GitHub release creada (opcional)

Ejecución: `./release.sh` (única línea necesaria)

## Debug opcional

Activar logging verbose de Chromium solo cuando sea necesario:

```bash
MELO_VERBOSE_LOGGING=1 npm run dev
```

## Licencia

MIT
