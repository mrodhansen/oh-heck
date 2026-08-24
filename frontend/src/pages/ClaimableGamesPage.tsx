import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { authApi, type ClaimableGame } from '../auth';
import { toUserMessage } from '../api/errors';
import { ClaimableGameCard } from '../components/ClaimableGameCard';
import { useAuth } from '../useAuth';

export function ClaimableGamesPage() {
  const { user, loading: authLoading } = useAuth();
  const [games, setGames] = useState<ClaimableGame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setGames([]);
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

  if (authLoading) {
    return <div className="empty fill-center">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/account" replace />;
  }

  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <div className="page-header">
          <h2 className="page-title">Claim your games</h2>
          <Link to="/account" className="btn ghost sm">
            Back
          </Link>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          You might have played in these games. Don’t forget to claim them.
        </p>
      </div>
      <div className="page-fit-body stack">
        {error && <div className="banner">{error}</div>}
        {loading && <div className="empty">Looking for games…</div>}
        {!loading && !error && games.length === 0 && (
          <div className="empty">No games to claim.</div>
        )}
        {!loading && games.length > 0 && (
          <div className="card">
            <div className="list claim-list">
              {games.map((g) => (
                <ClaimableGameCard key={g.id} game={g} user={user} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
