import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, GameSummary } from '../api';
import { toUserMessage } from '../api/errors';

const RESUME_LIMIT = 5;

export function HomePage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .listGames()
      .then((data) => {
        if (alive) setGames(data);
      })
      .catch((e: unknown) => {
        if (alive) setError(toUserMessage(e, 'Could not load games'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const inProgress = useMemo(
    () =>
      games
        .filter((g) => g.status !== 'COMPLETED')
        .slice(0, RESUME_LIMIT),
    [games],
  );

  return (
    <div className="page-fit">
      <div className="page-fit-header play-home-header">
        <div className="page-header">
          <h2 className="page-title">Single</h2>
          <Link to="/play/score" className="btn ghost sm">
            Back
          </Link>
        </div>
      </div>

      {error && <div className="banner banner-inline">{error}</div>}

      <div className="page-fit-body stack">
        <Link className="btn primary block" to="/new">
          New game
        </Link>

        <section className="stack-sm">
          <h3 className="section-title">Resume</h3>

          {loading && <div className="empty">Loading…</div>}

          {!loading && inProgress.length === 0 && (
            <div className="card empty">No games in progress.</div>
          )}

          {!loading && inProgress.length > 0 && (
            <div className="list">
              {inProgress.map((g) => {
                const leader = [...g.standings].sort(
                  (a, b) => a.place - b.place,
                )[0];
                return (
                  <Link
                    key={g.id}
                    to={`/games/${g.id}`}
                    className="list-item"
                  >
                    <div className="min-w-0">
                      <p className="list-item-title truncate">
                        {g.name ?? 'Game'}
                      </p>
                      <p className="list-item-meta truncate">
                        {g.players.join(', ')}
                      </p>
                      <p className="list-item-status">
                        Round {g.currentRound ?? '—'}
                        {leader
                          ? ` · Lead ${leader.playerName} (${leader.total})`
                          : ''}
                      </p>
                    </div>
                    <span className="list-item-chevron" aria-hidden>
                      ›
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
