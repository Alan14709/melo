import React from 'react'

// ErrorBoundary de clase para capturar errores de render y ciclo de vida.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error inesperado en la interfaz',
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('🚨 ErrorBoundary capturó error:', error, errorInfo)
    // Reportar al proceso principal para observabilidad centralizada.
    window.melo?.reportError?.({
      message: error?.message,
      stack: error?.stack,
      info: errorInfo,
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      console.log('✅ ErrorBoundary: renderizando hijos sin error')
      return this.props.children
    }

    console.error('❌ ErrorBoundary mostrando UI de error:', this.state.errorMessage)
    return (
      <div className="error-boundary" role="alert">
        <h2>Algo salio mal</h2>
        <p>{this.state.errorMessage}</p>
        <div className="error-boundary-actions">
          <button type="button" onClick={this.handleRetry}>Reintentar</button>
          <button type="button" onClick={this.handleReload}>Recargar</button>
        </div>
      </div>
    )
  }
}
