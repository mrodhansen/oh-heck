import type { LiveAuth } from './types';

const KEY = (sessionId: string) => `oh-heck-live:${sessionId}`;
const LAST_KEY = 'oh-heck-live:last';

export function saveLiveAuth(auth: LiveAuth) {
  localStorage.setItem(KEY(auth.sessionId), JSON.stringify(auth));
  localStorage.setItem(LAST_KEY, auth.sessionId);
}

export function loadLiveAuth(sessionId: string): LiveAuth | null {
  try {
    const raw = localStorage.getItem(KEY(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveAuth;
    if (!parsed?.token || !parsed?.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLiveAuth(sessionId: string) {
  localStorage.removeItem(KEY(sessionId));
}
