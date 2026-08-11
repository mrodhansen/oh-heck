import { useEffect, useState } from 'react';
import {
  getLastSyncError,
  getPendingCount,
  isOnline,
  onSyncChange,
  syncNow,
} from '../offline/sync';

export function SyncStatus() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setOnline(isOnline());
      setError(getLastSyncError());
      void getPendingCount().then((n) => {
        if (alive) setPending(n);
      });
    };
    refresh();
    const unsub = onSyncChange(refresh);
    const onOnline = () => refresh();
    const onOffline = () => refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online && pending === 0 && !error) return null;

  const label = !online
    ? pending > 0
      ? `Offline · ${pending} pending`
      : 'Offline · changes saved on this device'
    : error
      ? `Sync failed · ${error}`
      : `Syncing ${pending} change${pending === 1 ? '' : 's'}…`;

  return (
    <div
      className={`sync-bar ${online ? 'online' : 'offline'}`}
      role="status"
    >
      <span className="truncate">{label}</span>
      {online && (pending > 0 || error) && (
        <button
          type="button"
          className="btn ghost sm"
          disabled={syncing}
          onClick={() => {
            setSyncing(true);
            void syncNow()
              .catch(() => undefined)
              .finally(() => setSyncing(false));
          }}
        >
          {syncing ? '…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
