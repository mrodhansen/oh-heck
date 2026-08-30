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
import {
  banner,
  card,
  cn,
  empty,
  fillCenter,
  placeTone,
  score,
  scoreNeg,
  scorePos,
  sectionTitle,
  tvBody,
  tvPlace,
  tvScreen,
  tvStandingList,
  tvStandingName,
  tvStandingRow,
  tvStandings,
  tvTable,
} from '../ui';

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
    <div className={tvScreen}>
      {error ? <div className={cn(banner, 'shrink-0')}>{error}</div> : null}
      <TvFit layoutKey={tvBoardFingerprint(game)}>
        <div className={cn('tv-body', tvBody)}>
          <section className={cn(card, tvStandings)}>
            <h3 className={cn(sectionTitle, 'mb-2 shrink-0 text-mode')}>Leaders</h3>
            <div className={tvStandingList}>
              {standings.map((s) => (
                <div key={s.playerId} className={tvStandingRow(s.place)}>
                  <span className={cn(tvPlace, placeTone(s.place))}>
                    {s.place}
                  </span>
                  <span
                    className={cn(
                      tvStandingName,
                      s.place === 1 && 'font-bold',
                    )}
                  >
                    {s.playerName}
                  </span>
                  <span
                    className={cn(
                      score,
                      'font-display text-3xl leading-none',
                      s.total >= 0 ? scorePos : scoreNeg,
                    )}
                  >
                    {s.total}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <div className={cn('tv-table', tvTable)}>
            <Scoreboard game={game} variant="tv" showStandings={false} />
          </div>
        </div>
      </TvFit>
    </div>
  );
}
