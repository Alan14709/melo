import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import MiniPlayer from './components/MiniPlayer.jsx'
import './styles/globals.css'
import './styles/themes.css'

const isMini = window.location.hash === '#mini'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isMini ? <MiniPlayer /> : <App />}
  </React.StrictMode>
)
