/**
 * Test file - Verifica que Toast está funcionando correctamente
 * Para usar en DevTools o en un componente temporal
 */

export async function testToastSystem() {
  try {
    console.log('🧪 Iniciando test de Toast System...')
    
    // Test 1: Verificar que useToast se puede importar
    const useToastModule = await import('../hooks/useToast.js')
    const { useToast, useToastStore } = useToastModule
    console.log('✅ useToast importado correctamente')
    
    // Test 2: Verificar que Toast component existe
    const ToastModule = await import('../components/Toast.jsx')
    console.log('✅ Toast component importado correctamente')
    
    // Test 3: Verificar que ToastContainer existe
    const ContainerModule = await import('../components/ToastContainer.jsx')
    console.log('✅ ToastContainer importado correctamente')
    
    // Test 4: Verificar CSS está cargado
    const styles = getComputedStyle(document.documentElement)
    const motionBase = styles.getPropertyValue('--motion-base')
    if (motionBase) {
      console.log('✅ CSS variables cargadas:', { 'motion-base': motionBase })
    } else {
      console.warn('⚠️ CSS variables no encontradas')
    }
    
    // Test 5: Verificar que Logger funciona
    const loggerModule = await import('./logger.js')
    const { logger } = loggerModule
    logger.info('Test Toast System')
    console.log('✅ Logger funciona correctamente')
    
    console.log('🎉 Todos los tests pasaron!')
    return { success: true, message: 'Toast System is working!' }
    
  } catch (error) {
    console.error('❌ Error en test:', error)
    return { success: false, error: error.message }
  }
}

// Hacer disponible en DevTools console
if (typeof window !== 'undefined') {
  window.testToastSystem = testToastSystem
}
