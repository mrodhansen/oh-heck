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

  if (loading) return <div className="empty fill-center">Loading…</div>;
  if (!t && error) return <div className="banner">{error}</div>;
  if (!t) return <div className="empty fill-center">Not found</div>;

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
    <div className="page-fit">
      <div className="page-fit-header">
        <div className="page-header">
          <h2 className="page-title truncate">{t.name ?? 'Tournament'}</h2>
          <Link to="/play/tournaments" className="btn ghost sm">
            Back
          </Link>
        </div>
        <p className="lede">{statusLabel(t.status)}</p>
      </div>

      {error && <div className="banner banner-inline">{error}</div>}
      {t.highTableError && (
        <div className="banner banner-inline" role="alert">
          {t.highTableError}
        </div>
      )}

      <div className="page-fit-body stack">
        {t.status === 'OPEN' && (
          <>
            <div className="tourney-count">
              <span className="tourney-count-num">
                {x}/{n}
              </span>
              <span className="tourney-count-label">players entered</span>
            </div>

            {t.proposedTableSizes && t.proposedTableSizes.length > 0 && (
              <p className="hint">
                Tables will be:{' '}
                {t.proposedTableSizes.map((s) => `${s}`).join(' · ')}
              </p>
            )}
            {t.proposedTableSizesError && (
              <p className="hint" role="alert">
                {t.proposedTableSizesError}
              </p>
            )}

            <div className="list name-list">
              {t.players.map((p) => (
                <div key={p.id} className="list-item static">
                  <p className="list-item-title truncate">{p.name}</p>
                  <button
                    type="button"
                    className="name-remove"
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
                className="btn primary block"
                disabled={busy}
                onClick={() => void seatTables()}
              >
                {busy ? 'Seating…' : 'Fill tables'}
              </button>
            )}
          </>
        )}

        {t.status === 'COMPLETED' && t.finalStandings && (
          <section className="stack-sm">
            <h3 className="section-title">Placements</h3>
            <div className="list placement-list">
              {t.finalStandings.map((row) => (
                <div key={row.tournamentPlayerId} className="list-item static placement-row">
                  <span className="placement-place">{row.place}</span>
                  <div className="min-w-0 placement-body">
                    <p className="list-item-title truncate">{row.name}</p>
                    <p className="list-item-meta truncate">
                      {placementMeta(row)}
                    </p>
                  </div>
                  <span className="placement-score">{row.score}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {t.status !== 'OPEN' && (
          <section className="stack-sm">
            <h3 className="section-title">
              {t.status === 'COMPLETED' ? 'Games' : 'Tables'}
            </h3>
            <div className="table-grid">
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
                  className={`table-card ${tb.isHighTable ? 'high' : ''}`}
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
                  <div className="table-card-head">
                    <span className="table-card-title">
                      {tb.isHighTable
                        ? 'High Table'
                        : `Table ${tb.tableNumber}`}
                    </span>
                    <span className="table-card-status">
                      {tableStatusLabel(tb)}
                    </span>
                  </div>
                  <p className="table-card-names">
                    {tb.seats.map((s) => s.name).join(', ')}
                  </p>
                  {tb.standings && tb.status === 'COMPLETED' && (
                    <p className="table-card-meta">
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
        <form className="tourney-add-bar" onSubmit={addName}>
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
            className="btn primary block"
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
    <div className="page-fit">
      <div className="page-fit-header">
        <div className="page-header">
          <h2 className="page-title">
            {table.isHighTable ? 'High Table' : `Table ${table.tableNumber}`}
          </h2>
          <button type="button" className="btn ghost sm" onClick={onBack}>
            Back
          </button>
        </div>
        <p className="lede">
          Seating top → bottom. Dealer is random (bids last, round 1).
        </p>
      </div>

      {error && <div className="banner banner-inline">{error}</div>}

      <div className="page-fit-body">
        <div className="dealer-pick" role="list">
          {seats.map((s) => (
            <div
              key={s.id}
              className={`dealer-option static ${s.isDealer ? 'selected' : ''}`}
              role="listitem"
            >
              <span className="seat-index" aria-hidden>
                {s.seatIndex + 1}
              </span>
              <span className="dealer-name truncate">{s.name}</span>
              {s.isDealer && <span className="dealer-badge">Deals first</span>}
              {s.sourcePlace != null && (
                <span className="seat-source">
                  T{s.sourceTableNumber} · {placeLabel(s.sourcePlace)} (
                  {s.sourceScore})
                </span>
              )}
            </div>
          ))}
        </div>

        {table.standings && table.status === 'COMPLETED' && (
          <div className="card stack-sm" style={{ marginTop: 12 }}>
            <h3 className="section-title">Results</h3>
            {[...table.standings]
              .sort((a, b) => a.place - b.place)
              .map((s) => (
                <div key={s.playerId} className="row space-between">
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

      <div className="action-bar">
        {table.gameId && (
          <button
            type="button"
            className="btn primary block"
            onClick={() => onOpenGame(table.gameId!)}
          >
            {table.status === 'COMPLETED' ? 'View game' : 'Open game'}
          </button>
        )}
        {canStart && (
          <button
            type="button"
            className="btn primary block"
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
