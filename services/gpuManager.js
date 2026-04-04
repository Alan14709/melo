const fs = require('fs')
const os = require('os')
const path = require('path')

const STATE_FILE = path.join(os.tmpdir(), 'melo-gpu-manager-state.json')

const CRASH_WINDOW_MS = Number(process.env.MELO_GPU_CRASH_WINDOW_MS || 30000)
const RELAUNCH_WINDOW_MS = Number(process.env.MELO_GPU_RELAUNCH_WINDOW_MS || 60000)
const RELAUNCH_LIMIT = Number(process.env.MELO_GPU_RELAUNCH_LIMIT || 4)
const MAX_ENVIRONMENTAL_1002_RETRIES = Number(process.env.MELO_GPU_1002_MAX_RETRIES || 2)

// Policy requested: <3 retry HW, 3-5 temp fallback, >=6 lock safe mode.
const GPU_TEMP_FALLBACK_THRESHOLD = Number(process.env.MELO_GPU_TEMP_FALLBACK_THRESHOLD || 3)
const GPU_LOCK_THRESHOLD = Number(process.env.MELO_GPU_LOCK_THRESHOLD || 6)
const SANDBOX_LOCK_THRESHOLD = Number(process.env.MELO_SANDBOX_LOCK_THRESHOLD || 3)
const STABLE_UNLOCK_COUNT = Number(process.env.MELO_GPU_STABLE_UNLOCK_COUNT || 1)
const SUCCESSFUL_LAUNCH_MIN_UPTIME_MS = Number(process.env.MELO_GPU_SUCCESS_UPTIME_MS || 45000)

const DEFAULT_FLAGS = {
  fallbackFlag: '--melo-gpu-fallback',
  safeModeFlag: '--melo-gpu-safe-mode',
  swiftFlag: '--melo-swiftshader-fallback',
  softwareFlag: '--melo-software-fallback',
  sandboxFlag: '--melo-no-sandbox-fallback',
  namespaceSandboxFlag: '--melo-namespace-sandbox-fallback',
  eglRetryFlag: '--melo-gpu-egl-retry',
  softwareRetryFlag: '--melo-gpu-software-retry',
  optimizedRasterizationFlag: '--melo-gpu-rasterization-optimized',
  emergencySoftwareFlag: '--melo-emergency-software-gpu',
  resetFlag: '--melo-gpu-reset',
}

const MODE = {
  HARDWARE: 'hardware',
  SOFTWARE: 'software',
}

const CRASH_CLASS = {
  GPU: 'gpu',
  SANDBOX: 'sandbox',
  RENDERER: 'renderer',
}

function createDefaultPersistedState() {
  return {
    crashCount: 0,
    lastCrashAt: 0,
    environmental1002Count: 0,
    lastEnvironmental1002At: 0,
    sandboxCrashCount: 0,
    lastSandboxCrashAt: 0,
    safeModeLocked: false,
    safeModeReason: null,
    stableLaunches: 0,
    totalLaunchCount: 0,
    lastLaunchHadCrash: false,
    lastLaunchUptimeMs: 0,
    lastReason: null,
    enableRasterizationOnNextLaunch: false,
  }
}

