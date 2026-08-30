import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, TournamentSummary } from '../api';
import { toUserMessage } from '../api/errors';
import { newId } from '../offline/rules';
import { onSyncChange } from '../offline/sync';
import { useSocketRoom } from '../useSocketRoom';
import {
  banner,
  btnClass,
  card,
  cn,
  empty,
  field,
  list,
  listItem,
  listItemChevron,
  listItemMeta,
  listItemStatus,
  listItemTitle,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageHeader,
  pageTitle,
  sectionTitle,
  stack,
  stackSm,
} from '../ui';

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
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <div className={pageHeader}>
          <h2 className={pageTitle}>Tournaments</h2>
          <Link to="/play/score" className={btnClass({ kind: 'ghost', size: 'sm' })}>
            Back
          </Link>
        </div>
      </div>

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}

      <div className={cn(pageFitBody, stack)}>
        {!creating ? (
          <button
            type="button"
            className={btnClass({ kind: 'primary', block: true })}
            onClick={() => setCreating(true)}
          >
            New tournament
          </button>
        ) : (
          <form className={cn(card, stackSm)} onSubmit={createTourney}>
            <label className={field}>
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
            <label className={field}>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                maxLength={80}
              />
            </label>
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className={btnClass({ kind: 'ghost' })}
                disabled={saving}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={cn(btnClass({ kind: 'primary' }), 'h-12 min-w-0 flex-1')}
                disabled={saving}
              >
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
  empty: emptyLabel,
  loading,
  items,
}: {
  title: string;
  empty: string;
  loading: boolean;
  items: TournamentSummary[];
}) {
  return (
    <section className={stackSm}>
      <h3 className={sectionTitle}>{title}</h3>
      {loading && <div className={empty}>Loading…</div>}
      {!loading && items.length === 0 && (
        <div className={cn(card, empty)}>{emptyLabel}</div>
      )}
      {!loading && items.length > 0 && (
        <div className={list}>
          {items.map((t) => (
            <Link
              key={t.id}
              to={`/play/tournaments/${t.id}`}
              className={listItem}
            >
              <div className="min-w-0">
                <p className={cn(listItemTitle, 'truncate')}>
                  {t.name ?? 'Tournament'}
                </p>
                <p className={listItemMeta}>
                  {t.playerCount}/{t.targetPlayerCount} players
                  {t.tableCount > 0 ? ` · ${t.tableCount} tables` : ''}
                </p>
                <p className={listItemStatus}>{formatStatus(t.status)}</p>
              </div>
              <span className={listItemChevron} aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
