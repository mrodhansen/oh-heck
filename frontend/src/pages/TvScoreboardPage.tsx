import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, GameDetail } from '../api';
import { toUserMessage } from '../api/errors';
import { tvBoardFingerprint } from '../cast/tvStatus';
import { Scoreboard } from '../components/Scoreboard';
import { TvFit } from '../components/TvFit';
import { getCachedGame } from '../offline/db';
import { onSyncChange } from '../offline/sync';
import { useSocketRoom } from '../useSocketRoom';
import { banner, card, cn, empty, fillCenter } from '../ui';

export function TvScoreboardPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fingerprintRef = useRef<string | null>(null);

  const applyGame = useCallback((next: GameDetail) => {
    const fp = tvBoardFingerprint(next);
    if (fingerprintRef.current === fp) return;
    fingerprintRef.current = fp;
    setGame(next);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api.getGame(id);
    applyGame(data);
  }, [id, applyGame]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((e: unknown) => {
        if (alive) setError(toUserMessage(e, 'Could not load scoreboard'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  useSocketRoom(id ? `game:${id}` : null, 'game:update', () => {
    void load().catch((e: unknown) =>
      setError(toUserMessage(e, 'Could not refresh scoreboard')),
    );
  });

  useEffect(
    () =>
      onSyncChange(() => {
        void load().catch(() => undefined);
      }),
    [load],
  );

  useEffect(() => {
    if (!id) return;
    const tick = () => {
      void getCachedGame<GameDetail>(id).then((cached) => {
        if (cached) applyGame(cached);
      });
    };
    const interval = window.setInterval(tick, 1500);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        tick();
        void load().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [id, applyGame, load]);

  useEffect(() => {
    const wake = navigator.wakeLock;
    if (!wake) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        sentinel = await wake.request('screen');
      } catch {
        return;
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        void request();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release();
    };
  }, []);

  const standings = useMemo(() => {
    if (!game) return [];
    return [...game.standings].sort((a, b) => a.place - b.place);
  }, [game]);

  if (loading && !game) {
    return <div className={cn(empty, fillCenter)}>Loading…</div>;
  }
  if (!game && error) return <div className={banner}>{error}</div>;
  if (!game) return <div className={cn(empty, fillCenter)}>Game not found</div>;

  return (
    <div className="tv-screen">
      {error ? <div className={cn(banner, 'shrink-0')}>{error}</div> : null}
      <TvFit layoutKey={tvBoardFingerprint(game)}>
        <div className="tv-body">
          <section className={cn(card, 'tv-standings')}>
            <h3 className="section-title">Leaders</h3>
            <div className="tv-standing-list">
              {standings.map((s) => (
                <div
                  key={s.playerId}
                  className={`tv-standing-row${
                    s.place === 1
                      ? ' is-first'
                      : s.place === 2
                        ? ' is-second'
                        : s.place === 3
                          ? ' is-third'
                          : ''
                  }`}
                >
                  <span
                    className={`place ${
                      s.place === 1
                        ? 'gold'
                        : s.place === 2
                          ? 'silver'
                          : s.place === 3
                            ? 'bronze'
                            : ''
                    }`}
                  >
                    {s.place}
                  </span>
                  <span className="tv-standing-name">{s.playerName}</span>
                  <span className={`score ${s.total >= 0 ? 'pos' : 'neg'}`}>
                    {s.total}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <div className="tv-table">
            <Scoreboard game={game} variant="tv" showStandings={false} />
          </div>
        </div>
      </TvFit>
    </div>
  );
}
