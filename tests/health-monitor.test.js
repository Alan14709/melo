const test = require('node:test')
const assert = require('node:assert/strict')

const { HealthMonitor } = require('../services/HealthMonitor')

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}

test('HealthMonitor no marca stale_state sin timestamp inicial', () => {
  const playbackState = {
    getCurrent() {
      return { isPlaying: false, timestamp: 0 }
    },
  }

  const monitor = new HealthMonitor(playbackState, noopLogger)
  monitor.recordAdapterAction()
  const status = monitor.check()

  assert.equal(status.status, 'healthy')
  assert.equal(status.reason, null)
})

test('HealthMonitor detecta adapter timeout cuando esta reproduciendo', () => {
  const now = Date.now()
  const playbackState = {
    getCurrent() {
      return { isPlaying: true, timestamp: now }
    },
  }

  const monitor = new HealthMonitor(playbackState, noopLogger)
  monitor.lastAdapterActionTime = now - 5000

  const status = monitor.check()

  assert.equal(status.status, 'error')
  assert.equal(status.reason, 'adapter_timeout')
})
