import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { lockdownWebview } from './utils/lockdownWebview'

// Disable the native right-click menu and devtools/reload shortcuts so the
// app doesn't behave like a browser
lockdownWebview()

// Note: StrictMode removed to prevent double effect execution
// which causes duplicate SSH connections
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ErrorBoundary>,
)
