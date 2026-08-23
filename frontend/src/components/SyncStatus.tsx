import { useEffect, useState } from 'react';
import { useApiStatus } from '../useOnline';
import {
  getLastSyncError,
  getPendingCount,
  isOnline,
  onSyncChange,
  syncNow,
} from '../offline/sync';

export function SyncStatus() {
  const apiStatus = useApiStatus();
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

  const waking = apiStatus === 'waking' || apiStatus === 'unknown';
  if (online && !waking && pending === 0 && !error) return null;

  const tone = !online ? 'offline' : waking ? 'waking' : 'online';
  const label = !online
    ? pending > 0
      ? `Offline · ${pending} pending`
      : 'Offline · changes saved on this device'
    : waking
      ? pending > 0
        ? `Waking server… ${pending} change${pending === 1 ? '' : 's'} saved on this device`
        : 'Waking server… you can keep playing'
      : error
        ? `Sync failed · ${error}`
        : `Syncing ${pending} change${pending === 1 ? '' : 's'}…`;

  return (
    <div className={`sync-bar ${tone}`} role="status">
      <span className="truncate">{label}</span>
      {online && !waking && (pending > 0 || error) && (
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
