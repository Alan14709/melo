export function getUISafeMode() {
  const isLinux = typeof navigator !== 'undefined' && navigator.userAgent.includes('Linux')

  // En Linux tratamos el render como entorno de bajo GPU por defecto.
  const gpuDisabled = isLinux

  return {
    isSafeMode: isLinux,
    allowBlur: !isLinux && !gpuDisabled,
    allowHeavyAnimations: !isLinux,
    allowTransparency: !isLinux,
  }
}
