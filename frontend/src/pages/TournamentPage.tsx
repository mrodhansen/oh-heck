import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  TournamentDetail,
  TournamentFinalStanding,
  TournamentTable,
} from '../api';
import { toUserMessage } from '../api/errors';
import { SuperScorerToggle } from '../components/SuperScorerToggle';
import { onSyncChange } from '../offline/sync';
import { useSocketRoom } from '../useSocketRoom';
import {
  actionBar,
  banner,
  btnClass,
  card,
  cn,
  empty,
  fillCenter,
  hint,
  lede,
  list,
  listItem,
  listItemMeta,
  listItemTitle,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageHeader,
  pageTitle,
  row,
  sectionTitle,
  stack,
  stackSm,
} from '../ui';

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [t, setT] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [superScorer, setSuperScorer] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api.getTournament(id);
    setT(data);
  }, [id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((e: unknown) => {
        if (alive) setError(toUserMessage(e, 'Could not load tournament'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  useSocketRoom(id ? `tournament:${id}` : null, 'tournament:update', () => {
    void load().catch((e: unknown) =>
      setError(toUserMessage(e, 'Could not refresh tournament')),
    );
  });

  useEffect(() => onSyncChange(() => {
    void load().catch(() => undefined);
  }), [load]);

  const selectedTable = useMemo(
    () => t?.tables.find((tb) => tb.id === selectedTableId) ?? null,
    [t, selectedTableId],
  );

  async function addName(e: FormEvent) {
    e.preventDefault();
    if (!id || !t) return;
    const name = nameInput.trim();
    if (!name) return;
    setError(null);
    setBusy(true);
    try {
      const next = await api.addTournamentPlayer(id, name);
      setT(next);
      setNameInput('');
    } catch (err) {
      setError(toUserMessage(err, 'Failed to add'));
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(playerId: string) {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      setT(await api.removeTournamentPlayer(id, playerId));
    } catch (err) {
      setError(toUserMessage(err, 'Failed to remove'));
    } finally {
      setBusy(false);
    }
  }

  async function seatTables() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      setT(await api.seatTournament(id));
    } catch (err) {
      setError(toUserMessage(err, 'Failed to seat'));
    } finally {
      setBusy(false);
    }
  }

  async function startGame(tableId: string) {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.startTournamentTable(id, tableId, {
        superScorer,
      });
      setT(res.tournament);
      navigate(`/games/${res.game.id}`);
    } catch (err) {
      setError(toUserMessage(err, 'Failed to start'));
      setBusy(false);
    }
  }

  if (loading) return <div className={cn(empty, fillCenter)}>Loading…</div>;
  if (!t && error) return <div className={banner}>{error}</div>;
  if (!t) return <div className={cn(empty, fillCenter)}>Not found</div>;

  if (selectedTable) {
    return (
      <TableDetail
        table={selectedTable}
        busy={busy}
        error={error}
        onBack={() => setSelectedTableId(null)}
        superScorer={superScorer}
        onToggleSuperScorer={() => setSuperScorer((v) => !v)}
        onStart={() => void startGame(selectedTable.id)}
        onOpenGame={(gameId) => navigate(`/games/${gameId}`)}
      />
    );
  }

  const x = t.players.length;
  const n = t.targetPlayerCount;
  const canSeat =
    t.status === 'OPEN' && x >= n && !t.proposedTableSizesError;

  return (
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <div className={pageHeader}>
          <h2 className={cn(pageTitle, 'truncate')}>{t.name ?? 'Tournament'}</h2>
          <Link to="/play/tournaments" className={btnClass({ kind: 'ghost', size: 'sm' })}>
            Back
          </Link>
        </div>
        <p className={lede}>{statusLabel(t.status)}</p>
      </div>

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}
      {t.highTableError && (
        <div className={cn(banner, 'shrink-0')} role="alert">
          {t.highTableError}
        </div>
      )}

      <div className={cn(pageFitBody, stack)}>
        {t.status === 'OPEN' && (
          <>
            <div className="flex items-baseline gap-2.5 py-2">
              <span className="font-display text-stepper font-bold leading-none tabular-nums">
                {x}/{n}
              </span>
              <span className="text-btn text-muted">players entered</span>
            </div>

            {t.proposedTableSizes && t.proposedTableSizes.length > 0 && (
              <p className={hint}>
                Tables will be:{' '}
                {t.proposedTableSizes.map((s) => `${s}`).join(' · ')}
              </p>
            )}
            {t.proposedTableSizesError && (
              <p className={hint} role="alert">
                {t.proposedTableSizesError}
              </p>
            )}

            <div className={list}>
              {t.players.map((p) => (
                <div key={p.id} className={cn(listItem, 'cursor-default')}>
                  <p className={cn(listItemTitle, 'truncate')}>{p.name}</p>
                  <button
                    type="button"
                    className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-btn border border-line-strong bg-surface text-xl leading-none text-grey-600 enabled:active:bg-sand-200 disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={busy}
                    aria-label={`Remove ${p.name}`}
                    onClick={() => void removePlayer(p.id)}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
              ))}
            </div>

            {canSeat && (
              <button
                type="button"
                className={btnClass({ kind: 'primary', block: true })}
                disabled={busy}
                onClick={() => void seatTables()}
              >
                {busy ? 'Seating…' : 'Fill tables'}
              </button>
            )}
          </>
        )}

        {t.status === 'COMPLETED' && t.finalStandings && (
          <section className={stackSm}>
            <h3 className={sectionTitle}>Placements</h3>
            <div className={list}>
              {t.finalStandings.map((row) => (
                <div
                  key={row.tournamentPlayerId}
                  className={cn(listItem, 'cursor-default items-center')}
                >
                  <span className="w-7 shrink-0 font-display font-bold tabular-nums text-grey-800">
                    {row.place}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(listItemTitle, 'truncate')}>{row.name}</p>
                    <p className={cn(listItemMeta, 'truncate')}>
                      {placementMeta(row)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-grey-700">
                    {row.score}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {t.status !== 'OPEN' && (
          <section className={stackSm}>
            <h3 className={sectionTitle}>
              {t.status === 'COMPLETED' ? 'Games' : 'Tables'}
            </h3>
            <div className="flex flex-col gap-2.5">
              {[...t.tables]
                .sort((a, b) => {
                  if (a.isHighTable !== b.isHighTable) {
                    return a.isHighTable ? -1 : 1;
                  }
                  return a.tableNumber - b.tableNumber;
                })
                .map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  className={cn(
                    'flex w-full min-h-tap cursor-pointer flex-col gap-1.5 rounded-card border border-line-strong bg-surface p-3.5 text-left',
                    tb.isHighTable && 'border-grey-700 bg-sand-100',
                  )}
                  onClick={() => {
                    if (tb.gameId && tb.status === 'IN_PROGRESS') {
                      navigate(`/games/${tb.gameId}`);
                    } else if (tb.gameId && tb.status === 'COMPLETED') {
                      navigate(`/games/${tb.gameId}`);
                    } else {
                      setSelectedTableId(tb.id);
                    }
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-md font-semibold">
                      {tb.isHighTable
                        ? 'High Table'
                        : `Table ${tb.tableNumber}`}
                    </span>
                    <span className="shrink-0 text-label text-muted">
                      {tableStatusLabel(tb)}
                    </span>
                  </div>
                  <p className="m-0 text-btn leading-snug text-grey-700">
                    {tb.seats.map((s) => s.name).join(', ')}
                  </p>
                  {tb.standings && tb.status === 'COMPLETED' && (
                    <p className="m-0 text-hint text-muted">
                      1st{' '}
                      {[...tb.standings]
                        .sort((a, b) => a.place - b.place)[0]
                        ?.playerName ?? '—'}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {t.status === 'OPEN' && (
        <form
          className="mt-auto flex shrink-0 flex-col gap-2 border-t border-line pt-2"
          onSubmit={addName}
        >
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Player name"
            maxLength={40}
            disabled={busy}
            aria-label="Player name"
          />
          <button
            type="submit"
            className={btnClass({ kind: 'primary', block: true })}
            disabled={busy || !nameInput.trim()}
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}

function TableDetail({
  table,
  busy,
  error,
  superScorer,
  onToggleSuperScorer,
  onBack,
  onStart,
  onOpenGame,
}: {
  table: TournamentTable;
  busy: boolean;
  error: string | null;
  superScorer: boolean;
  onToggleSuperScorer: () => void;
  onBack: () => void;
  onStart: () => void;
  onOpenGame: (gameId: string) => void;
}) {
  const canStart = table.status === 'READY' && !table.gameId;
  const seats = [...table.seats].sort((a, b) => a.seatIndex - b.seatIndex);

  return (
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <div className={pageHeader}>
          <h2 className={pageTitle}>
            {table.isHighTable ? 'High Table' : `Table ${table.tableNumber}`}
          </h2>
          <button type="button" className={btnClass({ kind: 'ghost', size: 'sm' })} onClick={onBack}>
            Back
          </button>
        </div>
        <p className={lede}>
          Seating top → bottom. Dealer is random (bids last, round 1).
        </p>
      </div>

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}

      <div className={pageFitBody}>
        <div className="flex flex-col gap-2" role="list">
          {seats.map((s) => (
            <div
              key={s.id}
              className={cn(
                'flex w-full min-h-stepper cursor-default flex-wrap items-center gap-2 rounded-btn border border-line bg-surface px-2 py-3 pl-3.5 text-left text-grey-900',
                s.isDealer && 'border-grey-700 bg-sand-100 shadow-inset-sel',
              )}
              role="listitem"
            >
              <span className="w-6 shrink-0 text-meta tabular-nums text-muted" aria-hidden>
                {s.seatIndex + 1}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-md font-semibold',
                  s.isDealer && 'font-bold',
                )}
              >
                {s.name}
              </span>
              {s.isDealer && (
                <span className="ml-auto shrink-0 text-xs font-semibold text-ok">
                  Deals first
                </span>
              )}
              {s.sourcePlace != null && (
                <span className="ml-8 basis-full text-hint text-muted">
                  T{s.sourceTableNumber} · {placeLabel(s.sourcePlace)} (
                  {s.sourceScore})
                </span>
              )}
            </div>
          ))}
        </div>

        {table.standings && table.status === 'COMPLETED' && (
          <div className={cn(card, stackSm, 'mt-3')}>
            <h3 className={sectionTitle}>Results</h3>
            {[...table.standings]
              .sort((a, b) => a.place - b.place)
              .map((s) => (
                <div key={s.playerId} className={cn(row, 'justify-between')}>
                  <span>
                    {s.place}. {s.playerName}
                  </span>
                  <strong>{s.total}</strong>
                </div>
              ))}
          </div>
        )}

        {canStart && (
          <SuperScorerToggle on={superScorer} onToggle={onToggleSuperScorer} />
        )}
      </div>

      <div className={actionBar}>
        {table.gameId && (
          <button
            type="button"
            className={btnClass({ kind: 'primary', block: true })}
            onClick={() => onOpenGame(table.gameId!)}
          >
            {table.status === 'COMPLETED' ? 'View game' : 'Open game'}
          </button>
        )}
        {canStart && (
          <button
            type="button"
            className={btnClass({ kind: 'primary', block: true })}
            disabled={busy}
            onClick={onStart}
          >
            {busy ? 'Starting…' : 'Start game'}
          </button>
        )}
      </div>
    </div>
  );
}

function statusLabel(s: TournamentDetail['status']): string {
  switch (s) {
    case 'OPEN':
      return 'Open — add player names';
    case 'SEATED':
      return 'Tables ready — start each game';
    case 'IN_PROGRESS':
      return 'Games in progress';
    case 'HIGH_TABLE':
      return 'High table';
    case 'COMPLETED':
      return 'Tournament complete';
    default:
      return s;
  }
}

function tableStatusLabel(tb: TournamentTable): string {
  if (tb.status === 'COMPLETED') return 'Done';
  if (tb.status === 'IN_PROGRESS' || tb.gameStatus === 'BIDDING' || tb.gameStatus === 'PLAYING') {
    return tb.currentRound != null ? `Round ${tb.currentRound}` : 'Playing';
  }
  if (tb.status === 'READY') return 'Ready';
  return tb.status;
}

function placeLabel(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

function placementMeta(row: TournamentFinalStanding): string {
  if (row.source === 'HIGH_TABLE') {
    const bits = ['High table'];
    if (row.highTablePlace != null) bits.push(placeLabel(row.highTablePlace));
    if (row.prelimPlace != null && row.prelimTableNumber != null) {
      bits.push(`from T${row.prelimTableNumber} ${placeLabel(row.prelimPlace)}`);
    }
    return bits.join(' · ');
  }
  const bits: string[] = [];
  if (row.prelimTableNumber != null) bits.push(`Table ${row.prelimTableNumber}`);
  if (row.prelimPlace != null) bits.push(placeLabel(row.prelimPlace));
  return bits.join(' · ') || 'Prelim';
}
