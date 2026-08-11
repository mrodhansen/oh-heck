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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setOnline(isOnline());
      setSyncError(getLastSyncError());
      void getPendingCount().then(setPending);
    };
    refresh();
    const off = onSyncChange(refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      off();
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  if (online && pending === 0 && !syncError) return null;

  return (
    <div
      className={`sync-bar ${!online ? 'offline' : syncError ? 'offline' : 'online'}`}
    >
      <span>
        {!online
          ? 'Offline — changes saved on device'
          : syncError
            ? `Sync error: ${syncError}`
            : pending > 0
              ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync`
              : 'Online'}
      </span>
      {online && (pending > 0 || syncError) && (
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void syncNow().finally(() => {
              setBusy(false);
              setSyncError(getLastSyncError());
              void getPendingCount().then(setPending);
            });
          }}
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  );
}
