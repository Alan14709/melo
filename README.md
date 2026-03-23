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
- Temas: Dark, OLED, Light, Nord, Catppuccin, Custom
- Auto-update

## Instalacion

Linux:
	chmod +x Melo-*.AppImage
	./Melo-*.AppImage

macOS:
	Descargar el DMG desde Releases

Windows:
	Descargar el instalador .exe desde Releases

## Desarrollo

	npm install
	npm run dev

## Build

	npm run release:linux
	npm run release:mac
	npm run release:win

## Disclaimer

Melo no esta afiliado con Apple, Spotify ni ningun
servicio de streaming. Es un wrapper independiente
de codigo abierto para uso personal.

## Licencia

MIT
