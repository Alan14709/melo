import React, { memo, useEffect, useMemo, useRef, useState } from 'react'

function CommandPalette({ isOpen, onClose, actions = [] }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const previousFocusRef = useRef(null)

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return actions

    return actions.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
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
    if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      previousFocusRef.current.focus()
    }
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
        <p className="cmdk-title">Command Palette</p>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="cmdk-input"
          placeholder="Buscar acciones..."
          aria-label="Buscar acciones"
        />

        <div className="cmdk-list" role="listbox" aria-label="Acciones">
          {filteredActions.length === 0 && (
            <p className="cmdk-empty">No hay acciones para esa busqueda.</p>
          )}

          {filteredActions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`cmdk-item ${index === selectedIndex ? 'active' : ''}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runAction(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(CommandPalette)
