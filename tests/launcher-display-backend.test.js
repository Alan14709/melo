const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeDisplayBackend,
  chooseDisplayBackend,
  shouldRetryWithSandboxFallback,
  shouldRetryWithSoftwareFallback,
  shouldRetryWithDisplayFallback,
  buildArgs,
} = require('../scripts/electron-launcher')

test('normalizeDisplayBackend acepta auto/x11/wayland', () => {
  assert.equal(normalizeDisplayBackend('AUTO'), 'auto')
  assert.equal(normalizeDisplayBackend('x11'), 'x11')
  assert.equal(normalizeDisplayBackend('wayland'), 'wayland')
  assert.equal(normalizeDisplayBackend('invalid'), 'auto')
})

test('chooseDisplayBackend en auto prefiere x11 en xwayland', () => {
  const runtime = {
    isXWayland: true,
    isWayland: true,
    isX11: false,
    hasWaylandDisplay: true,
    hasXDisplay: true,
  }

  const decision = chooseDisplayBackend(runtime, 'auto')
  assert.equal(decision.backend, 'x11')
  assert.equal(decision.reason, 'auto-xwayland-prefers-x11')
})

test('chooseDisplayBackend respeta forced-wayland y fallback a x11 si no hay wayland', () => {
  const runtime = {
    isXWayland: false,
    isWayland: false,
    isX11: true,
    hasWaylandDisplay: false,
    hasXDisplay: true,
  }

  const decision = chooseDisplayBackend(runtime, 'wayland')
  assert.equal(decision.backend, 'x11')
  assert.equal(decision.fallbackApplied, true)
})

test('shouldRetryWithDisplayFallback dispara en crash temprano wayland', () => {
  const result = shouldRetryWithDisplayFallback({
    code: 133,
    signal: null,
    args: ['.', '--ozone-platform=wayland'],
    runtimeMs: 3000,
    runtime: { hasXDisplay: true },
    displayDecision: { backend: 'wayland' },
    launchMode: 'development',
    stderr: '',
  })

  assert.equal(result, true)
})

test('shouldRetryWithDisplayFallback no dispara en x11 o crash tardío', () => {
  const lateCrash = shouldRetryWithDisplayFallback({
    code: 133,
    signal: null,
    args: ['.', '--ozone-platform=wayland'],
    runtimeMs: 30000,
    runtime: { hasXDisplay: true },
    displayDecision: { backend: 'wayland' },
    launchMode: 'development',
    stderr: '',
  })
  assert.equal(lateCrash, false)

  const x11Mode = shouldRetryWithDisplayFallback({
    code: 133,
    signal: null,
    args: ['.', '--ozone-platform=x11'],
    runtimeMs: 2000,
    runtime: { hasXDisplay: true },
    displayDecision: { backend: 'x11' },
    launchMode: 'development',
    stderr: '',
  })
  assert.equal(x11Mode, false)
})

test('buildArgs aplica namespace-first sin no-sandbox cuando helper es invalido', () => {
  const args = buildArgs(
    ['.'],
    { usable: false },
    'development',
    { gpuVendor: 'nvidia', hasXDisplay: true, isX11: true },
    { backend: 'x11' }
  )

  assert.equal(args.includes('--melo-namespace-sandbox-fallback'), true)
  assert.equal(args.includes('--disable-setuid-sandbox'), true)
  assert.equal(args.includes('--no-sandbox'), false)
  assert.equal(args.includes('--disable-gpu-sandbox'), false)
})

test('buildArgs agrega disable-gpu-sandbox solo cuando no-sandbox esta activo', () => {
  const args = buildArgs(
    ['.', '--no-sandbox'],
    { usable: false },
    'development',
    { gpuVendor: 'nvidia', hasXDisplay: true, isX11: true },
    { backend: 'x11' }
  )

  assert.equal(args.includes('--no-sandbox'), true)
  assert.equal(args.includes('--disable-gpu-sandbox'), true)
})

test('shouldRetryWithSandboxFallback detecta crash temprano de zygote en dev', () => {
  const result = shouldRetryWithSandboxFallback({
    code: null,
    signal: 'SIGTRAP',
    args: ['.', '--ozone-platform=x11'],
    runtimeMs: 3000,
    sandboxStatus: { usable: true },
    launchMode: 'development',
    stderr: 'zygote_host_impl_linux Check failed: Invalid argument',
  })

  assert.equal(result, true)
})

test('shouldRetryWithSandboxFallback no aplica en packaged', () => {
  const result = shouldRetryWithSandboxFallback({
    code: 133,
    signal: 'SIGTRAP',
    args: ['.'],
    runtimeMs: 2000,
    sandboxStatus: { usable: false },
    launchMode: 'packaged',
    stderr: 'zygote_host_impl_linux',
  })

  assert.equal(result, false)
})

test('shouldRetryWithSoftwareFallback aplica para nvidia con sandbox invalido y crash 133', () => {
  const result = shouldRetryWithSoftwareFallback({
    code: 133,
    signal: 'SIGTRAP',
    args: ['.', '--no-sandbox'],
    runtimeMs: 3500,
    sandboxStatus: { usable: false },
    runtime: { gpuVendor: 'nvidia' },
  })

  assert.equal(result, true)
})

test('shouldRetryWithSoftwareFallback no reintenta si ya esta en fallback software', () => {
  const result = shouldRetryWithSoftwareFallback({
    code: 133,
    signal: 'SIGTRAP',
    args: ['.', '--no-sandbox', '--disable-gpu'],
    runtimeMs: 3000,
    sandboxStatus: { usable: false },
    runtime: { gpuVendor: 'nvidia' },
  })

  assert.equal(result, false)
})
