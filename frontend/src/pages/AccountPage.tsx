import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../auth';
import type { StatsPlayer } from '../api';
import { useAuth } from '../useAuth';

type Mode = 'signin' | 'register';

export function AccountPage() {
  const { user, loading, setUser, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<StatsPlayer | null>(null);

  useEffect(() => {
    if (!user) {
      setStats(null);
      return;
    }
    let alive = true;
    authApi
      .myStats()
      .then((s) => {
        if (!alive) return;
        setStats(s.stats);
      })
      .catch(() => {
        if (!alive) return;
        setStats(null);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  async function onAuth(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res =
        mode === 'register'
          ? await authApi.register(username.trim(), password)
          : await authApi.login(username.trim(), password);
      setUser(res.user);
      setPassword('');
      setMessage(mode === 'register' ? 'Account created.' : 'Signed in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await authApi.logout();
      setUser(null);
      setMessage('Signed out.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out');
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      if (!newPassword.length) {
        setError('Enter a new password');
        return;
      }
      const res = await authApi.update({ password: newPassword });
      setUser(res.user);
      setNewPassword('');
      setMessage('Password updated.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="empty fill-center">Loading account…</div>;
  }

  if (!user) {
    return (
      <div className="page-fit">
        <div className="page-fit-header">
          <h2 className="page-title">Account</h2>
          <p className="lede">
            Optional. Sign in to keep stats. Table names stay as entered;
            your account is a separate link on the seat.
          </p>
        </div>
        <div className="page-fit-body stack">
          {error && <div className="banner">{error}</div>}
          {message && <div className="banner banner-ok">{message}</div>}
          <div className="stats-tabs" role="tablist">
            <button
              type="button"
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => setMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>
          <form className="card stack" onSubmit={onAuth}>
            <label className="field">
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={32}
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={200}
                autoComplete={
                  mode === 'register' ? 'new-password' : 'current-password'
                }
                required
                minLength={1}
              />
            </label>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Username is unique and cannot be changed later. Password can be
              anything — even a single character.
            </p>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !username.trim() || !password}
            >
              {busy
                ? '…'
                : mode === 'register'
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <h2 className="page-title">Account</h2>
        <p className="lede">
          Signed in as <strong>{user.username}</strong>
        </p>
      </div>
      <div className="page-fit-body stack">
        {error && <div className="banner">{error}</div>}
        {message && <div className="banner banner-ok">{message}</div>}

        <section className="card stack">
          <h3 className="section-title">Your stats</h3>
          {!stats ? (
            <p className="muted" style={{ margin: 0 }}>
              No claimed games yet. Open a game from Stats and tap Claim game.
            </p>
          ) : (
            <div className="stats-grid">
              <Metric label="Games" value={stats.gamesCompleted} />
              <Metric label="Wins" value={stats.wins} />
              <Metric
                label="Avg score"
                value={stats.avgScore ?? '—'}
              />
              <Metric
                label="Bid %"
                value={
                  stats.bidAccuracy != null ? `${stats.bidAccuracy}%` : '—'
                }
              />
              <Metric label="Podiums" value={stats.podium} />
              <Metric label="Nils made" value={stats.nilsMade} />
            </div>
          )}
          <Link to="/stats" className="btn ghost sm">
            Full stats
          </Link>
        </section>

        <section className="card stack">
          <h3 className="section-title">Password</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Username cannot be changed.
          </p>
          <form className="stack" onSubmit={onSave}>
            <label className="field">
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !newPassword}
            >
              Update password
            </button>
          </form>
        </section>

        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void onLogout()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: '1.1rem' }}>
        {value}
      </div>
    </div>
  );
}


