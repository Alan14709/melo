# Melo

![Version](https://img.shields.io/badge/version-v1.6.3-success)
![Platform](https://img.shields.io/badge/platform-Linux-blue)
![Node](https://img.shields.io/badge/node-20_LTS-339933)
![DRM](https://img.shields.io/badge/DRM-Widevine%20WVCUS-green)
![Stack](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20Vite-black)

Melo es una app de escritorio Linux para musica en streaming sobre Electron, con integraciones de sistema, persistencia de sesion por servicio y soporte DRM con Widevine.

## Version actual

- Release estable: **v1.6.3**
- Targets Linux: **AppImage** y **DEB**
- CI/CD: GitHub Actions con publicacion automatica por tag

## Novedades v1.6.3

- Pipeline de release reforzado para castLabs (WVCUS) con fallback por versiones.
- Instalacion robusta de Electron con limpieza total por intento.
- Validacion obligatoria de Widevine antes de permitir build de produccion.
- Bloqueo de publicacion si se activa fallback de debug.
- Workflow opcional de debug para recolectar logs cuando falla release.

## Servicios soportados

- Apple Music
- Spotify
- YouTube Music
- Tidal
- Deezer

## Especificaciones funcionales

### Reproduccion e interfaz

- Shell de reproductor multi-servicio con cambio rapido de proveedor.
- Ultimo servicio persistido entre reinicios.
- Control desde bandeja de sistema (tray).
- Modo inmersivo para UI.
- Volumen persistente.

### Integraciones del sistema

- Media keys globales.
- Notificaciones nativas.
- MPRIS para GNOME/KDE.
- Auto inicio Linux via .desktop.
- Discord Rich Presence.
- Last.fm scrobbling.

### Persistencia y estabilidad

- Sesion persistente por servicio (cookies/localStorage/IndexedDB).
- Manejo de salud y reintentos para procesos criticos.
- Cache local de artwork.
- Estrategias de fallback para GPU/sandbox en Linux.

### DRM y media

- Integracion Widevine para compatibilidad con streaming protegido.
- Configuracion de pipeline para castLabs WVCUS en CI.
- Validacion de libreria Widevine en install:
  - `node_modules/electron/dist/libwidevinecdm.so`

## Stack tecnico

- Electron (main/preload)
- React 18
- Zustand
- Vite
- electron-builder
- electron-updater
- electron-store
- dbus-next
- discord-rpc

## Arquitectura del proyecto

- `main.js`: ciclo de vida Electron, BrowserView, IPC e integraciones.
- `preload.js`: bridge seguro para renderer.
- `renderer/src/`: UI React y estado global.
- `integrations/`: Discord, Last.fm, MPRIS, notificaciones, updater.
- `services/`: retry/health/gpu/autostart/cache/adapters.
- `tests/`: unit tests de componentes de estabilidad.

## Requisitos

- Linux x64
- Node.js 20 LTS
- npm
- git

## Instalacion para desarrollo

```bash
npm install
npm run dev
```

## Scripts principales

```bash
npm run dev
npm run build
npm run test
npm run test:unit
npm run test:syntax
npm run release:linux
npm run release:publish
```

## Build local

```bash
npm install
npm run build
```

Artefactos esperados:

- `dist-electron/Melo-1.6.3.AppImage`
- `dist-electron/melo_1.6.3_amd64.deb`

## Instalacion de artefactos

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

## Pipeline de release (produccion)

Workflow principal:

- `.github/workflows/release.yml`

Reglas clave del pipeline:

1. Ejecuta en `ubuntu-latest` con Node 20.
2. Fija version de app a `1.6.3`.
3. Instala Electron castLabs con fallback secuencial:
   - `28.2.10+wvcus`
   - `27.3.11+wvcus`
   - `26.6.10+wvcus`
4. Nunca usa castLabs 30.x.
5. En cada intento limpia:
   - `node_modules`
   - `~/.cache/electron`
   - `package-lock.json`
6. Hace reintentos de `npm install` por version.
7. Requiere validacion de runtime DRM (archivo `libwidevinecdm.so` o evidencia de artefacto castLabs descargado en cache).
8. Si castLabs falla en todas las versiones:
   - fallback a Electron oficial solo debug
   - marca `DEBUG_BUILD=true`
   - bloquea publicacion de produccion
9. Solo publica release si castLabs fue exitoso.
10. Publicacion idempotente: build + upload de artefactos a release con `softprops/action-gh-release`.
11. El empaquetado fuerza `electronVersion=<version+wvcus>` en electron-builder para evitar 404 por nombre de artefacto.

Workflow opcional de debug:

- `.github/workflows/release-debug.yml`
- Se activa cuando falla `Release Melo` y sube logs como artifact.

## Flujo de release recomendado

1. Confirmar cambios:

```bash
git status
```

2. Crear commit en `main`.

3. Crear tag de release:

```bash
git tag -a v1.6.3 -m "Release 1.6.3"
```

4. Publicar:

```bash
git push origin main
git push origin v1.6.3
```

5. Verificar en GitHub Actions que el job `Release Melo` termine en verde.

## Notas de operacion

- Si `DEBUG_BUILD=true`, el release se bloquea por seguridad.
- El workflow usa `GH_TOKEN` y, si no existe, hace fallback a `github.token` para publicar.
- Para diagnostico de fallos de release, revisar artifacts del workflow `Release Debug Melo`.

## Licencia

MIT
