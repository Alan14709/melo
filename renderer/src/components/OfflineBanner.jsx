import { useState, useEffect, useRef } from 'react'
import { WifiOff } from 'lucide-react'
import { useToast } from '../hooks/useToast'

export default function OfflineBanner() {
  const [online, setOnline] = useState(true)
  const [show, setShow] = useState(false)
  const { error: showError, success: showSuccess } = useToast()
  // Evita un toast en el arranque y otro por cada evento duplicado del SO:
  // solo avisa cuando el estado realmente cambia.
  const lastOnlineRef = useRef(true)

  useEffect(() => {
    let hideTimer = null

    const announce = (isOnline) => {
      if (lastOnlineRef.current === isOnline) return
      lastOnlineRef.current = isOnline
      if (isOnline) showSuccess('Conexión restaurada')
      else showError('Sin conexión a internet. La reproducción puede detenerse.')
    }

    window.melo.network.getStatus()
      .then((s) => setOnline(s.online))
      .catch(() => {})

    const handleNetworkChange = (data) => {
      setOnline(data.online)
      announce(data.online)
      if (!data.online) {
        setShow(true)
      } else {
        hideTimer = setTimeout(() => setShow(false), 2000)
      }
    }

    const unsubscribeNetwork = window.melo.network.onChange(handleNetworkChange)

    const handleOnline = () => {
      setOnline(true)
      announce(true)
      hideTimer = setTimeout(() => setShow(false), 2000)
    }
    const handleOffline = () => {
      setOnline(false)
      announce(false)
      setShow(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      if (hideTimer) clearTimeout(hideTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (typeof unsubscribeNetwork === 'function') unsubscribeNetwork()
    }
  }, [showError, showSuccess])

  if (online && !show) return null

  return (
    <div className={'offline-banner ' + (online ? 'back-online' : '')} role="status" aria-live="polite">
      <WifiOff size={14} aria-hidden="true" />
      <span>
        {online
          ? 'Conexión restaurada'
          : 'Sin conexión a internet'}
      </span>
    </div>
  )
}
