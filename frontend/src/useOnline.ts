import { useEffect, useState } from 'react';
import { isOnline } from './offline/sync';

/** Reactive navigator.onLine for gating online-only UI. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => {
    const sync = () => setOnline(isOnline());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return online;
}
