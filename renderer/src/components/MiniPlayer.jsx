import React, { useEffect, useState } from 'react'
import { Music, SkipBack, Pause, Play, SkipForward, X } from 'lucide-react'

export default function MiniPlayer() {
  const [track, setTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const unsubscribeMedia = window.melo.onMediaUpdate((data) => {
      if (!data?.title) return
      setTrack(data)
      setIsPlaying(data.state === 'playing')
    })

    return () => {
      if (typeof unsubscribeMedia === 'function') unsubscribeMedia()
    }
  }, [])

  return (
    <div className="mini-player">
      <div className="mini-drag drag-region">
        {track?.artwork
          ? <img src={track.artwork} className="mini-artwork" alt="mini" />
          : <div className="mini-artwork-placeholder">
              <Music size={20} />
            </div>
        }
        <div className="mini-info no-drag">
          <p className="mini-title">{track?.title ?? 'Sin reproduccion'}</p>
          <p className="mini-artist">{track?.artist ?? '-'} </p>
        </div>
      </div>

      <div className="mini-controls no-drag">
        <button onClick={() => window.melo.playerAction('previous')}>
          <SkipBack size={14} />
        </button>
        <button className="mini-play" onClick={() => window.melo.playerAction('play')}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button onClick={() => window.melo.playerAction('next')}>
          <SkipForward size={14} />
        </button>
        <button className="mini-close" onClick={() => window.melo.miniToggle()}>
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
