# Melo

![Version](https://img.shields.io/badge/version-v1.8.0-success)
![Platform](https://img.shields.io/badge/platform-Linux-blue)
![Node](https://img.shields.io/badge/node-20_LTS-339933)
![DRM](https://img.shields.io/badge/DRM-Widevine%20WVCUS-green)
![Stack](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20Vite-black)

Melo es una app de escritorio Linux para música en streaming sobre Electron. Envuelve Apple Music, Spotify, YouTube Music, Tidal y Deezer en una sola interfaz nativa con integraciones de sistema, persistencia de sesión por servicio y soporte DRM con Widevine.

---

## Novedades v1.8.0

### 📊 Monitor de recursos

Nueva pestaña **Rendimiento** en Ajustes. Cada servicio corre en su propio
proceso de Electron, así que se puede atribuir consumo real a cada uno:

- CPU, memoria, número de procesos y tiempo en marcha, con gráficas de línea
- Qué servicio consume más, con su porcentaje del total
- Desglose por proceso con el color de cada servicio
- Bloque de diagnóstico (latencia de cambio, vistas fantasma, fallbacks de GPU)
  visible solo con el puente de depuración activo

### 🌙 Temporizador de apagado

Pausa la música tras 15, 30 o 60 minutos desde el Command Palette. El reloj vive
en el proceso principal, así que sigue corriendo con la ventana minimizada en la
bandeja. Píldora con cuenta atrás y aviso al quedar un minuto.

### 🔀 Contexto entre servicios

El centro de la barra de reproducción muestra lo que el servicio embebido no
puede saber: cuántas veces has puesto esa canción y en qué **otros** servicios.
Sin coincidencias, cae a contexto de sesión y racha.

### 🔎 Buscar la canción en otro servicio

Menú en la canción (o clic derecho) para saltar a Apple Music, YouTube Music,
Tidal o Deezer con la pista ya buscada. Es un menú nativo: los popups del sistema
flotan sobre el BrowserView, cosa que ningún panel HTML puede hacer.

### 🎵 Mini Player como widget

Rediseñado como previsualización: carátula, título, artista, álbum y servicio,
con el fondo teñido por la carátula. Sin controles de reproducción — los trae el
propio servicio, y replicarlos obligaba a inyectar JS en su DOM.

### 🐛 Correcciones importantes

- **Escape y Ctrl+K** dejaban de funcionar en todo el escritorio mientras Melo
  estuviera abierto, incluso minimizado en la bandeja
- **Estadísticas desfasadas un día**: el heatmap agrupaba en UTC mientras el
  resto usaba hora local
- **Anterior y siguiente** nunca funcionaron: dependían de selectores atados al
  idioma de la web. Ahora se envían teclas multimedia reales
- **«Escuchado recientemente»** y el export de historial salían vacíos
- **El ajuste «Estadísticas»** no dejaba de grabar al desactivarlo
- **Tema claro**: la escala de texto estaba invertida y dejaba las cabeceras del
  sidebar blancas sobre blanco

### ♿ Accesibilidad

Focus trap en los modales, patrón ARIA de pestañas en Ajustes, combobox en el
Command Palette, navegación por teclado en los deslizadores y contraste
verificado en cinco temas.

---

## Novedades v1.7.0

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
chmod +x Melo-1.8.0.AppImage
./Melo-1.8.0.AppImage
```

### DEB (Debian / Ubuntu)

```bash
sudo dpkg -i Melo-1.8.0.deb
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
