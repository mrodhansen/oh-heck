import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { startSyncListeners, syncNow } from './offline/sync';
import './styles.css';

const baseraw = import.meta.env.BASE_URL || '/';
const basename = baseraw.endsWith('/') ? baseraw.slice(0, -1) : baseraw;

startSyncListeners();
void syncNow().catch(() => {
  /* initial sync best-effort */
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename || undefined}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
