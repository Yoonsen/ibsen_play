import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Registrer service worker for PWA (bruk base-url fra Vite/GitHub Pages)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', import.meta.env.BASE_URL || '/').pathname
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.log('SW registration failed', err)
    })
  })
}
