# Melo

![Version](https://img.shields.io/badge/version-v1.5.0-success)
![Downloads](https://img.shields.io/badge/downloads-see%20releases-blue)
![Platform](https://img.shields.io/badge/platform-Linux-blue)
![Stack](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20Vite-black)

Cliente de escritorio Linux para streaming musical en una sola app.
Incluye integracion con Apple Music, Spotify, YouTube Music, Tidal y Deezer.

## Que es Melo

Melo es un contenedor de servicios de streaming basado en Electron con enfoque Linux-first.
El proyecto esta orientado a experiencia de escritorio real y estabilidad operativa:

- control por bandeja (tray)
- autostart via .desktop
- media keys globales
- notificaciones nativas
- integracion MPRIS (GNOME/KDE)

## Estado del proyecto

- Version objetivo de release: v1.5.0
- Plataforma soportada: Linux
- Build targets: AppImage y DEB
- Estado: listo para QA final de release

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

```bash
npm install --registry https://castlabs-electron-registry.s3.amazonaws.com
npm run dev
```

## Scripts

```bash
npm run test:syntax
npm run test:unit
npm run test
npm run release:linux
npm run release:publish
```

Nota: para publicar release con electron-builder, define antes:

```bash
export MELO_PUBLISH_OWNER="tu_owner"
export MELO_PUBLISH_REPO="tu_repo"
```

## Checklist de release

1. Build Linux actualizado (`npm run release:linux`)
2. Instalacion limpia de DEB
3. Validacion single-instance
4. Validacion MPRIS (play/pause/stop + metadata)
5. Validacion notificaciones (sin spam)
6. Validacion autostart y tray
7. `npm run test` en verde

## Debug opcional

Activar logging verbose de Chromium solo cuando sea necesario:

```bash
MELO_VERBOSE_LOGGING=1 npm run dev
```

## Licencia

MIT
