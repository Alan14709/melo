import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'

export default function OfflineBanner() {
  const [online, setOnline] = useState(true)
  const [show, setShow] = useState(false)

  useEffect(() => {
    let hideTimer = null

    window.melo.network.getStatus()
      .then((s) => setOnline(s.online))
      .catch(() => {})

    const handleNetworkChange = (data) => {
      setOnline(data.online)
      if (!data.online) {
        setShow(true)
      } else {
        hideTimer = setTimeout(() => setShow(false), 2000)
      }
    }

    const unsubscribeNetwork = window.melo.network.onChange(handleNetworkChange)

    const handleOnline = () => {
      setOnline(true)
      hideTimer = setTimeout(() => setShow(false), 2000)
    }
    const handleOffline = () => {
      setOnline(false)
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
  }, [])

  if (online && !show) return null

  return (
    <div className={'offline-banner ' + (online ? 'back-online' : '')}>
      <WifiOff size={14} />
      <span>
        {online
          ? 'Conexion restaurada'
          : 'Sin conexion a internet'}
      </span>
    </div>
  )
}
