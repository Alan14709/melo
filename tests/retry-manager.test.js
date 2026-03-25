const test = require('node:test')
const assert = require('node:assert/strict')

const { RetryManager } = require('../services/RetryManager')

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}

test('RetryManager reintenta y recupera', async () => {
  const manager = new RetryManager(noopLogger)
  let attempts = 0

  const result = await manager.execute(async () => {
    attempts += 1
    if (attempts < 3) throw new Error('transient')
    return 'ok'
  }, {
    label: 'retry-success',
    maxAttempts: 3,
    initialDelayMs: 1,
    maxDelayMs: 5,
  })

  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
})

test('RetryManager deduplica llamadas concurrentes por label', async () => {
  const manager = new RetryManager(noopLogger)
  let calls = 0

  const task = () => manager.execute(async () => {
    calls += 1
    await new Promise((r) => setTimeout(r, 10))
    return 'shared'
  }, {
    label: 'same-label',
    maxAttempts: 2,
    initialDelayMs: 1,
  })

  const [a, b, c] = await Promise.all([task(), task(), task()])

  assert.equal(a, 'shared')
  assert.equal(b, 'shared')
  assert.equal(c, 'shared')
  assert.equal(calls, 1)
})
