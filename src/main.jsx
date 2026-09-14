import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

class StartupBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Industrialpedia startup error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#070b12', color: '#eef4fb', fontFamily: 'system-ui,sans-serif', textAlign: 'center' }}>
          <div>
            <strong style={{ display: 'block', marginBottom: '8px' }}>Industrialpedia</strong>
            <span style={{ color: '#9aa9ba' }}>No fue posible iniciar la aplicación.</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
ReactDOM.createRoot(root).render(
  <StartupBoundary>
    <App />
  </StartupBoundary>
)
