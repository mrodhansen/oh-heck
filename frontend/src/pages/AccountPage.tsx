import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi, type ClaimableGame } from '../auth';
import type { StatsPlayer } from '../api';
import { toUserMessage } from '../api/errors';
import { ClaimableGameCard } from '../components/ClaimableGameCard';
import { useAuth } from '../useAuth';
import { clearLocalGameCache } from '../offline/sync';

const CLAIM_PREVIEW = 3;

type Mode = 'signin' | 'register';

export function AccountPage() {
  const { user, loading, setUser, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<StatsPlayer | null>(null);
  const [claimable, setClaimable] = useState<ClaimableGame[]>([]);
  const [claimableError, setClaimableError] = useState<string | null>(null);
  const [claimableLoading, setClaimableLoading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setStats(null);
      setClaimable([]);
      setClaimableError(null);
      setClaimableLoading(false);
      return;
    }
    let alive = true;
    setClaimableLoading(true);
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
    authApi
      .claimable()
      .then((games) => {
        if (!alive) return;
        setClaimable(games);
        setClaimableError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setClaimable([]);
        setClaimableError(
          toUserMessage(err, 'Could not load games to claim'),
        );
      })
      .finally(() => {
        if (alive) setClaimableLoading(false);
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
          ? await authApi.register({
              username: username.trim(),
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              ...(email.trim() ? { email: email.trim() } : {}),
              password,
            })
          : await authApi.login(username.trim(), password);
      setUser(res.user);
      setPassword('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setMessage(mode === 'register' ? 'Account created.' : 'Signed in.');
    } catch (err) {
      setError(toUserMessage(err, 'Could not sign in'));
    } finally {
      setBusy(false);
    }
  }

  async function onClearGameCache() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await clearLocalGameCache();
      setMessage('Local game cache cleared.');
    } catch (err) {
      setError(toUserMessage(err, 'Could not clear game cache'));
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
      setError(toUserMessage(err, 'Could not sign out'));
    } finally {
      setBusy(false);
    }
  }

  function openPassword() {
    setPasswordError(null);
    setNewPassword('');
    setPasswordOpen(true);
  }

  function closePassword() {
    if (busy) return;
    setPasswordOpen(false);
    setPasswordError(null);
    setNewPassword('');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setPasswordError(null);
    setMessage(null);
    if (!newPassword.length) {
      setPasswordError('Enter a new password');
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.update({ password: newPassword });
      setUser(res.user);
      setNewPassword('');
      setPasswordOpen(false);
      setMessage('Password updated.');
      await refresh();
    } catch (err) {
      setPasswordError(toUserMessage(err, 'Could not update'));
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
        <div className="page-fit-body stack">
          {error && <div className="banner">{error}</div>}
          {message && <div className="banner banner-ok">{message}</div>}
          <form className="card stack" onSubmit={onAuth}>
            <h2 className="page-title">
              {mode === 'register' ? 'Register' : 'Sign in'}
            </h2>
            {mode === 'register' && (
              <>
                <label className="field">
                  First name
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={50}
                    autoComplete="given-name"
                    required
                  />
                </label>
                <label className="field">
                  Last name
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={50}
                    autoComplete="family-name"
                    required
                  />
                </label>
                <label className="field">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={254}
                    autoComplete="email"
                  />
                </label>
              </>
            )}
            <label className="field">
              {mode === 'register' ? 'Username' : 'Username or email'}
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={mode === 'register' ? 32 : 254}
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
            {mode === 'signin' ? (
              <p className="hint" style={{ margin: 0 }}>
                Need an account?{' '}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setMessage(null);
                  }}
                >
                  Register here
                </button>
              </p>
            ) : (
              <p className="hint" style={{ margin: 0 }}>
                Already have an account?{' '}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                    setMessage(null);
                  }}
                >
                  Sign in
                </button>
              </p>
            )}
            <button
              type="submit"
              className="btn primary"
              disabled={
                busy ||
                !username.trim() ||
                !password ||
                (mode === 'register' &&
                  (!firstName.trim() || !lastName.trim()))
              }
            >
              {busy ? '…' : mode === 'register' ? 'Register' : 'Sign in'}
            </button>
          </form>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={() => void onClearGameCache()}
          >
            Clear local game cache
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-fit">
      <div className="page-fit-body stack">
        {error && <div className="banner">{error}</div>}
        {message && <div className="banner banner-ok">{message}</div>}

        <section className="card stack">
          <h3 className="section-title">Profile</h3>
          <div className="profile-identity">
            <p className="profile-name">
              {user.firstName} {user.lastName}
            </p>
            <p className="profile-username">{user.username}</p>
            {user.email ? (
              <p className="profile-email">{user.email}</p>
            ) : null}
          </div>
        </section>

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

        {(claimableLoading || claimableError || claimable.length > 0) && (
          <section className="card stack">
            <div>
              <h3 className="section-title section-title-plain">
                Claim your games
              </h3>
              <p className="hint" style={{ margin: 0 }}>
                You might have played in these games. Don’t forget to claim
                them.
              </p>
            </div>
            {claimableLoading && <div className="empty">Looking for games…</div>}
            {claimableError && (
              <div className="banner banner-inline">{claimableError}</div>
            )}
            {!claimableLoading && claimable.length > 0 && (
              <div className="list claim-list">
                {claimable.slice(0, CLAIM_PREVIEW).map((g) => (
                  <ClaimableGameCard key={g.id} game={g} user={user} />
                ))}
              </div>
            )}
            {!claimableLoading && claimable.length > CLAIM_PREVIEW && (
              <Link to="/account/claimable" className="btn ghost">
                See all
              </Link>
            )}
          </section>
        )}

        {passwordOpen && (
          <div
            className="modal-backdrop"
            onClick={busy ? undefined : closePassword}
          >
            <div className="modal stack" onClick={(e) => e.stopPropagation()}>
              <p className="section-title" style={{ margin: 0 }}>
                Change password
              </p>
              {passwordError ? (
                <div className="banner banner-inline">{passwordError}</div>
              ) : null}
              <form className="stack" onSubmit={onSave}>
                <label className="field">
                  New password
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    maxLength={200}
                    autoComplete="new-password"
                    autoFocus
                  />
                </label>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={closePassword}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={busy || !newPassword}
                    style={{ flex: 1 }}
                  >
                    {busy ? '…' : 'Update password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void onClearGameCache()}
        >
          Clear local game cache
        </button>

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={openPassword}
        >
          Change password
        </button>

        <button
          type="button"
          className="btn danger"
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


