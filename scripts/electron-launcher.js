#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const EARLY_CRASH_WINDOW_MS = Number(process.env.MELO_EARLY_CRASH_WINDOW_MS || 12000)

const CONFLICTING_GPU_FLAGS = new Set([
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-zero-copy',
  '--disable-gpu-watchdog',
  '--use-gl=desktop',
  '--use-gl=egl',
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
])

function detectRuntimeContext() {
  const sessionType = process.env.XDG_SESSION_TYPE || 'unknown'
  const isWayland = Boolean(process.env.WAYLAND_DISPLAY || sessionType === 'wayland')
  const isXWayland = Boolean(isWayland && process.env.DISPLAY)
  const isX11 = Boolean(process.env.DISPLAY) && !isWayland
  const gpuVendor = fs.existsSync('/proc/driver/nvidia/version') ? 'nvidia' : 'unknown'

  return {
    platform: process.platform,
    sessionType,
    isWayland,
    isXWayland,
    isX11,
    gpuVendor,
  }
}

function detectSandboxStatus(electronBinary) {
  const helperPath = path.join(path.dirname(electronBinary), 'chrome-sandbox')

  if (process.platform !== 'linux') {
    return {
      helperPath,
      exists: false,
      modeOctal: null,
      ownerUid: null,
      isSetuidBit: false,
      usable: true,
      reason: 'not-linux',
    }
  }

  try {
    if (!fs.existsSync(helperPath)) {
      return {
        helperPath,
        exists: false,
        modeOctal: null,
        ownerUid: null,
        isSetuidBit: false,
        usable: false,
        reason: 'helper-not-found',
      }
    }

    const stat = fs.statSync(helperPath)
    const isSetuidBit = Boolean(stat.mode & 0o4000)
    const ownerUid = Number(stat.uid)
    const usable = isSetuidBit && ownerUid === 0

    return {
      helperPath,
      exists: true,
      modeOctal: (stat.mode & 0o7777).toString(8),
      ownerUid,
      isSetuidBit,
      usable,
      reason: usable ? 'ok' : (ownerUid !== 0 ? 'owner-not-root' : 'missing-setuid-4755'),
    }
  } catch (error) {
    return {
      helperPath,
      exists: false,
      modeOctal: null,
      ownerUid: null,
      isSetuidBit: false,
      usable: false,
      reason: `stat-failed:${error.message}`,
    }
  }
}

function detectLaunchMode(baseArgs) {
  if (process.env.MELO_FORCE_PACKAGED === '1') return 'packaged'
  if (process.env.MELO_FORCE_PACKAGED === '0') return 'development'
  if (process.env.VITE_DEV_SERVER_URL) return 'development'
  if (process.env.npm_lifecycle_event) return 'development'

  const firstArg = String(baseArgs[0] || '')
  if (firstArg === '.' || firstArg.endsWith('.js') || firstArg.endsWith('.mjs')) {
    return 'development'
  }

  return 'packaged'
}

function tryFixSandboxPermissions(helperPath, launchMode) {
  const isDev = launchMode === 'development'
    || process.env.NODE_ENV === 'development'
    || process.env.MELO_DEV_MODE === '1'

  if (process.platform !== 'linux' || !isDev || !helperPath) return false

  try {
    const stat = fs.statSync(helperPath)
    const ownerUid = Number(stat.uid)
    const hasSetuid = Boolean(stat.mode & 0o4000)

    if (ownerUid !== 0 || !hasSetuid) {
      console.warn('[MeloLauncher] Sandbox helper lost permissions. Run: '
        + `sudo chown root:root ${helperPath} && sudo chmod 4755 ${helperPath}`)
      return false
    }

    return true
  } catch {
    return false
  }
}

function buildArgs(baseArgs, sandboxStatus, launchMode, runtime) {
  let args = [...baseArgs]
  const isPackaged = launchMode === 'packaged'

  // En produccion no permitimos no-sandbox ni disable-setuid-sandbox.
  if (isPackaged) {
    return args.filter((arg) => arg !== '--no-sandbox' && arg !== '--disable-setuid-sandbox')
  }

  const isLinux = process.platform === 'linux'
  const isNvidia = runtime?.gpuVendor === 'nvidia'
  const sandboxInvalid = !sandboxStatus?.usable

  if (isLinux && sandboxInvalid) {
    if (!args.includes('--melo-namespace-sandbox-fallback')) args.push('--melo-namespace-sandbox-fallback')
    if (!args.includes('--no-sandbox')) args.push('--no-sandbox')
    if (!args.includes('--disable-setuid-sandbox')) args.push('--disable-setuid-sandbox')
  }

  if (isLinux && isNvidia && sandboxInvalid) {
    if (!args.includes('--disable-gpu-sandbox')) args.push('--disable-gpu-sandbox')
    args = args.filter((arg) => !String(arg).startsWith('--use-gl='))
  }

  if (isLinux) {
    args = args.filter((arg) => !String(arg).startsWith('--ozone-platform='))
    if (runtime?.isWayland && !runtime?.isXWayland) {
      args.push('--ozone-platform=wayland')
    } else {
      args.push('--ozone-platform=x11')
    }
  }

  return args
}

