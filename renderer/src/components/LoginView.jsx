import React from 'react'
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { Music, Headphones, PlayCircle, Waves, Radio } from 'lucide-react'

const ICONS = {
  music: Music,
  headphones: Headphones,
  'play-circle': PlayCircle,
  waves: Waves,
  radio: Radio,
}

export default function LoginView({ service, onContinue, onBack }) {
  const Icon = ICONS[service.icon] || Music

  return (
    <main className="login-screen">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Volver
      </button>

      <section className="login-card">
        <div className="service-icon-wrap" style={{ '--service-color': service.color }}>
          <Icon size={56} color={service.color} />
        </div>

        <h2>{service.name}</h2>
        <p className="desc">Melo no almacena tus credenciales</p>

        <button className="continue-btn" style={{ backgroundColor: service.color }} onClick={onContinue}>
          Continuar <ArrowRight size={16} />
        </button>

        <p className="legal"><ShieldCheck size={12} /> Login nativo dentro del BrowserView del servicio.</p>
      </section>
    </main>
  )
}