const state = {
  app: null,
  logger: null,
  flags: { ...DEFAULT_FLAGS },
  initialized: false,
  relaunchScheduled: false,
  relaunchTimestamps: [],
  runtime: {
    cleanBoot: false,
    crashSeenThisLaunch: false,
    startupProfile: 'normal',
    launchStartedAt: Date.now(),
    exitHooksInstalled: false,
    lastCrashSignature: null,
    lastCrashSignalAt: 0,
  },
  environment: {
    platform: process.platform,
    sessionType: process.env.XDG_SESSION_TYPE || 'unknown',
    isWayland: Boolean(process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland'),
    isX11: Boolean(process.env.DISPLAY),
    isXWayland: Boolean(
      (process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland')
      && process.env.DISPLAY
    ),
    gpuVendor: 'unknown',
    sandbox: {
      helperPath: null,
      exists: false,
      modeOctal: null,
      ownerUid: null,
      isSetuidBit: false,
      usable: false,
      reason: 'unknown',
    },
  },
  persisted: createDefaultPersistedState(),
}

function log(level, action, data = null) {
  if (state.logger && typeof state.logger[level] === 'function') {
    state.logger[level]('GPUManager', action, data)
    return
  }

  const suffix = data ? ` ${JSON.stringify(data)}` : ''
  const line = `[Melo][GPUManager] ${action}${suffix}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (_) {
    return null
  }
}

function writeJSON(filePath, value) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(value), 'utf8')
  } catch (_) {}
}

function hasArg(flag) {
  return process.argv.includes(flag)
}

function loadPersistedState() {
  const raw = readJSON(STATE_FILE)
  if (!raw || typeof raw !== 'object') {
    state.persisted = createDefaultPersistedState()
    return
  }

  const legacyCrashCount = Number(raw.crashCount || raw.gpuCrashCount || 0)
  const legacyLastCrashAt = Number(raw.lastCrashAt || raw.lastGpuCrashAt || 0)

  state.persisted = {
    crashCount: Number(legacyCrashCount),
    lastCrashAt: Number(legacyLastCrashAt),
    environmental1002Count: Number(raw.environmental1002Count || 0),
    lastEnvironmental1002At: Number(raw.lastEnvironmental1002At || 0),
    sandboxCrashCount: Number(raw.sandboxCrashCount || 0),
    lastSandboxCrashAt: Number(raw.lastSandboxCrashAt || 0),
    safeModeLocked: Boolean(raw.safeModeLocked),
    safeModeReason: raw.safeModeReason || null,
    stableLaunches: Number(raw.stableLaunches || 0),
    totalLaunchCount: Number(raw.totalLaunchCount || 0),
    lastLaunchHadCrash: Boolean(raw.lastLaunchHadCrash || false),
    lastLaunchUptimeMs: Number(raw.lastLaunchUptimeMs || 0),
    lastReason: raw.lastReason || null,
    enableRasterizationOnNextLaunch: Boolean(raw.enableRasterizationOnNextLaunch || false),
  }
}

function persistState() {
  writeJSON(STATE_FILE, {
    crashCount: state.persisted.crashCount,
    lastCrashAt: state.persisted.lastCrashAt,
    environmental1002Count: state.persisted.environmental1002Count,
    lastEnvironmental1002At: state.persisted.lastEnvironmental1002At,
    sandboxCrashCount: state.persisted.sandboxCrashCount,
    lastSandboxCrashAt: state.persisted.lastSandboxCrashAt,
    safeModeLocked: state.persisted.safeModeLocked,
    safeModeReason: state.persisted.safeModeReason,
    stableLaunches: state.persisted.stableLaunches,
    totalLaunchCount: state.persisted.totalLaunchCount,
    lastLaunchHadCrash: state.persisted.lastLaunchHadCrash,
    lastLaunchUptimeMs: state.persisted.lastLaunchUptimeMs,
    lastReason: state.persisted.lastReason,
    enableRasterizationOnNextLaunch: state.persisted.enableRasterizationOnNextLaunch,
  })
}

function resetStateIfRequested() {
  if (process.env.MELO_GPU_RESET_ALREADY === '1') return
  if (!hasArg(state.flags.resetFlag) && process.env.MELO_GPU_RESET !== '1') return

  state.persisted = createDefaultPersistedState()
  state.runtime.cleanBoot = true
  state.runtime.crashSeenThisLaunch = false
  persistState()

  log('warn', 'gpu_state_hard_reset', {
    source: hasArg(state.flags.resetFlag) ? 'cli-flag' : 'env',
    stateFile: STATE_FILE,
  })
}

function staleWindow(lastAt, now = Date.now()) {
  if (!lastAt) return true
  return (now - Number(lastAt)) > CRASH_WINDOW_MS
}

function decayCrashCounters(now = Date.now()) {
  if (staleWindow(state.persisted.lastCrashAt, now)) {
    state.persisted.crashCount = 0
    state.persisted.lastCrashAt = 0
  }

  if (staleWindow(state.persisted.lastEnvironmental1002At, now)) {
    state.persisted.environmental1002Count = 0
    state.persisted.lastEnvironmental1002At = 0
  }

  if (staleWindow(state.persisted.lastSandboxCrashAt, now)) {
    state.persisted.sandboxCrashCount = 0
    state.persisted.lastSandboxCrashAt = 0
  }
}

function applyStableLaunchPolicy() {
  state.persisted.totalLaunchCount = Number(state.persisted.totalLaunchCount || 0) + 1

  const previousSuccessful = !state.persisted.lastLaunchHadCrash
    && Number(state.persisted.lastLaunchUptimeMs || 0) >= SUCCESSFUL_LAUNCH_MIN_UPTIME_MS

  if (previousSuccessful) {
    // After a stable 30-60s run, clear crash counters and attempt GPU restore next launch.
    state.persisted.crashCount = 0
    state.persisted.lastCrashAt = 0
    state.persisted.environmental1002Count = 0
    state.persisted.lastEnvironmental1002At = 0
    state.persisted.enableRasterizationOnNextLaunch = true
  }

  if (state.persisted.safeModeLocked) {
    state.persisted.stableLaunches = previousSuccessful
      ? Number(state.persisted.stableLaunches || 0) + 1
      : 0

    if (state.persisted.stableLaunches >= STABLE_UNLOCK_COUNT) {
      const previousCrashCount = Number(state.persisted.crashCount || 0)
      state.persisted.safeModeLocked = false
      state.persisted.safeModeReason = null
      state.persisted.crashCount = 0
      state.persisted.lastCrashAt = 0
      state.persisted.stableLaunches = 0
      state.persisted.lastReason = 'stable-launch-auto-unlock'

      log('warn', 'safe_mode_auto_unlocked', {
        previousCrashCount,
        stableLaunchesRequired: STABLE_UNLOCK_COUNT,
      })
    }
  } else {
    state.persisted.stableLaunches = previousSuccessful
      ? Math.min(Number(state.persisted.stableLaunches || 0) + 1, STABLE_UNLOCK_COUNT)
      : 0
  }

  state.persisted.lastLaunchHadCrash = false
  state.persisted.lastLaunchUptimeMs = 0
}

function registerProcessExitPersistence() {
  if (state.runtime.exitHooksInstalled) return

  state.runtime.launchStartedAt = Date.now()

  const persistLaunchOutcome = () => {
    state.persisted.lastLaunchHadCrash = Boolean(state.runtime.crashSeenThisLaunch)
    state.persisted.lastLaunchUptimeMs = Date.now() - Number(state.runtime.launchStartedAt || Date.now())
    persistState()
  }

  process.on('beforeExit', persistLaunchOutcome)
  process.on('exit', persistLaunchOutcome)
  state.runtime.exitHooksInstalled = true
}

function detectLinuxGPUVendor() {
  const vendorById = {
    '0x10de': 'nvidia',
    '0x8086': 'intel',
    '0x1002': 'amd',
    '0x1022': 'amd',
  }

  try {
    const drmDir = '/sys/class/drm'
    if (fs.existsSync(drmDir)) {
      const entries = fs.readdirSync(drmDir)
      for (const entry of entries) {
        if (!/^card\d+$/.test(entry)) continue
        const vendorPath = path.join(drmDir, entry, 'device', 'vendor')
        if (!fs.existsSync(vendorPath)) continue
        const raw = String(fs.readFileSync(vendorPath, 'utf8')).trim().toLowerCase()
        if (vendorById[raw]) return vendorById[raw]
      }
    }
  } catch (_) {}

  if (fs.existsSync('/proc/driver/nvidia/version')) return 'nvidia'
  return 'unknown'
}

function detectGPUVendor() {
  if (process.platform === 'linux') return detectLinuxGPUVendor()
  if (process.platform === 'darwin') return 'apple'
  return 'unknown'
}

function getSandboxHelperCandidates() {
  const execDir = path.dirname(process.execPath)
  const candidates = [
    path.join(execDir, 'chrome-sandbox'),
    path.join(process.cwd(), 'node_modules', 'electron', 'dist', 'chrome-sandbox'),
  ]

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, '..', 'chrome-sandbox'))
  }

  return [...new Set(candidates)]
}

function detectSandboxStatus() {
  if (process.platform !== 'linux') {
    return {
      helperPath: null,
      exists: false,
      modeOctal: null,
      ownerUid: null,
      isSetuidBit: false,
      usable: true,
      reason: 'not-linux',
    }
  }

  for (const helperPath of getSandboxHelperCandidates()) {
    try {
      if (!fs.existsSync(helperPath)) continue

      const stat = fs.statSync(helperPath)
      const ownerUid = Number(stat.uid)
      const isSetuidBit = Boolean(stat.mode & 0o4000)
      const modeOctal = (stat.mode & 0o7777).toString(8)
      const usable = ownerUid === 0 && isSetuidBit

      return {
        helperPath,
        exists: true,
        modeOctal,
        ownerUid,
        isSetuidBit,
        usable,
        reason: usable
          ? 'ok'
          : (ownerUid !== 0 ? 'owner-not-root' : 'missing-setuid-4755'),
      }
    } catch (_) {
      continue
    }
  }

  return {
    helperPath: null,
    exists: false,
    modeOctal: null,
    ownerUid: null,
    isSetuidBit: false,
    usable: false,
    reason: 'helper-not-found',
  }
}

function detectEnvironment() {
  const isWayland = Boolean(process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland')
  const isX11 = Boolean(process.env.DISPLAY) && !isWayland
  const isXWayland = Boolean(isWayland && process.env.DISPLAY)

  return {
    platform: process.platform,
    sessionType: process.env.XDG_SESSION_TYPE || (isWayland ? 'wayland' : (isX11 ? 'x11' : 'unknown')),
    isWayland,
    isX11,
    isXWayland,
    gpuVendor: detectGPUVendor(),
    sandbox: detectSandboxStatus(),
  }
}

function shouldUseSandboxFallback() {
  if (process.env.MELO_SANDBOX_AUTO_DISABLED === '1') return true
  if (process.env.APPIMAGE && state.environment?.sandbox?.usable === false) return true
  if (hasArg(state.flags.sandboxFlag) || hasArg('--no-sandbox')) return true
  return Boolean(state.persisted.safeModeLocked && state.persisted.safeModeReason === CRASH_CLASS.SANDBOX)
}

function shouldUseNamespaceSandboxFallback({ sandboxFallback = false } = {}) {
  if (process.platform !== 'linux') return false
  if (sandboxFallback) return false
  if (hasArg('--disable-setuid-sandbox')) return true
  if (process.env.MELO_SANDBOX_NAMESPACE_FALLBACK === '1') return true
  return Boolean(state.environment?.sandbox?.usable === false)
}

function getEnvironmental1002RetryStage() {
  if (hasArg(state.flags.softwareRetryFlag)) return 2
  if (hasArg(state.flags.eglRetryFlag)) return 1
  return 0
}

function shouldUseEglRetryProfile({ sandboxFallback = false } = {}) {
  if (sandboxFallback) return false
  if (hasArg('--no-sandbox')) return false
  return hasArg(state.flags.eglRetryFlag)
}

function shouldEnableHardwareRasterization({ sandboxFallback = false, useEglRetry = false } = {}) {
  if (sandboxFallback) return false
  if (useEglRetry) return false
  if (hasArg('--no-sandbox')) return false
  if (process.env.MELO_GPU_ENABLE_RASTERIZATION === '1') return true
  if (hasArg(state.flags.optimizedRasterizationFlag)) return true
  return Boolean(state.persisted.enableRasterizationOnNextLaunch)
}

function effectiveCrashCount(kind, now = Date.now()) {
  if (kind === CRASH_CLASS.SANDBOX) {
    if (staleWindow(state.persisted.lastSandboxCrashAt, now)) return 0
    return Number(state.persisted.sandboxCrashCount || 0)
  }

  if (staleWindow(state.persisted.lastCrashAt, now)) return 0
  return Number(state.persisted.crashCount || 0)
}

function shouldUseFallback() {
  if (shouldForceSoftwareOnNoSandboxNvidia()) {
    return true
  }

  if (state.runtime.cleanBoot) {
    const emergencyArgsPresent = hasArg(state.flags.emergencySoftwareFlag)
      || hasArg('--disable-gpu')
      || process.argv.some((arg) => String(arg).startsWith('--use-gl=swiftshader'))
    if (!emergencyArgsPresent) return false
  }

  if (state.persisted.safeModeLocked && state.persisted.safeModeReason === CRASH_CLASS.GPU) return true

  if (hasArg(state.flags.emergencySoftwareFlag) || process.env.MELO_EARLY_SOFTWARE_FALLBACK === '1') {
    return true
  }

  if (hasArg(state.flags.softwareFlag) || hasArg(state.flags.fallbackFlag) || hasArg(state.flags.swiftFlag)) {
    return true
  }

  if (hasArg('--disable-gpu') || process.argv.some((arg) => String(arg).startsWith('--use-gl=swiftshader'))) {
    return true
  }

  return effectiveCrashCount(CRASH_CLASS.GPU) >= GPU_TEMP_FALLBACK_THRESHOLD
}

function getDesiredMode() {
  if (state.runtime.cleanBoot) return MODE.HARDWARE
  if (shouldUseFallback()) return MODE.SOFTWARE
  return MODE.HARDWARE
}

function isNoSandboxEffective() {
  return hasArg('--no-sandbox')
    || hasArg(state.flags.sandboxFlag)
    || process.env.MELO_SANDBOX_AUTO_DISABLED === '1'
}

function shouldForceSoftwareOnNoSandboxNvidia() {
  if (process.platform !== 'linux') return false
  if (state.environment?.gpuVendor !== 'nvidia') return false
  return isNoSandboxEffective()
}

function getStartupProfile() {
  if (state.persisted.safeModeLocked && state.persisted.safeModeReason === CRASH_CLASS.GPU && !state.runtime.cleanBoot) {
    return 'safe-mode'
  }
  return shouldUseFallback() ? 'fallback' : 'normal'
}

function buildPolicyFlags(mode, {
  sandboxFallback = false,
  namespaceSandboxFallback = false,
  safeMode = false,
  useEglRetry = false,
  hardwareOptimized = false,
  forceNoSandboxNvidiaSoftware = false,
} = {}) {
  const flags = []

  if (mode === MODE.HARDWARE) {
    // Clean startup policy: let Chromium pick backend unless explicit EGL retry profile is active.
    if (useEglRetry) flags.push('use-gl=egl')
    else if (hardwareOptimized) flags.push('enable-gpu-rasterization')
  } else {
    flags.push('disableHardwareAcceleration', 'disable-gpu')
    if (safeMode || forceNoSandboxNvidiaSoftware) flags.push('disable-gpu-compositing')
    if (forceNoSandboxNvidiaSoftware) flags.push('in-process-gpu', 'enable-unsafe-swiftshader')
  }

  if (namespaceSandboxFallback && !sandboxFallback) {
    flags.push('disable-setuid-sandbox')
  }

  if (sandboxFallback) {
    flags.push('no-sandbox', 'disable-setuid-sandbox')
  }

  return flags
}

function appendSwitchIfMissing(key, value) {
  if (!state.app || !state.app.commandLine || typeof state.app.commandLine.hasSwitch !== 'function') return
  if (state.app.commandLine.hasSwitch(key)) return

  if (typeof value === 'undefined') state.app.commandLine.appendSwitch(key)
  else state.app.commandLine.appendSwitch(key, value)
}

function applyBaseFlags() {
  if (!state.app || state.initialized) return

  const desiredMode = getDesiredMode()
  const forceNoSandboxNvidiaSoftware = shouldForceSoftwareOnNoSandboxNvidia()
  const sandboxFallback = shouldUseSandboxFallback()
  const namespaceSandboxFallback = shouldUseNamespaceSandboxFallback({ sandboxFallback })
  const useEglRetry = shouldUseEglRetryProfile({ sandboxFallback })
  const hardwareOptimized = shouldEnableHardwareRasterization({ sandboxFallback, useEglRetry })
  const startupProfile = getStartupProfile()
  const safeMode = startupProfile === 'safe-mode'

  state.runtime.startupProfile = startupProfile

  if (desiredMode === MODE.HARDWARE) {
    if (useEglRetry) {
      appendSwitchIfMissing('use-gl', 'egl')
    } else if (hardwareOptimized) {
      appendSwitchIfMissing('enable-gpu-rasterization')
    }
  } else {
    state.app.disableHardwareAcceleration()
    appendSwitchIfMissing('disable-gpu')
    if (safeMode || forceNoSandboxNvidiaSoftware) appendSwitchIfMissing('disable-gpu-compositing')
    if (forceNoSandboxNvidiaSoftware) {
      appendSwitchIfMissing('in-process-gpu')
      appendSwitchIfMissing('enable-unsafe-swiftshader')
    }
  }

  if (namespaceSandboxFallback && !sandboxFallback) {
    // Keep sandbox enabled where possible using user namespace fallback.
    appendSwitchIfMissing('disable-setuid-sandbox')
  }

  if (sandboxFallback) {
    appendSwitchIfMissing('no-sandbox')
    appendSwitchIfMissing('disable-setuid-sandbox')
  }

  log('info', 'environment_detected', state.environment)
  log('info', 'sandbox_status', state.environment.sandbox)

  if (process.platform === 'linux' && state.environment.sandbox.usable === false) {
    log('warn', 'sandbox_helper_invalid', {
      helperPath: state.environment.sandbox.helperPath,
      modeOctal: state.environment.sandbox.modeOctal,
      ownerUid: state.environment.sandbox.ownerUid,
      reason: state.environment.sandbox.reason,
      fallback: 'no-sandbox-only-if-required',
    })
  }

  log('info', 'startup_policy', {
    profile: startupProfile,
    desiredMode,
    fallback: shouldUseFallback(),
    forceNoSandboxNvidiaSoftware,
    sandboxFallback,
    namespaceSandboxFallback,
    useEglRetry,
    hardwareOptimized,
    safeModeLocked: Boolean(state.persisted.safeModeLocked),
    safeModeReason: state.persisted.safeModeReason,
    activeFlags: buildPolicyFlags(desiredMode, {
      sandboxFallback,
      namespaceSandboxFallback,
      safeMode,
      useEglRetry,
      hardwareOptimized,
      forceNoSandboxNvidiaSoftware,
    }),
  })
}

function getGPUFeatureStatusSafe() {
  if (!state.app || typeof state.app.getGPUFeatureStatus !== 'function') return null
  try {
    return state.app.getGPUFeatureStatus()
  } catch (_) {
    return null
  }
}

function detectSoftwareMode(featureStatus = {}) {
  const gpuCompositing = String(featureStatus?.gpu_compositing || '').toLowerCase()
  const rasterization = String(featureStatus?.rasterization || '').toLowerCase()
  const webgl = String(featureStatus?.webgl || '').toLowerCase()

  return gpuCompositing.includes('software')
    || rasterization.includes('software')
    || webgl.includes('disabled')
    || webgl.includes('off')
}

function buildValidationSummary(status) {
  return {
    mode: status.mode,
    webgl: status.featureStatus?.webgl || 'unknown',
    gpu_compositing: status.featureStatus?.gpu_compositing || 'unknown',
    fallbackActive: Boolean(status.fallbackActive),
    safeModeLocked: Boolean(status.safeModeLocked),
  }
}

function getGPUStatus() {
  const now = Date.now()
  const featureStatus = getGPUFeatureStatusSafe() || {}
  const mode = getDesiredMode()
  const profile = getStartupProfile()
  const safeModeLocked = Boolean(state.persisted.safeModeLocked)
  const safeModeReason = state.persisted.safeModeReason || null
  const forceNoSandboxNvidiaSoftware = shouldForceSoftwareOnNoSandboxNvidia()
  const sandboxFallbackActive = shouldUseSandboxFallback()
  const namespaceSandboxFallbackActive = shouldUseNamespaceSandboxFallback({ sandboxFallback: sandboxFallbackActive })
  const eglRetryActive = shouldUseEglRetryProfile({ sandboxFallback: sandboxFallbackActive })
  const hardwareOptimized = shouldEnableHardwareRasterization({ sandboxFallback: sandboxFallbackActive, useEglRetry: eglRetryActive })
  const fallbackActive = mode === MODE.SOFTWARE

  const status = {
    environment: state.environment,
    featureStatus,
    profile,
    desiredMode: mode,
    mode,
    fallbackActive,
    sandboxFallbackActive,
    namespaceSandboxFallbackActive,
    eglRetryActive,
    hardwareOptimized,
    crashCount: effectiveCrashCount(CRASH_CLASS.GPU, now),
    gpuCrashCount: effectiveCrashCount(CRASH_CLASS.GPU, now),
    environmental1002Count: Number(state.persisted.environmental1002Count || 0),
    sandboxCrashCount: effectiveCrashCount(CRASH_CLASS.SANDBOX, now),
    safeModeLocked,
    safeModeReason,
    stableLaunches: Number(state.persisted.stableLaunches || 0),
    totalLaunchCount: Number(state.persisted.totalLaunchCount || 0),
    hardwareProbeBoot: false,
    launchesSinceLock: 0,
    safeModeSessionCount: 0,
    lastCrashAt: state.persisted.lastCrashAt || state.persisted.lastEnvironmental1002At || state.persisted.lastSandboxCrashAt || null,
    lastReason: state.persisted.lastReason || null,
    activeFlags: buildPolicyFlags(mode, {
      sandboxFallback: sandboxFallbackActive,
      namespaceSandboxFallback: namespaceSandboxFallbackActive,
      safeMode: profile === 'safe-mode',
      useEglRetry: eglRetryActive,
      hardwareOptimized,
      forceNoSandboxNvidiaSoftware,
    }),
    detectedSoftware: detectSoftwareMode(featureStatus),
    forceNoSandboxNvidiaSoftware,
  }

  status.validationSummary = buildValidationSummary(status)
  return status
}

function isEnvironmentalLaunchFailed1002(crashClass, reason, exitCode) {
  return crashClass === CRASH_CLASS.GPU
    && String(reason || '').toLowerCase() === 'launch-failed'
    && Number(exitCode) === 1002
}

function classifyCrash(event, details = {}) {
  const source = String(event || '').toLowerCase()
  const reason = String(details?.reason || '').toLowerCase()
  const exitCode = Number(details?.exitCode)

  const sandboxHints = ['sandbox', 'setuid', 'zygote', 'seccomp', 'namespace']
  if (sandboxHints.some((hint) => source.includes(hint) || reason.includes(hint))) {
    return CRASH_CLASS.SANDBOX
  }

  if (exitCode === 1002 || source.includes('gpu')) return CRASH_CLASS.GPU
  if (reason === 'launch-failed' || reason === 'crashed') return CRASH_CLASS.GPU

  return CRASH_CLASS.RENDERER
}

function removeManagedGPUArgs(args) {
  const toDrop = new Set([
    state.flags.fallbackFlag,
    state.flags.safeModeFlag,
    state.flags.swiftFlag,
    state.flags.softwareFlag,
    state.flags.sandboxFlag,
    state.flags.namespaceSandboxFlag,
    state.flags.eglRetryFlag,
    state.flags.softwareRetryFlag,
    state.flags.optimizedRasterizationFlag,
    state.flags.emergencySoftwareFlag,
    state.flags.resetFlag,
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--in-process-gpu',
    '--use-gl=swiftshader',
    '--use-gl=desktop',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
    '--disable-gpu-watchdog',
    '--no-sandbox',
    '--disable-setuid-sandbox',
  ])

  return args.filter((arg) => {
    if (!arg) return false
    if (toDrop.has(arg)) return false
    if (arg.startsWith('--use-gl=')) return false
    return true
  })
}

function buildRelaunchArgs({
  useFallback = false,
  safeMode = false,
  useSandboxFallback = false,
  useEglRetry = false,
  fallbackStage = null,
} = {}) {
  const args = removeManagedGPUArgs(process.argv.slice(1))

  if (!useSandboxFallback && useEglRetry) {
    if (!args.includes(state.flags.eglRetryFlag)) args.push(state.flags.eglRetryFlag)
    if (!args.includes('--use-gl=egl')) args.push('--use-gl=egl')
  }

  if (useSandboxFallback) {
    if (!args.includes(state.flags.sandboxFlag)) args.push(state.flags.sandboxFlag)
    if (!args.includes('--no-sandbox')) args.push('--no-sandbox')
    if (!args.includes('--disable-setuid-sandbox')) args.push('--disable-setuid-sandbox')
  }

  if (useFallback) {
    if (!args.includes(state.flags.fallbackFlag)) args.push(state.flags.fallbackFlag)
    if (!args.includes(state.flags.softwareFlag)) args.push(state.flags.softwareFlag)
    if (fallbackStage === 'software-1002' && !args.includes(state.flags.softwareRetryFlag)) {
      args.push(state.flags.softwareRetryFlag)
    }
    if (fallbackStage === 'software-1002' && !args.includes(state.flags.emergencySoftwareFlag)) {
      args.push(state.flags.emergencySoftwareFlag)
    }
    if (!args.includes('--disable-gpu')) args.push('--disable-gpu')
    if (!args.includes('--disable-gpu-compositing')) args.push('--disable-gpu-compositing')
    if (!args.includes('--in-process-gpu')) args.push('--in-process-gpu')
    if (!args.includes('--enable-unsafe-swiftshader')) args.push('--enable-unsafe-swiftshader')
  }

  if (safeMode) {
    if (!args.includes(state.flags.safeModeFlag)) args.push(state.flags.safeModeFlag)
    if (!args.includes(state.flags.softwareFlag)) args.push(state.flags.softwareFlag)
    if (!args.includes('--disable-gpu-compositing')) args.push('--disable-gpu-compositing')
  }

  return args
}

function handleGPUCrash(event, details = {}) {
  if (state.relaunchScheduled) {
    return {
      event,
      crashClass: classifyCrash(event, details),
      reason: details?.reason || 'unknown',
      exitCode: Number.isFinite(Number(details?.exitCode)) ? Number(details.exitCode) : null,
      crashCount: effectiveCrashCount(CRASH_CLASS.GPU),
      gpuCrashCount: effectiveCrashCount(CRASH_CLASS.GPU),
      sandboxCrashCount: effectiveCrashCount(CRASH_CLASS.SANDBOX),
      useFallback: shouldUseFallback(),
      useSandboxFallback: shouldUseSandboxFallback(),
      safeMode: Boolean(state.persisted.safeModeLocked && state.persisted.safeModeReason === CRASH_CLASS.GPU),
      shouldRelaunch: false,
      mode: 'relaunch-pending',
      message: 'Ignoring duplicate crash while relaunch is already scheduled.',
    }
  }

  const now = Date.now()
  const crashClass = classifyCrash(event, details)
  const exitCode = Number.isFinite(Number(details?.exitCode)) ? Number(details.exitCode) : null
  const reason = String(details?.reason || 'unknown')
  const environmentalLaunchFailed1002 = isEnvironmentalLaunchFailed1002(crashClass, reason, exitCode)
  const crashSignature = `${String(event || 'unknown')}:${crashClass}:${reason}:${exitCode}`

  if (
    state.runtime.lastCrashSignature === crashSignature
    && (now - Number(state.runtime.lastCrashSignalAt || 0)) <= 2000
  ) {
    return {
      event,
      crashClass,
      reason,
      exitCode,
      crashCount: effectiveCrashCount(CRASH_CLASS.GPU, now),
      gpuCrashCount: effectiveCrashCount(CRASH_CLASS.GPU, now),
      sandboxCrashCount: effectiveCrashCount(CRASH_CLASS.SANDBOX, now),
      useFallback: shouldUseFallback(),
      useSandboxFallback: shouldUseSandboxFallback(),
      safeMode: Boolean(state.persisted.safeModeLocked && state.persisted.safeModeReason === CRASH_CLASS.GPU),
      shouldRelaunch: false,
      mode: 'duplicate-suppressed',
      message: 'Duplicate crash event suppressed to avoid counter inflation.',
    }
  }
  state.runtime.lastCrashSignature = crashSignature
  state.runtime.lastCrashSignalAt = now

  decayCrashCounters(now)

  const nextGpuCrashCount = crashClass === CRASH_CLASS.GPU
    ? (
      environmentalLaunchFailed1002
        ? effectiveCrashCount(CRASH_CLASS.GPU, now)
        : Number(state.persisted.crashCount || 0) + 1
    )
    : effectiveCrashCount(CRASH_CLASS.GPU, now)

  const nextSandboxCrashCount = crashClass === CRASH_CLASS.SANDBOX
    ? Number(state.persisted.sandboxCrashCount || 0) + 1
    : effectiveCrashCount(CRASH_CLASS.SANDBOX, now)

  if (crashClass === CRASH_CLASS.GPU && !environmentalLaunchFailed1002) {
    state.persisted.crashCount = nextGpuCrashCount
    state.persisted.lastCrashAt = now
  }

  if (environmentalLaunchFailed1002) {
    state.persisted.environmental1002Count = Number(state.persisted.environmental1002Count || 0) + 1
    state.persisted.lastEnvironmental1002At = now
  }

  if (crashClass === CRASH_CLASS.SANDBOX) {
    state.persisted.sandboxCrashCount = nextSandboxCrashCount
    state.persisted.lastSandboxCrashAt = now
  }

  state.runtime.crashSeenThisLaunch = true
  state.persisted.lastLaunchHadCrash = true
  state.persisted.lastReason = details?.reason || event || 'unknown'

  if (crashClass === CRASH_CLASS.GPU && !environmentalLaunchFailed1002 && nextGpuCrashCount >= GPU_LOCK_THRESHOLD) {
    state.persisted.safeModeLocked = true
    state.persisted.safeModeReason = CRASH_CLASS.GPU
  }

  if (crashClass === CRASH_CLASS.SANDBOX && nextSandboxCrashCount >= SANDBOX_LOCK_THRESHOLD) {
    state.persisted.safeModeLocked = true
    state.persisted.safeModeReason = CRASH_CLASS.SANDBOX
  }

  if (crashClass === CRASH_CLASS.GPU) {
    state.persisted.enableRasterizationOnNextLaunch = false
  }

  persistState()

  const emergencySoftware = hasArg(state.flags.emergencySoftwareFlag) || process.env.MELO_EARLY_SOFTWARE_FALLBACK === '1'
  let shouldRelaunch = true
  let useFallback = shouldUseFallback()
  let useSandboxFallback = crashClass === CRASH_CLASS.SANDBOX || shouldUseSandboxFallback()
  let useEglRetry = false
  let fallbackStage = null
  let safeMode = Boolean(state.persisted.safeModeLocked && state.persisted.safeModeReason === CRASH_CLASS.GPU)
  let allowRetryHardware = false
  let mode = 'retry-hardware'
  let message = 'Retrying with hardware acceleration.'

  if (crashClass === CRASH_CLASS.GPU) {
    if (environmentalLaunchFailed1002) {
      const isNvidia = state.environment?.gpuVendor === 'nvidia'
      const sandboxInvalid = state.environment?.sandbox?.usable === false
        || useSandboxFallback
        || hasArg('--no-sandbox')
        || process.env.MELO_SANDBOX_AUTO_DISABLED === '1'
      const alreadyForcedSoftwareNoSandbox = shouldForceSoftwareOnNoSandboxNvidia()

      useSandboxFallback = false
      safeMode = false

      if (isNvidia && sandboxInvalid) {
        // NVIDIA + sandbox invalido suele fallar tambien con --use-gl=egl.
        // Saltamos EGL y vamos directo a software fallback.
        useFallback = true
        useEglRetry = false
        fallbackStage = 'software-1002'
        allowRetryHardware = false
        mode = 'nvidia-no-sandbox-software-fallback'
        message = 'GPU process launch failed: 1002 on NVIDIA with invalid sandbox. Skipping EGL retry and using software fallback.'

        if (alreadyForcedSoftwareNoSandbox) {
          shouldRelaunch = false
          mode = 'nvidia-no-sandbox-observed-in-forced-software'
          message = 'GPU launch-failed 1002 observed while already in forced software no-sandbox mode. Holding relaunch to avoid loops.'
        }
      } else {
        const retryStage = getEnvironmental1002RetryStage()
        const retriesExhausted = retryStage >= MAX_ENVIRONMENTAL_1002_RETRIES
        allowRetryHardware = retryStage < 1

        if (retryStage === 0) {
          useFallback = false
          useEglRetry = true
          mode = 'environmental-1002-retry-egl'
          message = 'GPU process launch failed: 1002 treated as unstable configuration. Retrying with EGL backend.'
        } else if (retryStage === 1) {
          useFallback = true
          useEglRetry = false
          fallbackStage = 'software-1002'
          mode = 'environmental-1002-fallback-software'
          message = 'GPU process launch failed: 1002 persisted on EGL. Falling back to software mode.'
        } else {
          useFallback = true
          shouldRelaunch = false
          mode = retriesExhausted
            ? 'environmental-1002-retries-exhausted'
            : 'environmental-1002-observed-in-software'
          message = 'GPU process launch failed: 1002 observed after max retries. Holding current mode to avoid loops.'
        }
      }

      if (emergencySoftware) {
        shouldRelaunch = false
        mode = 'environmental-1002-observed-in-emergency'
        message = 'GPU process launch failed: 1002 observed during emergency software mode. Holding relaunch to avoid loops.'
      }
    } else if (emergencySoftware) {
      useFallback = true
      useEglRetry = false
      mode = 'recovery-mode-hold'
      shouldRelaunch = false
      message = 'Crash in recovery mode. No further auto-relaunch to avoid loops.'
    } else if (safeMode || nextGpuCrashCount >= GPU_LOCK_THRESHOLD) {
      useFallback = true
      useEglRetry = false
      safeMode = true
      mode = 'safe-mode-locked'
      message = 'Crash threshold reached (>=6). Locking safe mode.'
    } else if (nextGpuCrashCount >= GPU_TEMP_FALLBACK_THRESHOLD) {
      useFallback = true
      useEglRetry = false
      mode = 'temporary-fallback'
      message = 'Crash threshold reached (3-5). Enabling temporary software fallback.'
    } else {
      useFallback = false
      useEglRetry = false
      mode = 'retry-hardware'
      message = 'Crash count below 3. Retrying hardware mode.'
    }
  } else if (crashClass === CRASH_CLASS.SANDBOX) {
    useEglRetry = false
    mode = nextSandboxCrashCount >= SANDBOX_LOCK_THRESHOLD ? 'sandbox-locked-fallback' : 'sandbox-retry'
    message = 'Sandbox/zygote crash detected. Retrying with sandbox fallback.'
  }

  const decision = {
    event,
    crashClass,
    reason,
    exitCode,
    crashCount: nextGpuCrashCount,
    gpuCrashCount: nextGpuCrashCount,
    sandboxCrashCount: nextSandboxCrashCount,
    useFallback,
    useSandboxFallback,
    useEglRetry,
    fallbackStage,
    safeMode,
    allowRetryHardware,
    shouldRelaunch,
    mode,
    message,
    emergencySoftware,
  }

  log('error', 'crash_detected', {
    event,
    crashClass: decision.crashClass,
    reason: decision.reason,
    exitCode: decision.exitCode,
    crashCount: decision.crashCount,
    environmental1002Count: state.persisted.environmental1002Count,
    sandboxCrashCount: decision.sandboxCrashCount,
    useFallback: decision.useFallback,
    useSandboxFallback: decision.useSandboxFallback,
    useEglRetry: decision.useEglRetry,
    fallbackStage: decision.fallbackStage,
    allowRetryHardware: decision.allowRetryHardware,
    safeMode: decision.safeMode,
    mode: decision.mode,
    emergencySoftware,
  })

  return decision
}

function relaunchWithFallback({
  useFallback = true,
  safeMode = false,
  useSandboxFallback = false,
  useEglRetry = false,
  fallbackStage = null,
  source = 'unknown',
  reason = 'gpu-crash',
} = {}) {
  if (!state.app) return false
  if (state.relaunchScheduled) return false

  const now = Date.now()
  state.relaunchTimestamps = state.relaunchTimestamps.filter((ts) => (now - ts) <= RELAUNCH_WINDOW_MS)

  if (state.relaunchTimestamps.length >= RELAUNCH_LIMIT) {
    log('error', 'relaunch_loop_blocked', {
      source,
      reason,
      relaunchAttemptsWindow: state.relaunchTimestamps.length,
      relaunchWindowMs: RELAUNCH_WINDOW_MS,
      relaunchLimit: RELAUNCH_LIMIT,
    })
    return false
  }

  const args = buildRelaunchArgs({
    useFallback,
    safeMode,
    useSandboxFallback,
    useEglRetry,
    fallbackStage,
  })

  log('warn', 'relaunch_args', {
    source,
    reason,
    useFallback,
    safeMode,
    useSandboxFallback,
    useEglRetry,
    fallbackStage,
    relaunchArgs: args,
  })

  state.relaunchScheduled = true
  state.relaunchTimestamps.push(now)

  try {
    state.app.relaunch({ args })
    state.app.exit(0)
    return true
  } catch (error) {
    state.relaunchScheduled = false
    log('error', 'relaunch_failed', {
      source,
      reason,
      message: error?.message || 'unknown_error',
    })
    return false
  }
}

function getGPUHealthMetrics() {
  const status = getGPUStatus()
  return {
    profile: status.profile,
    mode: status.mode,
    activeFlags: status.activeFlags,
    fallbackActive: status.fallbackActive,
    sandboxFallbackActive: status.sandboxFallbackActive,
    namespaceSandboxFallbackActive: status.namespaceSandboxFallbackActive,
    crashCount: status.crashCount,
    gpuCrashCount: status.gpuCrashCount,
    environmental1002Count: status.environmental1002Count,
    sandboxCrashCount: status.sandboxCrashCount,
    safeModeLocked: status.safeModeLocked,
    safeModeReason: status.safeModeReason,
    stableLaunches: status.stableLaunches,
    totalLaunchCount: status.totalLaunchCount,
    lastCrashAt: status.lastCrashAt,
    lastReason: status.lastReason,
    validationSummary: status.validationSummary,
    startupProfile: state.runtime.startupProfile,
    enableRasterizationOnNextLaunch: Boolean(state.persisted.enableRasterizationOnNextLaunch),
    relaunchScheduled: state.relaunchScheduled,
    relaunchAttemptsWindow: state.relaunchTimestamps.length,
    hardwareProbeBoot: false,
    launchesSinceLock: 0,
    safeModeSessionCount: 0,
    sandbox: status.environment?.sandbox || null,
  }
}

function markStartupProbeResult({ stable = false, probeMs = 0, diagnostics = null } = {}) {
  let changed = false

  if (stable && !state.persisted.enableRasterizationOnNextLaunch) {
    state.persisted.enableRasterizationOnNextLaunch = true
    changed = true
  }

  if (!stable && state.persisted.enableRasterizationOnNextLaunch && !hasArg(state.flags.optimizedRasterizationFlag)) {
    state.persisted.enableRasterizationOnNextLaunch = false
    changed = true
  }

  if (changed) persistState()

  const status = getGPUStatus()
  log('info', 'startup_gpu_probe_result', {
    stable,
    probeMs,
    mode: status.mode,
    webgl: status.featureStatus?.webgl || 'unknown',
    gpuCompositing: status.featureStatus?.gpu_compositing || 'unknown',
    enableRasterizationOnNextLaunch: Boolean(state.persisted.enableRasterizationOnNextLaunch),
    diagnostics,
  })

  return {
    stable,
    probeMs,
    enableRasterizationOnNextLaunch: Boolean(state.persisted.enableRasterizationOnNextLaunch),
    status,
  }
}

function initGPUManager({ app, logger, flags = {} } = {}) {
  if (app) state.app = app
  if (logger) state.logger = logger
  state.flags = { ...state.flags, ...flags }

  loadPersistedState()
  resetStateIfRequested()
  decayCrashCounters()
  applyStableLaunchPolicy()

  state.environment = detectEnvironment()
  applyBaseFlags()
  registerProcessExitPersistence()
  persistState()

  const status = getGPUStatus()
  state.runtime.startupProfile = status.profile

  log('info', 'gpu_validation_summary', status.validationSummary)

  state.initialized = true
  return status
}

module.exports = {
  initGPUManager,
  getGPUStatus,
  getGPUHealthMetrics,
  markStartupProbeResult,
  shouldUseFallback,
  handleGPUCrash,
  relaunchWithFallback,
}