function stripResetArgs(args) {
  return args.filter((arg) => arg !== '--melo-gpu-reset')
}

function stripConflictingGpuArgs(args) {
  return args.filter((arg) => {
    if (!arg) return false
    if (CONFLICTING_GPU_FLAGS.has(arg)) return false
    if (arg.startsWith('--use-gl=')) return false
    return true
  })
}

function hasNoSandboxArgs(args) {
  return args.includes('--no-sandbox')
}

function hasSoftwareFallbackArgs(args) {
  return args.includes('--melo-emergency-software-gpu') || args.includes('--disable-gpu')
}

function isEarlyCrash(runtimeMs) {
  return Number(runtimeMs || 0) <= EARLY_CRASH_WINDOW_MS
}

function isZygoteFailure(stderr = '') {
  const text = String(stderr || '')
  return text.includes('zygote_host_impl_linux')
    || text.includes('Argumento inválido')
    || text.includes('Invalid argument')
    || text.includes('Check failed:')
}

function shouldRetryWithSandboxFallback({ code, signal, args, runtimeMs, sandboxStatus, launchMode, stderr }) {
  if (process.platform !== 'linux') return false
  if (launchMode === 'packaged') return false
  if (hasNoSandboxArgs(args)) return false
  if (!isEarlyCrash(runtimeMs)) return false

  // Detectar fallo de zygote por namespace restrictions (AppArmor/Ubuntu 23.10+).
  // Aunque el helper sea usable (root+setuid), forzamos fallback a no-sandbox en dev.
  if (isZygoteFailure(stderr)) return true

  // Lógica original: fallback de sandbox cuando helper no es usable.
  if (sandboxStatus?.usable !== false) return false
  if (!args.includes('--melo-namespace-sandbox-fallback') && !args.includes('--disable-setuid-sandbox')) return false
  if (signal === 'SIGTRAP' || signal === 'SIGABRT') return true
  if (code === 133 || code === 134) return true
  return false
}

function shouldRetryWithSoftwareFallback({ code, signal, args, runtimeMs, sandboxStatus, runtime }) {
  if (process.platform !== 'linux') return false
  if (hasSoftwareFallbackArgs(args)) return false

  const sandboxInvalidEffective = !sandboxStatus?.usable || hasNoSandboxArgs(args)
  const isCrash133 = code === 133 || signal === 'SIGTRAP' || signal === 'SIGABRT'
  const isNvidiaGpuCrash = runtime?.gpuVendor === 'nvidia'
    && sandboxInvalidEffective
    && isCrash133

  if (isNvidiaGpuCrash) {
    console.warn('[MeloLauncher] NVIDIA + invalid sandbox + crash 133, enabling immediate software fallback')
    return true
  }

  if (process.env.MELO_ENABLE_EARLY_SOFTWARE_RETRY !== '1') return false
  if (!isEarlyCrash(runtimeMs)) return false
  if (signal === 'SIGTRAP' || signal === 'SIGABRT') return true
  if (code === 133 || code === 134) return true
  return false
}

function buildSoftwareFallbackArgs(baseArgs) {
  const toRemove = new Set([
    '--use-gl=egl',
    '--use-gl=desktop',
    '--melo-gpu-egl-retry',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
  ])

  const args = [...baseArgs].filter((arg) => !toRemove.has(arg) && !String(arg).startsWith('--use-gl='))

  if (!args.includes('--melo-emergency-software-gpu')) args.push('--melo-emergency-software-gpu')
  if (!args.includes('--disable-gpu')) args.push('--disable-gpu')
  if (!args.includes('--disable-gpu-compositing')) args.push('--disable-gpu-compositing')
  if (!args.includes('--in-process-gpu')) args.push('--in-process-gpu')
  if (!args.includes('--enable-unsafe-swiftshader')) args.push('--enable-unsafe-swiftshader')

  return args
}

function spawnElectron(electronBinary, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let stderr = ''
    const child = spawn(electronBinary, args, {
      stdio: ['inherit', 'inherit', 'pipe'],
      env: {
        ...process.env,
        ...extraEnv,
      },
    })

    child.stderr.on('data', (chunk) => {
      const text = String(chunk || '')
      stderr += text
      process.stderr.write(chunk)
    })

    child.on('exit', (code, signal) => {
      resolve({ code, signal, stderr, runtimeMs: Date.now() - startedAt })
    })

    child.on('error', (error) => {
      resolve({ code: 1, signal: null, error: error.message, stderr, runtimeMs: Date.now() - startedAt })
    })
  })
}

