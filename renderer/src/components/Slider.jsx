import { useState, useRef, useCallback, useEffect } from 'react'

export function Slider({
  value = 0,
  onChange,
  onChangeEnd,
  formatTooltip,
  color = 'var(--accent)',
  disabled = false,
  className = '',
  ariaLabel,
  step = 0.05,
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const trackRef = useRef(null)

  useEffect(() => {
    if (!isDragging) setLocalValue(value)
  }, [value, isDragging])

  const getValueFromEvent = useCallback((e) => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const raw = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(1, raw))
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (disabled) return
    e.preventDefault()
    setIsDragging(true)
    const val = getValueFromEvent(e)
    setLocalValue(val)
    onChange?.(val)

    const handleMouseMove = (moveEvent) => {
      const nextVal = getValueFromEvent(moveEvent)
      setLocalValue(nextVal)
      onChange?.(nextVal)
    }

    const handleMouseUp = (upEvent) => {
      const nextVal = getValueFromEvent(upEvent)
      setLocalValue(nextVal)
      onChangeEnd?.(nextVal)
      setIsDragging(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [disabled, getValueFromEvent, onChange, onChangeEnd])

  const handleTouchStart = useCallback((e) => {
    if (disabled) return
    setIsDragging(true)
    const val = getValueFromEvent(e)
    setLocalValue(val)
    onChange?.(val)

    const handleTouchMove = (moveEvent) => {
      const nextVal = getValueFromEvent(moveEvent)
      setLocalValue(nextVal)
      onChange?.(nextVal)
    }

    const handleTouchEnd = (endEvent) => {
      const changedTouch = endEvent.changedTouches?.[0]
      const syntheticEvent = changedTouch
        ? { clientX: changedTouch.clientX }
        : endEvent
      const nextVal = getValueFromEvent(syntheticEvent)
      setLocalValue(nextVal)
      onChangeEnd?.(nextVal)
      setIsDragging(false)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }

    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('touchcancel', handleTouchEnd)
  }, [disabled, getValueFromEvent, onChange, onChangeEnd])

  // Teclado: flechas mueven un step, Inicio/Fin van a los extremos.
  // Cada pulsacion es un cambio cerrado, asi que dispara tambien onChangeEnd
  // (en el scrubber eso es lo que ejecuta el seek real).
  const handleKeyDown = useCallback((e) => {
    if (disabled) return

    const jump = e.shiftKey ? step * 2 : step
    let next = null

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = localValue + jump
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = localValue - jump
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = 1
    else return

    e.preventDefault()
    const clamped = Math.max(0, Math.min(1, next))
    setLocalValue(clamped)
    onChange?.(clamped)
    onChangeEnd?.(clamped)
  }, [disabled, localValue, onChange, onChangeEnd, step])

  const showTooltip = isDragging || isHovering
  const pct = (localValue * 100).toFixed(2) + '%'

  return (
    <div
      className={'slider-root ' + className + (disabled ? ' disabled' : '')}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div
        ref={trackRef}
        className="slider-track"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(localValue * 100)}
        aria-valuetext={formatTooltip ? formatTooltip(localValue) : undefined}
      >
        <div
          className="slider-fill"
          style={{
            width: pct,
            background: color,
          }}
        />

        <div
          className={'slider-thumb ' + (showTooltip ? 'visible' : '')}
          style={{
            left: pct,
            background: color,
            boxShadow: isDragging
              ? `0 0 0 4px ${color}30`
              : 'none',
          }}
        >
          {showTooltip && formatTooltip && (
            <div className="slider-tooltip">
              {formatTooltip(localValue)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
