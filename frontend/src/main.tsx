import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './useAuth';
import { startApiStatusWatcher } from './api/health';
import { startSyncListeners } from './offline/sync';
import { getCastAppId } from './cast/snapshot';
import { initCast } from './cast/sender';
import './styles.css';

const baseraw = import.meta.env.BASE_URL || '/';
const basename = baseraw.endsWith('/') ? baseraw.slice(0, -1) : baseraw;

startApiStatusWatcher();
startSyncListeners();
void initCast(getCastAppId()).catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename || undefined}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
