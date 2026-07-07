import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Installable app plumbing. The install prompt fires EARLY — capture it here
// so the Briefing page can offer "Install the app" (a standalone window has
// no tab strip: a cleaner, calmer exam frame). The service worker never
// touches /api and adds no offline assessment — shell caching only.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__prismInstallPrompt = e
  window.dispatchEvent(new Event('prism-installable'))
})
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
