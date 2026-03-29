/**
 * Diagnostico para Toast System
 * Ejecutar en DevTools Console
 */

export async function diagnoseToastSystem() {
  console.log('🔍 Iniciando diagnóstico de Toast System...\n')

  try {
    // Test 1: Verificar que los módulos existen
    console.log('📦 Test 1: Importando módulos...')
    const useToastModule = await import('../hooks/useToast.js')
    console.log('✅ useToast module cargado:', Object.keys(useToastModule))

    // Test 2: Verificar que useToastStore existe
    console.log('\n📦 Test 2: Verificando useToastStore...')
    const { useToastStore } = useToastModule
    console.log('✅ useToastStore existe:', typeof useToastStore)
    
    // Test 3: Obtener el estado actual
    console.log('\n📦 Test 3: Obteniendo estado actual...')
    const initialState = useToastStore.getState()
    console.log('✅ Estado inicial:', {
      toastCount: initialState.toasts.length,
      hasAdd: typeof initialState.add,
      hasRemove: typeof initialState.remove,
      hasClear: typeof initialState.clear,
    })

    // Test 4: Intentar agregar un toast
    console.log('\n📦 Test 4: Agregando toast...')
    const id = initialState.add('Test Toast - Éxito', 'success', 3000)
    console.log('✅ Toast agregado con ID:', id)

    // Test 5: Verificar que el toast está en el store
    console.log('\n📦 Test 5: Verificando que el toast está en store...')
    const stateWithToast = useToastStore.getState()
    console.log('✅ Toasts en store:', stateWithToast.toasts)

    // Test 6: Verificar que el componente está en el DOM
    console.log('\n📦 Test 6: Buscando .toast-container en DOM...')
    const container = document.querySelector('.toast-container')
    if (container) {
      console.log('✅ .toast-container encontrado en DOM')
      console.log('   - Posición:', {
        bottom: window.getComputedStyle(container).bottom,
        right: window.getComputedStyle(container).right,
        zIndex: window.getComputedStyle(container).zIndex,
      })
      console.log('   - Toast elements:', container.querySelectorAll('.toast').length)
    } else {
      console.warn('❌ .toast-container NO encontrado en DOM')
    }

    // Test 7: Verificar CSS variables
    console.log('\n📦 Test 7: Verificando CSS variables...')
    const root = document.documentElement
    const styles = window.getComputedStyle(root)
    console.log('✅ Motion Tokens:', {
      motionBase: styles.getPropertyValue('--motion-base').trim(),
      easeStandard: styles.getPropertyValue('--ease-standard').trim(),
    })

    console.log('\n✅ DIAGNÓSTICO COMPLETADO')
    return {
      status: 'ok',
      toastCount: stateWithToast.toasts.length,
      containerExists: !!container,
    }
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error)
    console.error('Stack:', error.stack)
    return { status: 'error', error: error.message }
  }
}

// Ejecutar
window.diagnoseToastSystem = diagnoseToastSystem
console.log('📌 Diagnostico listo. Ejecuta: await diagnoseToastSystem()')
