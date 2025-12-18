import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Midlertidig: ikke registrer service worker for å unngå cache/stale i dev/Pages
// Slå på igjen ved behov.
