import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  authApi,
  claimSelectedGames,
  type ClaimableGame,
} from '../auth';
import { toUserMessage } from '../api/errors';
import { ClaimableGameCard } from '../components/ClaimableGameCard';
import { useAuth } from '../useAuth';
import {
  actionBar,
  banner,
  bannerOk,
  btnClass,
  card,
  cn,
  empty,
  fillCenter,
  hint,
  list,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageHeader,
  pageTitle,
  stack,
} from '../ui';

export function ClaimableGamesPage() {
  const { user, loading: authLoading } = useAuth();
  const [games, setGames] = useState<ClaimableGame[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setSelected(new Set());
      setError(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    authApi
      .claimable()
      .then((data) => {
        if (!alive) return;
        setGames(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setGames([]);
        setError(toUserMessage(err, 'Could not load games to claim'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  function toggle(gameId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === games.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(games.map((g) => g.id)));
  }

  async function onClaim() {
    if (!user || selected.size === 0) return;
    const ids = games.map((g) => g.id).filter((id) => selected.has(id));
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { claimedIds } = await claimSelectedGames(
        games,
        ids,
        user,
        (id) => {
          setGames((prev) => prev.filter((g) => g.id !== id));
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      );
      setMessage(
        `Claimed ${claimedIds.length} game${claimedIds.length === 1 ? '' : 's'}.`,
      );
    } catch (err: unknown) {
      setError(toUserMessage(err, 'Could not claim games'));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <div className={cn(empty, fillCenter)}>Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/account" replace />;
  }

  const allOn = games.length > 0 && selected.size === games.length;
  const n = selected.size;

  return (
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <div className={pageHeader}>
          <h2 className={pageTitle}>Claim your games</h2>
          <Link to="/account" className={btnClass({ kind: 'ghost', size: 'sm' })}>
            Back
          </Link>
        </div>
        <p className={cn(hint, 'm-0')}>
          Check the games you played, then claim them.
        </p>
      </div>
      <div className={cn(pageFitBody, stack)}>
        {error && <div className={banner}>{error}</div>}
        {message && <div className={bannerOk}>{message}</div>}
        {loading && <div className={empty}>Looking for games…</div>}
        {!loading && !error && games.length === 0 && (
          <div className={empty}>No games to claim.</div>
        )}
        {!loading && games.length > 0 && (
          <div className={cn(card, stack)}>
            <button
              type="button"
              className={btnClass({ kind: 'ghost', size: 'sm' })}
              disabled={busy}
              onClick={toggleAll}
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
            <div
              className={cn(
                list,
                'mt-1 overflow-visible rounded-none border-x-0 border-b-0 bg-transparent',
              )}
            >
              {games.map((g) => (
                <ClaimableGameCard
                  key={g.id}
                  game={g}
                  user={user}
                  selected={selected.has(g.id)}
                  onToggle={toggle}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {!loading && games.length > 0 && (
        <div className={actionBar}>
          <button
            type="button"
            className={btnClass({ kind: 'primary', block: true })}
            disabled={busy || n === 0}
            onClick={() => void onClaim()}
          >
            {busy
              ? '…'
              : n === 0
                ? 'Claim games'
                : `Claim ${n} game${n === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
