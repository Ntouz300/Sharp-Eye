import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './themes/themes.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker (hors ligne). Ignoré là où il n'est pas disponible (aperçu intégré, navigation privée).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => undefined);
  });
}
