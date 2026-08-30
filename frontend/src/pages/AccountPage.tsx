import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { accountDisplayName, authApi, type ClaimableGame } from '../auth';
import { api, type StatsPlayer } from '../api';
import { playersForRange, rankBestPlayers } from './bestPlayers';
import { toUserMessage } from '../api/errors';
import { ClaimableGameCard } from '../components/ClaimableGameCard';
import { useAuth } from '../useAuth';
import { clearLocalGameCache } from '../offline/sync';
import {
  banner,
  bannerOk,
  btnClass,
  card,
  cn,
  empty,
  field,
  fillCenter,
  hint,
  list,
  modal,
  modalBackdrop,
  muted,
  pageFit,
  pageFitBody,
  pageTitle,
  row,
  sectionTitle,
  sectionTitlePlain,
  stack,
  statsGrid,
  statTile,
  textLink,
} from '../ui';

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
  const [myRank, setMyRank] = useState<{ place: number; rating: number } | null>(
    null,
  );
  const [claimable, setClaimable] = useState<ClaimableGame[]>([]);
  const [claimableError, setClaimableError] = useState<string | null>(null);
  const [claimableLoading, setClaimableLoading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setStats(null);
      setMyRank(null);
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
    api
      .getStats()
      .then((s) => {
        if (!alive) return;
        const ranked = rankBestPlayers(
          playersForRange(s.players, s.games, 'all'),
        );
        const display = accountDisplayName(user);
        const idx = ranked.findIndex(
          (r) =>
            r.player.userId === user.id ||
            r.player.name === display,
        );
        if (idx < 0) {
          setMyRank(null);
          return;
        }
        const row = ranked[idx];
        if (!row) {
          setMyRank(null);
          return;
        }
        setMyRank({ place: idx + 1, rating: row.rating });
      })
      .catch(() => {
        if (!alive) return;
        setMyRank(null);
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
    return <div className={cn(empty, fillCenter)}>Loading account…</div>;
  }

  if (!user) {
    return (
      <div className={pageFit}>
        <div className={cn(pageFitBody, stack)}>
          {error && <div className={banner}>{error}</div>}
          {message && <div className={bannerOk}>{message}</div>}
          <form className={cn(card, stack)} onSubmit={onAuth}>
            <h2 className={pageTitle}>
              {mode === 'register' ? 'Register' : 'Sign in'}
            </h2>
            {mode === 'register' && (
              <>
                <label className={field}>
                  First name
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={50}
                    autoComplete="given-name"
                    required
                  />
                </label>
                <label className={field}>
                  Last name
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={50}
                    autoComplete="family-name"
                    required
                  />
                </label>
                <label className={field}>
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
            <label className={field}>
              {mode === 'register' ? 'Username' : 'Username or email'}
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={mode === 'register' ? 32 : 254}
                autoComplete="username"
                required
              />
            </label>
            <label className={field}>
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
              <p className={cn(hint, 'm-0')}>
                Need an account?{' '}
                <button
                  type="button"
                  className={textLink}
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
              <p className={cn(hint, 'm-0')}>
                Already have an account?{' '}
                <button
                  type="button"
                  className={textLink}
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
              className={btnClass({ kind: 'primary' })}
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
            className={btnClass({ kind: 'danger' })}
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
    <div className={pageFit}>
      <div className={cn(pageFitBody, stack)}>
        {error && <div className={banner}>{error}</div>}
        {message && <div className={bannerOk}>{message}</div>}

        <section className={cn(card, stack)}>
          <h3 className={sectionTitle}>Profile</h3>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="m-0 text-xl font-650 tracking-tight text-grey-900">
                {user.firstName} {user.lastName}
              </p>
              <p className={cn(muted, 'm-0 text-lede')}>{user.username}</p>
              {user.email ? (
                <p className={cn(muted, 'm-0 text-lede')}>{user.email}</p>
              ) : null}
            </div>
            {myRank ? (
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-label font-650 tracking-wider text-muted">
                  Ranked #{myRank.place}
                </span>
                <span className="font-display text-page font-650 tabular-nums text-grey-900">
                  {myRank.rating}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className={cn(card, stack)}>
          <h3 className={sectionTitle}>Your stats</h3>
          {!stats ? (
            <p className={cn(muted, 'm-0')}>
              No claimed games yet. Open a game from Stats and tap Claim game.
            </p>
          ) : (
            <div className={statsGrid}>
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
            </div>
          )}
          <Link to="/stats" className={btnClass({ kind: 'ghost', size: 'sm' })}>
            Full stats
          </Link>
        </section>

        {(claimableLoading || claimableError || claimable.length > 0) && (
          <section className={cn(card, stack)}>
            <div>
              <h3 className={cn(sectionTitle, sectionTitlePlain)}>
                Claim your games
              </h3>
              <p className={cn(hint, 'm-0')}>
                You might have played in these games. Don’t forget to claim
                them.
              </p>
            </div>
            {claimableLoading && <div className={empty}>Looking for games…</div>}
            {claimableError && (
              <div className={cn(banner, 'shrink-0')}>{claimableError}</div>
            )}
            {!claimableLoading && claimable.length > 0 && (
              <div
                className={cn(
                  list,
                  'mt-1 overflow-visible rounded-none border-x-0 border-b-0 bg-transparent',
                )}
              >
                {claimable.slice(0, CLAIM_PREVIEW).map((g) => (
                  <ClaimableGameCard key={g.id} game={g} user={user} />
                ))}
              </div>
            )}
            {!claimableLoading && claimable.length > 0 && (
              <Link to="/account/claimable" className={btnClass()}>
                Claim many
              </Link>
            )}
            {!claimableLoading && claimable.length > CLAIM_PREVIEW && (
              <Link to="/account/claimable" className={btnClass({ kind: 'ghost' })}>
                See all
              </Link>
            )}
          </section>
        )}

        {passwordOpen && (
          <div
            className={modalBackdrop}
            onClick={busy ? undefined : closePassword}
          >
            <div className={cn(modal, stack)} onClick={(e) => e.stopPropagation()}>
              <p className={cn(sectionTitle, 'mb-0')}>
                Change password
              </p>
              {passwordError ? (
                <div className={cn(banner, 'shrink-0')}>{passwordError}</div>
              ) : null}
              <form className={stack} onSubmit={onSave}>
                <label className={field}>
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
                <div className={cn(row, 'gap-2')}>
                  <button
                    type="button"
                    className={btnClass({ kind: 'ghost' })}
                    disabled={busy}
                    onClick={closePassword}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={cn(btnClass({ kind: 'primary' }), 'flex-1')}
                    disabled={busy || !newPassword}
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
          className={btnClass()}
          disabled={busy}
          onClick={() => void onClearGameCache()}
        >
          Clear local game cache
        </button>

        <button
          type="button"
          className={btnClass()}
          disabled={busy}
          onClick={openPassword}
        >
          Change password
        </button>

        <button
          type="button"
          className={btnClass({ kind: 'danger' })}
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
    <div className={statTile}>
      <div className="text-kicker uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-display text-md font-650 tabular-nums text-grey-900">
        {value}
      </div>
    </div>
  );
}
