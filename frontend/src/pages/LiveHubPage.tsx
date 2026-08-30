import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toUserMessage } from '../api/errors';
import { liveApi } from '../live/api';
import { saveLiveAuth } from '../live/session';
import type { LiveGoneSeat, LiveLookup } from '../live/types';
import { accountDisplayName } from '../auth';
import { useAuth } from '../useAuth';
import { useApiStatus, useOnline } from '../useOnline';
import {
  actionBar,
  banner,
  btnClass,
  card,
  cn,
  codeInput,
  empty,
  field,
  lede,
  modeCard,
  modeCardMeta,
  modeCardTitle,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageTitle,
  row,
  stack,
} from '../ui';

export function LiveHubPage() {
  const nav = useNavigate();
  const online = useOnline();
  const apiStatus = useApiStatus();
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
    if (!user) return;
    const display = accountDisplayName(user);
    if (!display) return;
    setCreateName((n) => n || display);
    setJoinName((n) => n || display);
  }, [user]);

  const apiReady = apiStatus === 'ready';

  useEffect(() => {
    if (!apiReady) return;
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
  }, [params, apiReady]);

  if (!online) {
    return <Navigate to="/" replace />;
  }

  if (!apiReady) {
    return (
      <div className={pageFit}>
        <div className={pageFitHeader}>
          <h2 className={pageTitle}>Play</h2>
        </div>
        <div className={pageFitBody}>
          <p className={lede}>Waking server… live play will unlock when it is up.</p>
        </div>
        <div className={actionBar}>
          <Link to="/" className={btnClass({ kind: 'primary', block: true })}>
            Back
          </Link>
        </div>
      </div>
    );
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
    const name = (user ? accountDisplayName(user) : createName).trim();
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
      <div className={pageFit}>
        <div className={pageFitHeader}>
          <h2 className={pageTitle}>Take a seat</h2>
          <p className={lede}>
            Game <strong>{lookup.code}</strong> is in progress. Choose a player
            who left.
          </p>
        </div>
        <div className={cn(pageFitBody, stack)}>
          {error && <div className={banner}>{error}</div>}
          {lookup.gonePlayers.length === 0 ? (
            <div className={empty}>No open seats right now.</div>
          ) : (
            <div className={stack}>
              {lookup.gonePlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cn(modeCard, 'cursor-pointer disabled:cursor-not-allowed disabled:opacity-40')}
                  disabled={busy}
                  onClick={() => onClaim(p)}
                >
                  <span className={modeCardTitle}>{p.name}</span>
                  <span className={modeCardMeta}>
                    {p.isHost ? 'Host · ' : ''}
                    Gone — tap to play as them
                  </span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className={btnClass({ kind: 'ghost' })} onClick={backToHub}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (step === 'name') {
    return (
      <div className={pageFit}>
        <div className={pageFitHeader}>
          <h2 className={pageTitle}>Your name</h2>
          <p className={lede}>
            Joining game <strong>{code.trim()}</strong>
            {user
              ? ' — pre-filled from your account. You can change it.'
              : ''}
          </p>
        </div>
        <form className={cn(pageFitBody, stack)} onSubmit={onJoinWithName}>
          {error && <div className={banner}>{error}</div>}
          <label className={field}>
            Name
            <input
              type="text"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              maxLength={40}
              autoFocus
              autoComplete="nickname"
              placeholder="Enter name"
            />
          </label>
          <div className={cn(row, 'gap-2')}>
            <button type="button" className={btnClass({ kind: 'ghost' })} onClick={backToHub}>
              Back
            </button>
            <button
              type="submit"
              className={cn(btnClass({ kind: 'primary' }), 'flex-1')}
              disabled={busy || !joinName.trim()}
            >
              {busy ? 'Joining…' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <h2 className={pageTitle}>Live game</h2>
      </div>
      <div className={cn(pageFitBody, stack)}>
        {error && <div className={banner}>{error}</div>}

        <form className={cn(card, stack)} onSubmit={onJoinCode}>
          <label className={field}>
            Join Game
            <input
              type="number"
              className={codeInput}
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
            className={btnClass({ kind: 'primary' })}
            disabled={busy || code.trim().length < 4}
          >
            Join
          </button>
        </form>

        <div className="text-center text-meta lowercase text-muted">or</div>

        <form className={cn(card, stack)} onSubmit={onCreate}>
          <label className={field}>
            Create a new game
            {user ? null : (
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={40}
                autoComplete="nickname"
                placeholder="Host name"
              />
            )}
          </label>
          <button
            type="submit"
            className={btnClass({ kind: 'primary' })}
            disabled={
              busy || !(user ? accountDisplayName(user) : createName).trim()
            }
          >
            {busy ? 'Creating…' : 'Create new game'}
          </button>
        </form>
      </div>
      <div className={actionBar}>
        <Link to="/" className={btnClass({ kind: 'primary', block: true })}>
          Back
        </Link>
      </div>
    </div>
  );
}
