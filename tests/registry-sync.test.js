const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

/**
 * El catálogo de servicios está duplicado: `services/registry.js` (ESM, lo
 * consume el renderer) y una copia dentro de `main.js` (CommonJS, no puede
 * importar el módulo ESM). Main la necesita para el allowlist de orígenes, la
 * atribución de procesos y el menú nativo de búsqueda.
 *
 * Mientras la duplicación exista, esto evita que se separen en silencio: un
 * servicio con distinta URL en cada lado bloquearía el switch, y una plantilla
 * de búsqueda solo en un lado dejaría opciones muertas en el menú.
 */

const CAMPOS = ['id', 'name', 'url', 'color', 'searchUrl']

/**
 * Extrae el literal SERVICES de un archivo y lo evalúa.
 *
 * El conteo de llaves ignora las que van dentro de cadenas: las plantillas de
 * búsqueda contienen `{q}`, y un parser ingenuo cortaba el objeto ahí y dejaba
 * servicios sin `searchUrl` — con lo que la comparación pasaba en vacío.
 */
function parseServices(source) {
  const start = source.indexOf('SERVICES = {')
  assert.ok(start !== -1, 'no se encontró el objeto SERVICES')

  const open = source.indexOf('{', start)
  let depth = 0
  let quote = null
  let end = -1

  for (let i = open; i < source.length; i++) {
    const ch = source[i]

    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }

  assert.ok(end !== -1, 'el literal SERVICES no cierra')
  // Literal de datos puro: evaluarlo es exacto y evita regex frágiles.
  return new Function(`return ${source.slice(open, end)}`)()
}

const root = path.join(__dirname, '..')
const fromMain = parseServices(fs.readFileSync(path.join(root, 'main.js'), 'utf8'))
const fromRegistry = parseServices(
  fs.readFileSync(path.join(root, 'services', 'registry.js'), 'utf8')
)

test('ambos registros listan los mismos servicios', () => {
  assert.deepEqual(
    Object.keys(fromMain).sort(),
    Object.keys(fromRegistry).sort()
  )
})

test('cada servicio tiene los mismos datos en los dos registros', () => {
  for (const id of Object.keys(fromRegistry)) {
    for (const field of CAMPOS) {
      // Explícito: si el campo falta en ambos lados, comparar undefined con
      // undefined pasaría sin comprobar nada.
      assert.ok(
        fromRegistry[id][field],
        `${id} no define "${field}" en services/registry.js`
      )
      assert.equal(
        fromMain[id]?.[field],
        fromRegistry[id][field],
        `"${field}" difiere en ${id}: main="${fromMain[id]?.[field]}" registry="${fromRegistry[id][field]}"`
      )
    }
  }
})

test('ninguna plantilla de búsqueda apunta fuera del origen del servicio', () => {
  // main valida el origen antes de cargar: una búsqueda a otro host quedaría
  // bloqueada y el menú no haría nada.
  for (const [id, service] of Object.entries(fromMain)) {
    const base = new URL(service.url).origin
    const search = new URL(service.searchUrl.replace('{q}', 'x')).origin
    assert.equal(search, base, `la búsqueda de ${id} sale de su origen`)
  }
})
