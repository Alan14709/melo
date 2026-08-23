const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const mainSource = fs.readFileSync(
  path.join(__dirname, '..', 'main.js'),
  'utf8'
)
const preloadSource = fs.readFileSync(
  path.join(__dirname, '..', 'preload.js'),
  'utf8'
)

// Los canales del updater se registran en integrations/, no en main.js.
const integrationsDir = path.join(__dirname, '..', 'integrations')
const integrationsSource = fs.readdirSync(integrationsDir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => fs.readFileSync(path.join(integrationsDir, file), 'utf8'))
  .join('\n')

const backendSource = mainSource + '\n' + integrationsSource

const collect = (source, pattern) => {
  const found = new Set()
  for (const match of source.matchAll(pattern)) found.add(match[1])
  return found
}

/**
 * `cleanupAllResources()` libera los handlers de invoke con `removeHandler`.
 * Un canal que no este en esa lista sobrevive al cierre, y si algun dia se
 * vuelve a llamar a `registerIpcHandlers()` sobre el mismo proceso, Electron
 * lanza "Attempted to register a second handler for 'x'".
 *
 * Ojo: `removeAllListeners` NO sirve para handlers de invoke; esa lista es solo
 * para los canales de `ipcMain.on`. Meter un handler ahi no libera nada.
 */
test('todo ipcMain.handle tiene su canal en la lista de limpieza', () => {
  const handled = collect(mainSource, /ipcMain\.handle\('([^']+)'/g)

  // La lista de limpieza es el bloque de strings antes del forEach que llama a
  // removeHandler/removeAllListeners.
  const cleanupBlock = mainSource.slice(0, mainSource.indexOf('.forEach((channel) =>'))
  const declared = collect(cleanupBlock, /^\s+'([a-zA-Z]+:[a-zA-Z-]+)',$/gm)

  const missing = [...handled].filter((channel) => !declared.has(channel))
  assert.deepEqual(
    missing,
    [],
    `canales sin limpieza registrada: ${missing.join(', ')}`
  )
})

test('los canales que expone el preload existen en el backend', () => {
  const invoked = collect(preloadSource, /safeInvoke\('([^']+)'/g)
  const handled = collect(backendSource, /ipcMain\.handle\('([^']+)'/g)

  const orphans = [...invoked].filter((channel) => !handled.has(channel))
  assert.deepEqual(
    orphans,
    [],
    `el preload invoca canales que nadie atiende: ${orphans.join(', ')}`
  )
})

test('los canales que el preload escucha los emite alguien', () => {
  const subscribed = collect(preloadSource, /subscribeIpc\('([^']+)'/g)

  // Un canal que nadie emite es una API muerta en el bridge.
  const orphans = [...subscribed].filter((channel) => !backendSource.includes(`'${channel}'`))
  assert.deepEqual(
    orphans,
    [],
    `el preload escucha canales que nadie emite: ${orphans.join(', ')}`
  )
})

test('el temporizador de apagado se limpia al cerrar la app', () => {
  // Un setTimeout vivo puede impedir que el proceso termine.
  assert.match(mainSource, /function cancelSleepTimer\(/)
  assert.match(
    mainSource,
    /cancelSleepTimer\(\{ silent: true \}\)[\s\S]{0,200}clearInterval\(processMetricsTimer\)/,
    'cancelSleepTimer debe correr en la secuencia de apagado'
  )
})

test('el monitor de recursos atribuye procesos a servicios', () => {
  // Sin el mapa de PID a servicio, el panel no puede decir cual pesa mas.
  assert.match(mainSource, /getOSProcessId\(\)/)
  assert.match(mainSource, /pidToService/)
  assert.match(mainSource, /heaviestService/)
})
