import { useEffect, useState } from 'react';
import { useApiStatus } from '../useOnline';
import {
  getLastSyncError,
  getPendingCount,
  isOnline,
  onSyncChange,
  syncNow,
} from '../offline/sync';
import { btnClass, cn } from '../ui';

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

  const tone = !online
    ? 'border-sync-offline-border bg-sync-offline text-sync-offline-fg'
    : waking
      ? 'border-sync-waking-border bg-sync-waking text-sync-waking-fg'
      : 'border-sync-online-border bg-sync-online text-sync-online-fg';
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
    <div
      className={cn(
        'mb-2 flex shrink-0 items-center justify-between gap-2.5 rounded-btn border px-2.5 py-2 text-meta',
        tone,
      )}
      role="status"
    >
      <span className="truncate">{label}</span>
      {online && !waking && (pending > 0 || error) && (
        <button
          type="button"
          className={btnClass({ kind: 'ghost', size: 'sm' })}
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
