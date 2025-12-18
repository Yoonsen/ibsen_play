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
    const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
    const swUrl = `${base}sw.js`
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.log('SW registration failed', err)
    })
  })
}
