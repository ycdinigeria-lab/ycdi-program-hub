import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { installGlobalErrorReporting } from './lib/errors.js'

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
