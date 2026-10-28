import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const startupStartedAt = performance.now()

const hideStartupSplash = () => {
  const splash = document.getElementById('startup-splash')
  if (!splash) return
  const remainingTime = Math.max(0, 1400 - (performance.now() - startupStartedAt))
  window.setTimeout(() => {
    splash.classList.add('is-hidden')
    window.setTimeout(() => splash.remove(), 500)
  }, remainingTime)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

hideStartupSplash()
