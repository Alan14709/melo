const test = require('node:test')
const assert = require('node:assert/strict')

const loadRegistry = () => import('../services/registry.js')

test('todos los servicios tienen plantilla de busqueda', async () => {
  const { SERVICES } = await loadRegistry()

  for (const service of Object.values(SERVICES)) {
    assert.ok(service.searchUrl, `${service.id} sin searchUrl`)
    assert.ok(
      service.searchUrl.includes('{q}'),
      `${service.id} sin marcador {q}`
    )
  }
})

test('la URL de busqueda vive en el mismo origen que el servicio', async () => {
  const { SERVICES } = await loadRegistry()

  // main.js valida el origen contra ALLOWED_SERVICE_ORIGINS antes de cargar:
  // si una busqueda apuntara a otro origen, el switch quedaria bloqueado.
  for (const service of Object.values(SERVICES)) {
    const base = new URL(service.url).origin
    const search = new URL(service.searchUrl.replace('{q}', 'test')).origin
    assert.equal(search, base, `${service.id} apunta fuera de su origen`)
  }
})

test('buildSearchUrl codifica titulo y artista', async () => {
  const { SERVICES, buildSearchUrl } = await loadRegistry()

  const url = buildSearchUrl(SERVICES.appleMusic, 'Bad Habit', 'Steve Lacy')
  assert.equal(url, 'https://music.apple.com/search?term=Bad%20Habit%20Steve%20Lacy')
})

test('buildSearchUrl escapa caracteres que romperian la URL', async () => {
  const { SERVICES, buildSearchUrl } = await loadRegistry()

  const url = buildSearchUrl(SERVICES.youtubeMusic, 'Drop It Like It\'s Hot & More', 'Snoop')
  assert.doesNotMatch(url.split('?q=')[1], /[&?#]/, 'la consulta debe ir codificada')
  assert.ok(url.startsWith('https://music.youtube.com/search?q='))
})

test('buildSearchUrl funciona sin artista y devuelve null sin titulo', async () => {
  const { SERVICES, buildSearchUrl } = await loadRegistry()

  assert.equal(
    buildSearchUrl(SERVICES.tidal, 'Windowlicker', null),
    'https://listen.tidal.com/search?q=Windowlicker'
  )
  assert.equal(buildSearchUrl(SERVICES.tidal, '', 'Aphex Twin'), null)
  assert.equal(buildSearchUrl(null, 'Windowlicker', 'Aphex Twin'), null)
})

test('el adaptador usa teclas multimedia reales, no KeyboardEvent sintetico', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'adapters', 'BrowserViewAdapter.js'),
    'utf8'
  )

  // Sin comentarios: el bloque que documenta por que se quito el
  // dispatchEvent menciona KeyboardEvent a proposito.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // Un KeyboardEvent creado desde executeJavaScript llega con isTrusted=false
  // y los servicios lo ignoran para controles de reproduccion.
  assert.doesNotMatch(
    code,
    /new KeyboardEvent\(/,
    'volvio el dispatchEvent sintetico que los servicios ignoran'
  )
  assert.match(code, /sendInputEvent\(\{ type: 'keyDown', keyCode \}\)/)
  assert.match(source, /MediaNextTrack/)
  assert.match(source, /MediaPreviousTrack/)
})
