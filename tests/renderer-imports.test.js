const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

/**
 * `vite build` no falla por un identificador indefinido: no es un import roto,
 * es una referencia global que solo revienta al ejecutarse. Así se coló un
 * `useRef is not defined` que tumbaba la app en el arranque pese a que el build
 * y los tests unitarios daban verde.
 *
 * Estas comprobaciones cubren esa clase concreta de fallo sin necesidad de
 * navegador: hooks de React y componentes JSX deben estar importados o
 * definidos en el propio archivo.
 */

const RENDERER = path.join(__dirname, '..', 'renderer', 'src')

const HOOKS = [
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useReducer',
  'useLayoutEffect', 'useContext', 'useId', 'useTransition', 'useDeferredValue',
  'useImperativeHandle', 'useSyncExternalStore', 'useShallow',
  'memo', 'forwardRef', 'createContext', 'lazy',
]

// Componentes que el runtime resuelve solo.
const JSX_INTRINSECOS = new Set(['Fragment'])

function listarArchivos(dir) {
  const salida = []
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) salida.push(...listarArchivos(completo))
    else if (/\.jsx?$/.test(entrada.name)) salida.push(completo)
  }
  return salida
}

function analizar(file) {
  const src = fs.readFileSync(file, 'utf8')
  const esJsx = file.endsWith('.jsx')

  const disponibles = new Set()
  for (const m of src.matchAll(/import\s+([\s\S]+?)\s+from\s/g)) {
    for (const name of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) disponibles.add(name[1])
  }
  for (const m of src.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) disponibles.add(m[1])
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) disponibles.add(m[1])

  const cuerpo = src.replace(/^import .*$/gm, '')
  const fallos = []

  for (const hook of HOOKS) {
    const usado = new RegExp(`(?<![\\w.$])${hook}\\s*\\(`).test(cuerpo)
    const viaReact = new RegExp(`React\\.${hook}\\s*\\(`).test(cuerpo)
    if (usado && !viaReact && !disponibles.has(hook)) {
      fallos.push(`usa ${hook}() sin importarlo`)
    }
  }

  if (!esJsx) return [...new Set(fallos)]

  // Un componente puede llegar por una prop desestructurada ({ icon: Icon }) o
  // por destructuring de un import dinámico, formas que no vale la pena parsear
  // con regex. Basta con exigir que el nombre aparezca en algún sitio FUERA de
  // las etiquetas JSX: si solo existe dentro del marcado, no está ligado a nada.
  const sinJsx = cuerpo.replace(/<\/?[A-Za-z][^>]*>/g, ' ')

  for (const m of cuerpo.matchAll(/<([A-Z][\w$]*)[\s/>]/g)) {
    const nombre = m[1]
    if (JSX_INTRINSECOS.has(nombre)) continue
    if (disponibles.has(nombre)) continue
    if (new RegExp(`(?<![\\w.$])${nombre}(?![\\w$])`).test(sinJsx)) continue
    fallos.push(`renderiza <${nombre}> sin importarlo ni definirlo`)
  }

  return [...new Set(fallos)]
}

const archivos = listarArchivos(RENDERER)

test('el renderer tiene archivos que analizar', () => {
  assert.ok(archivos.length > 15, `solo se encontraron ${archivos.length} archivos`)
})

test('ningún archivo usa hooks de React sin importarlos', () => {
  const problemas = []
  for (const file of archivos) {
    for (const fallo of analizar(file).filter((f) => f.includes('sin importarlo)') || f.startsWith('usa '))) {
      problemas.push(`${path.relative(RENDERER, file)}: ${fallo}`)
    }
  }
  assert.deepEqual(problemas, [], `\n  ${problemas.join('\n  ')}`)
})

test('ningún archivo renderiza componentes que no existen en su ámbito', () => {
  const problemas = []
  for (const file of archivos) {
    for (const fallo of analizar(file).filter((f) => f.startsWith('renderiza '))) {
      problemas.push(`${path.relative(RENDERER, file)}: ${fallo}`)
    }
  }
  assert.deepEqual(problemas, [], `\n  ${problemas.join('\n  ')}`)
})
