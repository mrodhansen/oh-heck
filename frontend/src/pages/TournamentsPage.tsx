import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, TournamentSummary } from '../api';
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

  const load = useCallback(async () => {
    const data = await api.listTournaments();
    setList(data);
  }, []);

  useEffect(() => {
    let alive = true;
    load()
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  useSocketRoom('tournaments', 'tournaments:list', () => {
    void load().catch(() => undefined);
  });

  async function createTourney(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(playerCount);
    if (!Number.isInteger(n) || n < 2 || n > 49) {
      setError('Enter 2–49 players (max 7×7 tables)');
      return;
    }
    setSaving(true);
    try {
      const t = await api.createTournament(n, name.trim() || undefined);
      navigate(`/play/tournaments/${t.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
      setSaving(false);
    }
  }

  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <div className="page-header">
          <h2 className="page-title">Tournaments</h2>
          <Link to="/" className="btn ghost sm">
            Back
          </Link>
        </div>
      </div>

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

        <section className="stack-sm">
          <h3 className="section-title">Open</h3>
          {loading && <div className="empty">Loading…</div>}
          {!loading && list.length === 0 && (
            <div className="card empty">No open tournaments.</div>
          )}
          {!loading && list.length > 0 && (
            <div className="list">
              {list.map((t) => (
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
