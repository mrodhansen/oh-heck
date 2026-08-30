import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, GameSummary } from '../api';
import { toUserMessage } from '../api/errors';
import {
  banner,
  btnClass,
  card,
  empty,
  list,
  listItem,
  listItemChevron,
  listItemMeta,
  listItemStatus,
  listItemTitle,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageHeader,
  pageTitle,
  sectionTitle,
  stack,
  stackSm,
} from '../ui';
import { cn } from '../cn';

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
    <div className={pageFit}>
      <div className={cn(pageFitHeader, 'mb-1')}>
        <div className={pageHeader}>
          <h2 className={pageTitle}>Single</h2>
          <Link to="/play/score" className={btnClass({ kind: 'ghost', size: 'sm' })}>
            Back
          </Link>
        </div>
      </div>

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}

      <div className={cn(pageFitBody, stack)}>
        <Link className={btnClass({ kind: 'primary', block: true })} to="/new">
          New game
        </Link>

        <section className={stackSm}>
          <h3 className={sectionTitle}>Resume</h3>

          {loading && <div className={empty}>Loading…</div>}

          {!loading && inProgress.length === 0 && (
            <div className={cn(card, empty)}>No games in progress.</div>
          )}

          {!loading && inProgress.length > 0 && (
            <div className={list}>
              {inProgress.map((g) => {
                const leader = [...g.standings].sort(
                  (a, b) => a.place - b.place,
                )[0];
                return (
                  <Link
                    key={g.id}
                    to={`/games/${g.id}`}
                    className={listItem}
                  >
                    <div className="min-w-0">
                      <p className={cn(listItemTitle, 'truncate')}>
                        {g.name ?? 'Game'}
                      </p>
                      <p className={cn(listItemMeta, 'truncate')}>
                        {g.players.join(', ')}
                      </p>
                      <p className={listItemStatus}>
                        Round {g.currentRound ?? '—'}
                        {leader
                          ? ` · Lead ${leader.playerName} (${leader.total})`
                          : ''}
                      </p>
                    </div>
                    <span className={listItemChevron} aria-hidden>
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
