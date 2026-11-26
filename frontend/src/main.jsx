import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (served by Frappe from /assets — no Google Fonts request)
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import './index.css'
import './brand.css'
import App from './App.jsx'
import { initI18n } from './lib/i18n.js'
import { watchTables } from './lib/responsiveTables.js'
import { registerServiceWorker } from './lib/pwa.js'
import { installModalFocus } from './lib/modalFocus.js'

watchTables()
installModalFocus()
registerServiceWorker()

initI18n().finally(() => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
))
