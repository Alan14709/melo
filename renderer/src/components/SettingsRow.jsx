import React from 'react'

export default function SettingsRow({
  label,
  sublabel,
  type,
  value,
  onChange,
  badge,
  disabled,
  placeholder,
  buttonText,
}) {
  return (
    <div className={`settings-row ${disabled ? 'disabled' : ''}`}>
      <div className="settings-text">
        <p className="label">
          {label}
          {badge && <span className="badge-version">{badge}</span>}
        </p>
        {sublabel && <p className="sublabel">{sublabel}</p>}
      </div>

      <div className="settings-control">
        {type === 'toggle' && (
          <button
            className={`toggle ${value ? 'on' : ''}`}
            onClick={() => !disabled && onChange(!value)}
            disabled={disabled}
          >
            <span />
          </button>
        )}

        {type === 'input' && (
          <input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
          />
        )}

        {type === 'button' && (
          <button className="settings-btn" onClick={onChange} disabled={disabled}>
            {buttonText || 'Ejecutar'}
          </button>
        )}

        {type === 'shortcut' && (
          <span className="shortcut-chip">{value}</span>
        )}

        {type === 'text' && (
          <span className="plain-value">{value}</span>
        )}
      </div>
    </div>
  )
}
