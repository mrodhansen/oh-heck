import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, GameDetail } from '../api';
import { toUserMessage } from '../api/errors';
import { tvBoardFingerprint, tvGameStatus } from '../cast/tvStatus';
import { Scoreboard } from '../components/Scoreboard';
import { getCachedGame } from '../offline/db';
import { onSyncChange } from '../offline/sync';
import { useSocketRoom } from '../useSocketRoom';

export function TvScoreboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
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

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const standings = useMemo(() => {
    if (!game) return [];
    return [...game.standings].sort((a, b) => a.place - b.place);
  }, [game]);

  function exitTv() {
    if (window.opener) {
      window.close();
      return;
    }
    if (!id) {
      navigate('/');
      return;
    }
    navigate(`/games/${id}`);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      return;
    }
  }

  if (loading && !game) {
    return <div className="empty fill-center">Loading…</div>;
  }
  if (!game && error) return <div className="banner">{error}</div>;
  if (!game) return <div className="empty fill-center">Game not found</div>;

  return (
    <div className={`tv-screen${fullscreen ? ' is-fullscreen' : ''}`}>
      <header className="tv-chrome">
        <div className="tv-chrome-text">
          <div className="tv-brand">{game.name ?? 'Oh Heck'}</div>
          <div className="tv-status">{tvGameStatus(game)}</div>
        </div>
        <div className="tv-chrome-actions">
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => void toggleFullscreen()}
          >
            Fullscreen
          </button>
          <button type="button" className="btn sm ghost" onClick={exitTv}>
            Exit
          </button>
        </div>
      </header>
      {error ? <div className="banner banner-inline">{error}</div> : null}
      <p className="tv-hint hint">
        Chrome: toolbar Cast icon → Cast tab. Apple: AirPlay this screen. Tap
        to show controls.
      </p>
      <div className="tv-body">
        <section className="card tv-standings">
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
    </div>
  );
}
