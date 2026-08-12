import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, TournamentSummary } from '../api';
import { toUserMessage } from '../api/errors';
import { SyncStatus } from '../components/SyncStatus';
import { newId } from '../offline/rules';
import { onSyncChange } from '../offline/sync';
import { useSocketRoom } from '../useSocketRoom';

export function TournamentsPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<TournamentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [playerCount, setPlayerCount] = useState('16');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const createIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const data = await api.listTournaments({ all: true });
    setList(data);
  }, []);

  useEffect(() => {
    let alive = true;
    load()
      .catch((e: unknown) => {
        if (alive) setError(toUserMessage(e, 'Could not load tournaments'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  useSocketRoom('tournaments', 'tournaments:list', () => {
    void load().catch((e: unknown) =>
      setError(toUserMessage(e, 'Could not refresh tournaments')),
    );
  });

  useEffect(() => onSyncChange(() => {
    void load().catch(() => undefined);
  }), [load]);

  async function createTourney(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(playerCount);
    if (!Number.isInteger(n) || n < 2 || n > 49) {
      setError('Enter 2–49 players (max 7×7 tables)');
      return;
    }
    setSaving(true);
    if (!createIdRef.current) createIdRef.current = newId();
    try {
      const t = await api.createTournament({
        targetPlayerCount: n,
        id: createIdRef.current,
        name: name.trim() || undefined,
      });
      createIdRef.current = null;
      navigate(`/play/tournaments/${t.id}`);
    } catch (err) {
      setError(toUserMessage(err, 'Failed to create'));
      setSaving(false);
    }
  }

  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <div className="page-header">
          <h2 className="page-title">Tournaments</h2>
          <Link to="/play/score" className="btn ghost sm">
            Back
          </Link>
        </div>
      </div>

      <SyncStatus />
      {error && <div className="banner banner-inline">{error}</div>}

      <div className="page-fit-body stack">
        {!creating ? (
          <button
            type="button"
            className="btn primary block"
            onClick={() => setCreating(true)}
          >
            New tournament
          </button>
        ) : (
          <form className="card stack-sm" onSubmit={createTourney}>
            <label className="field">
              How many people playing?
              <input
                type="number"
                min={2}
                max={49}
                value={playerCount}
                onChange={(e) => setPlayerCount(e.target.value)}
                required
              />
            </label>
            <label className="field">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                maxLength={80}
              />
            </label>
            <div className="action-bar form-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={saving}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary block" disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        )}

        <TournamentListSection
          title="Active"
          empty="No active tournaments."
          loading={loading}
          items={list.filter((t) => t.status !== 'COMPLETED')}
        />
        <TournamentListSection
          title="Completed"
          empty="No completed tournaments yet."
          loading={loading}
          items={list.filter((t) => t.status === 'COMPLETED')}
        />
      </div>
    </div>
  );
}

function formatStatus(s: TournamentSummary['status']): string {
  switch (s) {
    case 'OPEN':
      return 'Adding names';
    case 'SEATED':
      return 'Tables seated';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'HIGH_TABLE':
      return 'High table';
    case 'COMPLETED':
      return 'Completed';
    default:
      return s;
  }
}

function TournamentListSection({
  title,
  empty,
  loading,
  items,
}: {
  title: string;
  empty: string;
  loading: boolean;
  items: TournamentSummary[];
}) {
  return (
    <section className="stack-sm">
      <h3 className="section-title">{title}</h3>
      {loading && <div className="empty">Loading…</div>}
      {!loading && items.length === 0 && (
        <div className="card empty">{empty}</div>
      )}
      {!loading && items.length > 0 && (
        <div className="list">
          {items.map((t) => (
            <Link
              key={t.id}
              to={`/play/tournaments/${t.id}`}
              className="list-item"
            >
              <div className="min-w-0">
                <p className="list-item-title truncate">
                  {t.name ?? 'Tournament'}
                </p>
                <p className="list-item-meta">
                  {t.playerCount}/{t.targetPlayerCount} players
                  {t.tableCount > 0 ? ` · ${t.tableCount} tables` : ''}
                </p>
                <p className="list-item-status">{formatStatus(t.status)}</p>
              </div>
              <span className="list-item-chevron" aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
