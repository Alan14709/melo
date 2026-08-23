/**
 * Claves de dia en hora LOCAL, compartidas por todo el renderer.
 *
 * No usar toISOString(): agrupa en UTC y en zonas horarias negativas (p.ej.
 * UTC-6) todo lo escuchado despues del corte cae en el dia siguiente. Eso
 * desalineaba el heatmap y rompia rachas activas.
 *
 * main.js tiene una copia identica en `localDayKey()`; las dos deben coincidir
 * porque el renderer compara sus claves contra el `activityMap` que arma main.
 */

export function localDayKey(timestamp) {
  const d = new Date(timestamp)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Clave del dia de hoy en hora local. */
export function todayKey() {
  return localDayKey(Date.now())
}

/** Desplaza una clave de dia N dias (negativo = hacia atras) sin cruzar a UTC. */
export function shiftDayKey(key, deltaDays) {
  const [year, month, day] = key.split('-').map(Number)
  // Mediodia local evita que el horario de verano empuje la fecha al dia vecino.
  const d = new Date(year, month - 1, day, 12, 0, 0, 0)
  d.setDate(d.getDate() + deltaDays)
  return localDayKey(d)
}
