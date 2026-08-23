/**
 * `searchUrl` es una plantilla con `{q}` — la consulta ya codificada.
 * Se guarda como string, no como funcion, porque estos objetos viajan por IPC
 * a main en `switchService()` y una funcion no sobrevive la serializacion.
 * Todas apuntan al mismo origen que `url`, asi que pasan el allowlist de main.
 */
export const SERVICES = {
  appleMusic: {
    id: 'appleMusic',
    name: 'Apple Music',
    url: 'https://music.apple.com',
    color: '#fc3c44',
    icon: 'music',
    searchUrl: 'https://music.apple.com/search?term={q}'
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com',
    color: '#1db954',
    icon: 'headphones',
    searchUrl: 'https://open.spotify.com/search/{q}'
  },
  youtubeMusic: {
    id: 'youtubeMusic',
    name: 'YT Music',
    url: 'https://music.youtube.com',
    color: '#ff0000',
    icon: 'play-circle',
    searchUrl: 'https://music.youtube.com/search?q={q}'
  },
  tidal: {
    id: 'tidal',
    name: 'Tidal',
    url: 'https://listen.tidal.com',
    color: '#00ffff',
    icon: 'waves',
    searchUrl: 'https://listen.tidal.com/search?q={q}'
  },
  deezer: {
    id: 'deezer',
    name: 'Deezer',
    url: 'https://www.deezer.com',
    color: '#a238ff',
    icon: 'radio',
    searchUrl: 'https://www.deezer.com/search/{q}'
  }
}

/** Construye la URL de busqueda de un servicio para una cancion. */
export function buildSearchUrl(service, title, artist) {
  if (!service?.searchUrl || !title) return null
  const query = encodeURIComponent([title, artist].filter(Boolean).join(' '))
  return service.searchUrl.replace('{q}', query)
}
