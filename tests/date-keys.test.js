// Fija una zona horaria negativa ANTES de tocar Date: es justo el caso en el
// que agrupar por toISOString() empujaba las escuchas de la tarde al dia
// siguiente. Debe ir antes de cualquier uso de Date en este archivo.
process.env.TZ = 'America/Mexico_City'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const loadDateKeys = () =>
  import('../renderer/src/utils/dateKeys.js')

test('localDayKey usa el dia LOCAL, no el de UTC', async () => {
  const { localDayKey } = await loadDateKeys()

  // 20:30 hora local. En UTC-6 esto es el dia siguiente a las 02:30Z, que es
  // exactamente lo que rompia el heatmap.
  const evening = new Date(2026, 7, 20, 20, 30, 0)

  assert.equal(localDayKey(evening), '2026-08-20')
  assert.notEqual(
    localDayKey(evening),
    evening.toISOString().split('T')[0],
    'si estos coinciden, la zona horaria del test no se aplico'
  )
})

test('localDayKey rellena mes y dia a dos digitos', async () => {
  const { localDayKey } = await loadDateKeys()
  assert.equal(localDayKey(new Date(2026, 0, 5, 12, 0, 0)), '2026-01-05')
})

test('shiftDayKey cruza mes y año sin desviarse', async () => {
  const { shiftDayKey } = await loadDateKeys()

  assert.equal(shiftDayKey('2026-08-31', 1), '2026-09-01')
  assert.equal(shiftDayKey('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDayKey('2024-02-28', 1), '2024-02-29', 'año bisiesto')
})

test('shiftDayKey sobrevive al cambio de horario de verano', async () => {
  const { shiftDayKey } = await loadDateKeys()

  // Alrededor de los cambios de horario, restar 86400000 ms caia en las 23:00 o
  // la 01:00 del dia vecino y podia saltarse un dia entero.
  for (const start of ['2026-04-05', '2026-10-25', '2026-03-08', '2026-11-01']) {
    const next = shiftDayKey(start, 1)
    assert.equal(shiftDayKey(next, -1), start, `ida y vuelta desde ${start}`)
  }
})

test('shiftDayKey encadenado avanza exactamente un dia por paso', async () => {
  const { localDayKey, shiftDayKey } = await loadDateKeys()

  let key = '2026-02-25'
  const seen = [key]
  for (let i = 0; i < 10; i++) {
    key = shiftDayKey(key, 1)
    seen.push(key)
  }

  assert.equal(seen.length, new Set(seen).size, 'ningun dia repetido')
  assert.equal(seen[10], '2026-03-07')
  assert.equal(localDayKey(new Date(2026, 2, 7, 12, 0, 0)), seen[10])
})

test('main.js agrupa activityMap por dia local, no por toISOString', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '..', 'main.js'),
    'utf8'
  )

  assert.match(
    mainSource,
    /function localDayKey\(/,
    'main.js debe definir localDayKey()'
  )

  const activityBlock = mainSource.slice(
    mainSource.indexOf('const activityMap = {}'),
    mainSource.indexOf('const hourCount = Array(24)')
  )

  assert.ok(activityBlock.length > 0, 'no se encontro el bloque de activityMap')
  assert.match(activityBlock, /localDayKey\(p\.playedAt\)/)
  assert.doesNotMatch(
    activityBlock,
    /toISOString/,
    'activityMap volvio a agrupar en UTC'
  )
})
