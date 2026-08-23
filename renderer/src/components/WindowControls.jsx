import React, { memo } from 'react'
import { Minus, Square, X } from 'lucide-react'

/**
 * Controles de ventana, uno solo para toda la app.
 *
 * Antes el ServicePicker pintaba semaforos redondos estilo macOS y la TopBar
 * usaba iconos estilo Windows: dos paradigmas distintos con dos segundos de
 * diferencia entre pantallas. Se queda el orden minimizar · maximizar · cerrar,
 * que es el de GNOME y KDE.
 */
function WindowControls({ className = '' }) {
  return (
    <div className={`window-controls no-drag ${className}`.trim()}>
      <button
        className="window-control-btn"
        onClick={() => window.melo.windowAction('minimize')}
        aria-label="Minimizar ventana"
        title="Minimizar"
      >
        <Minus size={12} aria-hidden="true" />
      </button>
      <button
        className="window-control-btn"
        onClick={() => window.melo.windowAction('maximize-toggle')}
        aria-label="Maximizar o restaurar ventana"
        title="Maximizar"
      >
        <Square size={11} aria-hidden="true" />
      </button>
      <button
        className="window-control-btn window-control-close"
        onClick={() => window.melo.windowAction('close')}
        aria-label="Cerrar ventana"
        title="Cerrar"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  )
}

export default memo(WindowControls)
