import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/tokens.css'
import './index.css'

// Request persistent storage on app startup
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persistent) => {
    console.log(`Persistent storage ${persistent ? 'granted' : 'denied'}`);
  }).catch((error) => {
    console.error('Failed to request persistent storage:', error);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
