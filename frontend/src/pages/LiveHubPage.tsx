import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toUserMessage } from '../api/errors';
import { liveApi } from '../live/api';
import { saveLiveAuth } from '../live/session';
import type { LiveGoneSeat, LiveLookup } from '../live/types';
import { useAuth } from '../useAuth';
import { useOnline } from '../useOnline';

export function LiveHubPage() {
  const nav = useNavigate();
  const online = useOnline();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [code, setCode] = useState('');
  const [createName, setCreateName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [lookup, setLookup] = useState<LiveLookup | null>(null);
  const [step, setStep] = useState<'hub' | 'name' | 'claim'>('hub');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.username) return;
    setCreateName((n) => n || user.username);
    setJoinName((n) => n || user.username);
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
      .catch((err: unknown) => {
        if (alive) setError(toUserMessage(err, 'Could not find that game'));
      });
    return () => {
      alive = false;
    };
  }, [params, online]);

  if (!online) {
    return <Navigate to="/" replace />;
  }

  function applyLookup(res: LiveLookup) {
    setLookup(res);
    setCode(res.code);
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
      setError(toUserMessage(err, 'Invalid code'));
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
      setError(toUserMessage(err, 'Could not join'));
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
      setError(toUserMessage(err, 'Could not claim seat'));
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
    const name = createName.trim();
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
      setError(toUserMessage(err, 'Could not create game'));
    } finally {
      setBusy(false);
    }
  }

  function backToHub() {
    setStep('hub');
    setLookup(null);
    setError(null);
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
    return (
      <div className="page-fit">
        <div className="page-fit-header">
          <h2 className="page-title">Your name</h2>
          <p className="lede">
            Joining game <strong>{code.trim()}</strong>
            {user
              ? ' — pre-filled from your account. You can change it.'
              : ''}
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
      <div className="page-fit-header">
        <h2 className="page-title">Live game</h2>
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
          {user ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Account stays {user.username}. The name above is what the table
              shows.
            </p>
          ) : null}
          <button
            type="submit"
            className="btn primary"
            disabled={busy || !createName.trim()}
          >
            {busy ? 'Creating…' : 'Create new game'}
          </button>
        </form>
      </div>
      <div className="action-bar">
        <Link to="/" className="btn ghost block">
          Back
        </Link>
      </div>
    </div>
  );
}
