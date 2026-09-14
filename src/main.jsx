import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const root = document.getElementById('root');
const boot = document.getElementById('ip-boot');
if (boot) boot.remove();

ReactDOM.createRoot(root).render(
  <App />
)
