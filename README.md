# Melo

![Version](https://img.shields.io/github/v/release/Alan14709/melo?label=version)
![Downloads](https://img.shields.io/github/downloads/Alan14709/melo/total)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

Tu musica, sin limites.

Cliente de escritorio universal para servicios de streaming.
Apple Music, Spotify, YouTube Music, Tidal y Deezer en una sola app.

## Estado del Proyecto

- Version actual: v1.4.0
- Objetivo: build estable para uso real en Linux, Windows y macOS
- Enfoque de estabilidad: fallback de renderer, health monitoring, retry manager y gate de validacion

## Caracteristicas

- Multi-servicio con sesiones persistentes
- Apple Music con DRM completo (Widevine via Castlabs)
- Discord Rich Presence
- Last.fm scrobbling
- Estadisticas y Melo Wrapped
- Mini player flotante
- Temas: Dark, OLED, Light, Nord, Catppuccin y Custom
- Auto-update
- Fallback de renderer en Linux (GPU fallback y safe mode)
- Health monitor con estados y motivos de degradacion
- Pruebas smoke/stress con reportes JSON

## Novedades v1.4.0

- Diagnostico profundo para fallos de renderer (launch-failed)
- Logging estructurado para post-mortem y CI
- Fallback secuencial de relanzamiento:
  - GPU fallback
  - no-sandbox fallback (safe mode)
  - estado exhausted cuando se agotan mitigaciones
- Metricas de performance:
  - startup time (main -> renderer ready)
  - switching latency
  - tendencia de memoria
- UX de degradacion mejorada con acciones:
  - Reintentar manual
  - Safe Mode
  - Recargar

## Descarga

Descarga la ultima version desde:
https://github.com/Alan14709/melo/releases/latest

Linux:   Melo-*.AppImage o melo_*_amd64.deb
macOS:   Melo-*.dmg
Windows: Melo-*-setup.exe

## Instalacion Por Plataforma

### Linux (AppImage)

1. Descarga `Melo-*.AppImage` desde la seccion **Releases**.
2. Da permisos de ejecucion:

```bash
chmod +x Melo-*.AppImage
```

3. Ejecuta la app:

```bash
./Melo-*.AppImage
```

Notas:
- Si no abre al primer intento, ejecuta desde terminal para ver logs.
- En algunas distros puede requerirse instalar librerias multimedia del sistema.

### Linux (.deb) Reinstalacion Limpia

Para pruebas de release en entorno limpio:

```bash
cd /ruta/al/proyecto
sudo dpkg --purge melo || true
rm -rf ~/.config/melo ~/.config/melo-wrapper ~/.cache/melo ~/.cache/melo-wrapper ~/.local/share/melo
sudo dpkg -i dist-electron/melo_1.4.0_amd64.deb
sudo apt-get install -f -y
```

Verificar instalacion:

```bash
dpkg -l | grep -E '^ii\s+melo\s'
dpkg -s melo | grep -E '^(Package|Version|Status):'
which melo
```

### macOS (DMG)

1. Descarga el archivo `.dmg` desde **Releases**.
2. Abre el DMG y arrastra **Melo** a `Applications`.
3. Inicia Melo desde Aplicaciones.

Si macOS bloquea la app por seguridad:
- Clic derecho sobre Melo -> `Abrir`.
- O en `System Settings -> Privacy & Security` permite ejecutar la app.

### Windows (EXE)

1. Descarga el instalador `.exe` desde **Releases**.
2. Ejecuta el instalador.
3. Sigue el asistente de instalacion (NSIS).

Si SmartScreen muestra advertencia:
- Selecciona `More info` -> `Run anyway`.

## Instalacion Para Desarrollo

Requisitos:
- Node.js 20+
- npm

Pasos:

```bash
npm install --registry https://castlabs-electron-registry.s3.amazonaws.com
npm run dev
```

## Gate de Validacion Linux

Se incluye gate automatizado para smoke/stress en build empaquetado:

```bash
./gate.sh
```

Resultados:

- `artifacts/summary.json` con veredicto global (`PASS`, `FAIL`, `INVALID_ENVIRONMENT`)
- `artifacts/run-*/smoke.log` y `artifacts/run-*/stress.log`
- reportes por corrida y metricas de fallback

Cuando no hay sesion grafica valida (sin `DISPLAY`/`WAYLAND_DISPLAY`), el gate clasifica correctamente:

- `INVALID_ENVIRONMENT`
- `reason: no_graphical_display`

## Builds De Distribucion

```bash
npm run release:linux
npm run release:mac
npm run release:win
```

Build para todas las plataformas:

```bash
npm run release:all
```

Publicar release automaticamente en GitHub:

```bash
npm run release:publish
```

## Auto-Update

Melo usa `electron-updater` con GitHub Releases.

- Crea un tag versionado, por ejemplo: `v1.0.0`.
- Publica la release en GitHub.
- La app detecta nuevas versiones en instalaciones empaquetadas.

## Observabilidad y Debug

- Metricas de runtime disponibles via bridge/debug:
  - fallback triggers (GPU / no-sandbox)
  - launch success/failure rate
  - retry metrics
  - health metrics
  - latencia de switching y uso de memoria
- Logs estructurados para analisis en CI/CD y soporte.

## Solucion De Problemas

- Linux sandbox/GPU:
  - Usa el gate y revisa `artifacts/summary.json` para validar el entorno.
  - Si hay launch-failed, revisar logs de fallback y estado de renderer.
- Sin audio o DRM:
  - Verifica que usas la build de Castlabs incluida por el proyecto.
- Fallo al construir iconos:
  - Asegura dependencias del sistema para conversion de iconos (ImageMagick/herramientas nativas).

## Disclaimer

Melo no esta afiliado con Apple, Spotify ni ningun servicio de streaming.
Es un wrapper independiente de codigo abierto para uso personal.

## Licencia

MIT
