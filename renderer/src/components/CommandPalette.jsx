import React, { memo, useEffect, useMemo, useRef, useState } from 'react'

const GROUP_LABELS = {
  services: 'Servicios',
  playback: 'Reproducción',
  navigation: 'Navegación',
  ui: 'Interfaz',
}

function CommandPalette({ isOpen, onClose, actions = [] }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const previousFocusRef = useRef(null)

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions
  }, [actions, query])

  const groupedActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) return null

    const groups = {}
    actions.forEach((action) => {
      const g = action.group || 'other'
      if (!groups[g]) groups[g] = []
      groups[g].push(action)
    })
    return groups
  }, [actions, query])

  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement
    setQuery('')
    setSelectedIndex(0)
    const rafId = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) return
    previousFocusRef.current?.focus?.()
  }, [isOpen])

  useEffect(() => {
    if (selectedIndex <= filteredActions.length - 1) return
    setSelectedIndex(0)
  }, [filteredActions, selectedIndex])

  const runAction = (item) => {
    if (!item?.action) return
    item.action()
    onClose()
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!filteredActions.length) return
      setSelectedIndex((prev) => (prev + 1) % filteredActions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!filteredActions.length) return
      setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      runAction(filteredActions[selectedIndex])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="cmdk-search-row">
          <svg className="cmdk-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            className="cmdk-input"
            placeholder="Buscar acciones…"
            aria-label="Buscar acciones"
          />
          <kbd className="cmdk-esc-hint">Esc</kbd>
        </div>

        <div className="cmdk-list" role="listbox" aria-label="Acciones">
          {filteredActions.length === 0 && (
            <p className="cmdk-empty">Sin resultados para "{query}"</p>
          )}

          {groupedActions
            ? Object.entries(groupedActions).map(([groupKey, items]) => (
                <div key={groupKey} className="cmdk-group">
                  <p className="cmdk-group-label">{GROUP_LABELS[groupKey] || groupKey}</p>
                  {items.map((item) => {
                    const flatIndex = filteredActions.indexOf(item)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`cmdk-item ${flatIndex === selectedIndex ? 'active' : ''}`}
                        onMouseEnter={() => setSelectedIndex(flatIndex)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => runAction(item)}
                      >
                        <span className="cmdk-item-label">{item.label}</span>
                        {item.hint && <kbd className="cmdk-hint">{item.hint}</kbd>}
                      </button>
                    )
                  })}
                </div>
              ))
            : filteredActions.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`cmdk-item ${index === selectedIndex ? 'active' : ''}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runAction(item)}
                >
                  <span className="cmdk-item-label">{item.label}</span>
                  {item.hint && <kbd className="cmdk-hint">{item.hint}</kbd>}
                </button>
              ))
          }
        </div>

        <div className="cmdk-footer">
          <span className="cmdk-footer-hint"><kbd>↑↓</kbd> navegar</span>
          <span className="cmdk-footer-hint"><kbd>↵</kbd> ejecutar</span>
          <span className="cmdk-footer-hint"><kbd>⌘K</kbd> cerrar</span>
        </div>
      </div>
    </div>
  )
}

export default memo(CommandPalette)
