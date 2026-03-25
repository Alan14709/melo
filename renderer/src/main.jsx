import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import MiniPlayer from './components/MiniPlayer.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles/globals.css'
import './styles/themes.css'

const isMini = window.location.hash === '#mini'
const root = document.getElementById('root')

if (!root) {
  console.error('No se encontro el elemento root')
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        {isMini ? <MiniPlayer /> : <App />}
      </ErrorBoundary>
    </React.StrictMode>
  )
}