async function main() {
  let electronBinary
  try {
    electronBinary = require('electron')
  } catch (error) {
    console.error('[MeloLauncher] Unable to resolve electron binary:', error.message)
    process.exit(1)
  }

  const userArgs = process.argv.slice(2)
  const runtimeContext = detectRuntimeContext()
  const sandboxStatus = detectSandboxStatus(electronBinary)
  const launchMode = detectLaunchMode(userArgs)
  tryFixSandboxPermissions(sandboxStatus.helperPath, launchMode)
  const finalArgs = buildArgs(userArgs, sandboxStatus, launchMode, runtimeContext)

  const logPayload = {
    source: 'electron-launcher',
    launchMode,
    runtime: runtimeContext,
    sandbox: sandboxStatus,
    namespaceSandboxFallback: !sandboxStatus.usable && launchMode !== 'packaged',
    autoNoSandbox: false,
    args: finalArgs,
  }
  console.log('[MeloLauncher]', JSON.stringify(logPayload))

  if (process.platform === 'linux' && !sandboxStatus.usable) {
    console.warn('[MeloLauncher] Sandbox helper invalid, enabling namespace sandbox fallback first:', JSON.stringify({
      helperPath: sandboxStatus.helperPath,
      modeOctal: sandboxStatus.modeOctal,
      ownerUid: sandboxStatus.ownerUid,
      reason: sandboxStatus.reason,
      remediation: 'sudo chown root:root node_modules/electron/dist/chrome-sandbox && sudo chmod 4755 node_modules/electron/dist/chrome-sandbox',
    }))
  }

  const baseEnv = {
    MELO_GPU_RESET: process.env.MELO_GPU_RESET || '0',
    MELO_GPU_RESET_ALREADY: process.env.MELO_GPU_RESET_ALREADY || '0',
    MELO_SANDBOX_AUTO_DISABLED: process.env.MELO_SANDBOX_AUTO_DISABLED || '0',
    MELO_SANDBOX_NAMESPACE_FALLBACK: (!sandboxStatus.usable && launchMode !== 'packaged') ? '1' : (process.env.MELO_SANDBOX_NAMESPACE_FALLBACK || '0'),
    MELO_SANDBOX_HELPER_REASON: sandboxStatus.reason || 'unknown',
    MELO_EARLY_SOFTWARE_FALLBACK: process.env.MELO_EARLY_SOFTWARE_FALLBACK || '0',
    MELO_LAUNCH_MODE: launchMode,
  }

  let currentArgs = finalArgs
  let currentEnv = { ...baseEnv }
  let result = await spawnElectron(electronBinary, currentArgs, currentEnv)

  if (shouldRetryWithSandboxFallback({
    code: result.code,
    signal: result.signal,
    args: currentArgs,
    runtimeMs: result.runtimeMs,
    sandboxStatus,
    launchMode,
    stderr: result.stderr,
  })) {
    if (isZygoteFailure(result.stderr)) {
      console.warn('[MeloLauncher] Zygote namespace failure detected, retrying with --no-sandbox')
    }

    const retryBaseArgs = stripConflictingGpuArgs(stripResetArgs(currentArgs))
      .filter((arg) => arg !== '--melo-namespace-sandbox-fallback')
    currentArgs = [...retryBaseArgs]
    if (!currentArgs.includes('--melo-no-sandbox-fallback')) currentArgs.push('--melo-no-sandbox-fallback')
    if (!currentArgs.includes('--no-sandbox')) currentArgs.push('--no-sandbox')
    if (!currentArgs.includes('--disable-setuid-sandbox')) currentArgs.push('--disable-setuid-sandbox')
    currentEnv = {
      ...currentEnv,
      MELO_SANDBOX_AUTO_DISABLED: '1',
      MELO_SANDBOX_NAMESPACE_FALLBACK: '0',
      MELO_SANDBOX_HELPER_REASON: 'runtime-zygote-failure',
    }

    console.warn('[MeloLauncher] Runtime sandbox retry triggered:', JSON.stringify({
      previousExitCode: result.code,
      previousSignal: result.signal || null,
      previousRuntimeMs: result.runtimeMs,
      retryArgs: currentArgs,
    }))

    result = await spawnElectron(electronBinary, currentArgs, currentEnv)
  }

  if (shouldRetryWithSoftwareFallback({
    code: result.code,
    signal: result.signal,
    args: currentArgs,
    runtimeMs: result.runtimeMs,
    sandboxStatus,
    runtime: runtimeContext,
  })) {
    currentArgs = buildSoftwareFallbackArgs(stripResetArgs(currentArgs))
    currentEnv = {
      ...currentEnv,
      MELO_GPU_RESET: '0',
      MELO_GPU_RESET_ALREADY: '1',
      MELO_EARLY_SOFTWARE_FALLBACK: '1',
    }

    console.warn('[MeloLauncher] Runtime software retry triggered:', JSON.stringify({
      previousExitCode: result.code,
      previousSignal: result.signal || null,
      previousRuntimeMs: result.runtimeMs,
      retryArgs: currentArgs,
    }))

    result = await spawnElectron(electronBinary, currentArgs, currentEnv)
  }

  if (result.signal) {
    process.kill(process.pid, result.signal)
    return
  }
  process.exit(typeof result.code === 'number' ? result.code : 1)
}

main()
