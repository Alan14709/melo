# Melo

Tu musica, sin limites.

Cliente de escritorio universal para servicios de streaming.
Apple Music, Spotify, YouTube Music, Tidal y Deezer en una sola app.

## Caracteristicas

- Multi-servicio con sesiones persistentes
- Apple Music con DRM completo (Widevine via Castlabs)
- Discord Rich Presence
- Last.fm scrobbling
- Estadisticas y Melo Wrapped
- Mini player flotante
- Temas: Dark, OLED, Light, Nord, Catppuccin y Custom
- Auto-update

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

## Solucion De Problemas

- Linux sandbox/GPU:
  - Si hay errores de GPU/sandbox, inicia con los scripts de desarrollo del proyecto.
- Sin audio o DRM:
  - Verifica que usas la build de Castlabs incluida por el proyecto.
- Fallo al construir iconos:
  - Asegura dependencias del sistema para conversion de iconos (ImageMagick/herramientas nativas).

## Disclaimer

Melo no esta afiliado con Apple, Spotify ni ningun servicio de streaming.
Es un wrapper independiente de codigo abierto para uso personal.

## Licencia

MIT
