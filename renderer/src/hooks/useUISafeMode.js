export function getUISafeMode(gpuStatus = null) {
  const isLinux = typeof navigator !== 'undefined' && navigator.userAgent.includes('Linux')
  const mode = String(gpuStatus?.mode || '')
  const hasGpuStatus = Boolean(gpuStatus && typeof gpuStatus === 'object')

  const softwareLike = mode === 'software'
    || Boolean(gpuStatus?.detectedSoftware)
    || Boolean(gpuStatus?.fallbackActive)
    || Boolean(gpuStatus?.sandboxFallbackActive)
    || Boolean(gpuStatus?.safeModeLocked)

  // En Linux mantenemos modo seguro por defecto hasta tener telemetria GPU confiable.
  const isSafeMode = isLinux
    ? (!hasGpuStatus || softwareLike)
    : softwareLike

  const allowHighEffects = !isSafeMode && mode !== 'software'

  return {
    isSafeMode,
    allowBlur: allowHighEffects,
    allowHeavyAnimations: allowHighEffects,
    allowTransparency: allowHighEffects,
  }
}
