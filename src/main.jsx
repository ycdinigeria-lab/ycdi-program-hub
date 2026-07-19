import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { installGlobalErrorReporting } from './lib/errors.js'
import { registerServiceWorker } from './lib/pwa.js'

// Catches faults that never reach React: async work, event handlers,
// promises nobody awaited.
installGlobalErrorReporting()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary fullPage>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// Only in a real build. During development a cached shell would hide every
// change you just made.
if (import.meta.env.PROD) registerServiceWorker()
