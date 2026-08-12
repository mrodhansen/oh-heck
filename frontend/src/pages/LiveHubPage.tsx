import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { liveApi } from '../live/api';
import { saveLiveAuth } from '../live/session';
import type { LiveGoneSeat, LiveLookup } from '../live/types';
import { useAuth } from '../useAuth';
import { useOnline } from '../useOnline';

export function LiveHubPage() {
  const nav = useNavigate();
  const online = useOnline();
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const [code, setCode] = useState('');
  const [createName, setCreateName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [lookup, setLookup] = useState<LiveLookup | null>(null);
  const [step, setStep] = useState<'hub' | 'name' | 'claim'>('hub');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoJoinTried, setAutoJoinTried] = useState(false);

  useEffect(() => {
    if (user?.username) {
      setCreateName(user.username);
      setJoinName(user.username);
    }
  }, [user]);

  useEffect(() => {
    if (!online) return;
    const q = params.get('code');
    if (!q) return;
    setCode(q.replace(/\D/g, '').slice(0, 4));
    let alive = true;
    liveApi
      .lookup(q)
      .then((res) => {
        if (!alive) return;
        applyLookup(res);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [params, online]);

  // Signed-in: after code lookup in lobby, join with account name automatically
  useEffect(() => {
    if (authLoading || !user || step !== 'name' || !lookup || autoJoinTried) {
      return;
    }
    if (lookup.status !== 'LOBBY') return;
    setAutoJoinTried(true);
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await liveApi.join(lookup.code, user.username);
        saveLiveAuth({
          sessionId: res.id,
          playerId: res.playerId,
          token: res.token,
          name: res.me.name,
          code: res.code,
        });
        nav(`/live/${res.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not join');
        setJoinName(user.username);
      } finally {
        setBusy(false);
      }
    })();
  }, [authLoading, user, step, lookup, autoJoinTried, nav]);

  if (!online) {
    return <Navigate to="/" replace />;
  }

  function applyLookup(res: LiveLookup) {
    setLookup(res);
    setCode(res.code);
    setAutoJoinTried(false);
    if (res.status === 'PLAYING') {
      setStep('claim');
    } else {
      setStep('name');
    }
  }

  async function onJoinCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter a game code');
      return;
    }
    setBusy(true);
    try {
      const res = await liveApi.lookup(trimmed);
      applyLookup(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  }

  async function onJoinWithName(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await liveApi.join(code.trim(), joinName.trim());
      saveLiveAuth({
        sessionId: res.id,
        playerId: res.playerId,
        token: res.token,
        name: res.me.name,
        code: res.code,
      });
      nav(`/live/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  async function onClaim(seat: LiveGoneSeat) {
    setError(null);
    setBusy(true);
    try {
      const res = await liveApi.claim(code.trim(), seat.id);
      saveLiveAuth({
        sessionId: res.id,
        playerId: res.playerId,
        token: res.token,
        name: res.me.name,
        code: res.code,
      });
      nav(`/live/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim seat');
      try {
        const res = await liveApi.lookup(code.trim());
        applyLookup(res);
      } catch {
        /* keep error */
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = (user?.username ?? createName).trim();
    if (!name) {
      setError('Enter your name');
      return;
    }
    setBusy(true);
    try {
      const res = await liveApi.create(name);
      saveLiveAuth({
        sessionId: res.id,
        playerId: res.playerId,
        token: res.token,
        name: res.me.name,
        code: res.code,
      });
      nav(`/live/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create game');
    } finally {
      setBusy(false);
    }
  }

  function backToHub() {
    setStep('hub');
    setLookup(null);
    setError(null);
    setAutoJoinTried(false);
  }

  if (step === 'claim' && lookup) {
    return (
      <div className="page-fit">
        <div className="page-fit-header">
          <h2 className="page-title">Take a seat</h2>
          <p className="lede">
            Game <strong>{lookup.code}</strong> is in progress. Choose a player
            who left.
          </p>
        </div>
        <div className="page-fit-body stack">
          {error && <div className="banner">{error}</div>}
          {lookup.gonePlayers.length === 0 ? (
            <div className="empty">No open seats right now.</div>
          ) : (
            <div className="stack">
              {lookup.gonePlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn mode-card claim-seat-btn"
                  disabled={busy}
                  onClick={() => onClaim(p)}
                >
                  <span className="mode-card-title">{p.name}</span>
                  <span className="mode-card-meta">
                    {p.isHost ? 'Host · ' : ''}
                    Gone — tap to play as them
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className="btn ghost" onClick={backToHub}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (step === 'name') {
    if (user && busy) {
      return (
        <div className="page-fit">
          <div className="empty fill-center">
            Joining as {user.username}…
          </div>
        </div>
      );
    }
    return (
      <div className="page-fit">
        <div className="page-fit-header">
          <h2 className="page-title">Your name</h2>
          <p className="lede">
            Joining game <strong>{code.trim()}</strong>
          </p>
        </div>
        <form className="page-fit-body stack" onSubmit={onJoinWithName}>
          {error && <div className="banner">{error}</div>}
          <label className="field">
            Name
            <input
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              maxLength={24}
              autoFocus
              autoComplete="nickname"
              placeholder="Enter name"
            />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost" onClick={backToHub}>
              Back
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !joinName.trim()}
              style={{ flex: 1 }}
            >
              {busy ? 'Joining…' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="page-fit">
      <div className="page-fit-header play-home-header">
        <h2 className="page-title">Live game</h2>
        <p className="lede">
          {user
            ? `Signed in as ${user.username} — create joins you automatically.`
            : 'Enter a code or create a new table.'}
        </p>
      </div>
      <div className="page-fit-body stack">
        {error && <div className="banner">{error}</div>}

        <form className="card stack" onSubmit={onJoinCode}>
          <label className="field">
            Game code
            <input
              type="number"
              className="code-input"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              onWheel={(e) => e.currentTarget.blur()}
              min={1000}
              max={9999}
              step={1}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="4821"
            />
          </label>
          <button
            type="submit"
            className="btn primary"
            disabled={busy || code.trim().length < 4}
          >
            Join
          </button>
        </form>

        <div className="divider-or">or</div>

        <form className="card stack" onSubmit={onCreate}>
          {user ? (
            <p className="muted" style={{ margin: 0 }}>
              You will join as <strong>{user.username}</strong>
            </p>
          ) : (
            <label className="field">
              Your name
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={24}
                autoComplete="nickname"
                placeholder="Host name"
              />
            </label>
          )}
          <button
            type="submit"
            className="btn primary"
            disabled={busy || !(user?.username || createName.trim())}
          >
            {busy ? 'Creating…' : 'Create new game'}
          </button>
        </form>

        <Link to="/" className="btn ghost">
          Back
        </Link>
      </div>
    </div>
  );
}
