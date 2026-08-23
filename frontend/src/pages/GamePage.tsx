import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, GameDetail } from '../api';
import { toUserMessage } from '../api/errors';
import { hasGameNotes } from '../offline/notes';
import { NumberStepper } from '../components/NumberStepper';
import { Scoreboard } from '../components/Scoreboard';
import { EditRoundModal } from '../components/EditRoundModal';
import { GameNotes } from '../components/GameNotes';
import { SuperScorerPlay } from '../components/SuperScorerPlay';
import { SuperScorerTrump } from '../components/SuperScorerTrump';
import { suitGlyph } from '../live/cards';
import { hasTrumpCard } from '../offline/superPlay';
import {
  forbiddenLastBid as computeForbiddenLast,
  TOTAL_ROUNDS,
} from '../offline/rules';
import { buildBidPayload, buildTrickPayload } from '../offline/payloads';
import { onSyncChange } from '../offline/sync';
import { useSocketRoom } from '../useSocketRoom';
import { useAuth } from '../useAuth';
import { downloadGameCsv } from '../exportGameCsv';

function navFrom(state: unknown): 'stats' | 'account' | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return null;
  }
  if (state.from === 'stats' || state.from === 'account') return state.from;
  return null;
}

export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'play' | 'board' | 'notes'>('play');
  const [editRound, setEditRound] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickingClaim, setPickingClaim] = useState(false);
  const [pendingClaim, setPendingClaim] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api.getGame(id);
    setGame(data);
  }, [id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .catch((e: unknown) => {
        if (alive) setError(toUserMessage(e, 'Could not load game'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  useSocketRoom(id ? `game:${id}` : null, 'game:update', () => {
    void load().catch((e: unknown) =>
      setError(toUserMessage(e, 'Could not refresh game')),
    );
  });

  useEffect(() => onSyncChange(() => {
    void load().catch(() => undefined);
  }), [load]);

  const current = useMemo(() => {
    if (!game || game.currentRound == null) return null;
    return game.rounds.find((r) => r.number === game.currentRound) ?? null;
  }, [game]);

  const [lockedBids, setLockedBids] = useState<Record<string, number>>({});
  const [bidStep, setBidStep] = useState(0);
  const [currentBid, setCurrentBid] = useState(0);
  const [forceBurn, setForceBurn] = useState(false);
  const [trickStep, setTrickStep] = useState(0);
  const [currentTricks, setCurrentTricks] = useState(0);
  const [lockedTricks, setLockedTricks] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!current || !game) return;
    setLockedBids({});
    setBidStep(0);
    setCurrentBid(0);
    setForceBurn(false);
    setLockedTricks({});
    setTrickStep(0);
    setCurrentTricks(0);
  }, [current?.id, game?.phase, game?.currentRound]);

  useEffect(() => {
    if (game?.phase === 'completed' || game?.status === 'COMPLETED') {
      setTab((t) => (t === 'play' ? 'board' : t));
    }
  }, [game?.phase, game?.status]);

  const bidOrder = current?.bidOrderPlayerIds ?? [];
  const handSize = current?.handSize ?? 0;
  const isLastBidder = bidStep >= bidOrder.length - 1 && bidOrder.length > 0;
  const currentBidderId = bidOrder[bidStep];
  const currentBidder = game?.players.find((p) => p.id === currentBidderId);

  const priorBidSum = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < bidStep; i++) {
      sum += lockedBids[bidOrder[i]] ?? 0;
    }
    return sum;
  }, [lockedBids, bidOrder, bidStep]);

  const forbiddenLast = useMemo(() => {
    if (!current || !isLastBidder) return null;
    return computeForbiddenLast(priorBidSum, current.handSize);
  }, [current, isLastBidder, priorBidSum]);

  const lockedTrickSum = useMemo(
    () => Object.values(lockedTricks).reduce((a, b) => a + b, 0),
    [lockedTricks],
  );

  const totalBidsLocked = priorBidSum;

  const totalBidsForRound = useMemo(() => {
    if (!current) return 0;
    return current.entries.reduce((sum, e) => sum + (e.bid ?? 0), 0);
  }, [current]);

  if (loading) return <div className="empty fill-center">Loading…</div>;
  if (!game && error) return <div className="banner">{error}</div>;
  if (!game) return <div className="empty fill-center">Game not found</div>;

  const phase = game.phase;
  const isFinished = phase === 'completed' || game.status === 'COMPLETED';
  const canTakeNotes = game.playMode !== 'ONLINE';

  async function confirmBid() {
    if (!game || !current || !currentBidderId) return;
    setError(null);

    if (
      isLastBidder &&
      forbiddenLast !== null &&
      currentBid === forbiddenLast
    ) {
      setError(`Can't bid ${forbiddenLast} — total would be ${handSize}`);
      return;
    }

    const nextLocked = { ...lockedBids, [currentBidderId]: currentBid };

    if (!isLastBidder) {
      setLockedBids(nextLocked);
      setBidStep((s) => s + 1);
      setCurrentBid(0);
      return;
    }

    // FB only applies when last bidder still has a forbidden value
    // (not when already overbid — they may bid anything).
    const applyForceBurn = forceBurn && forbiddenLast !== null;

    setSaving(true);
    try {
      const updated = await api.setBids(
        game.id,
        current.number,
        buildBidPayload(game.players, nextLocked),
        applyForceBurn,
      );
      setGame(updated);
      setLockedBids({});
      setBidStep(0);
      setCurrentBid(0);
      setForceBurn(false);
    } catch (e) {
      setError(toUserMessage(e, 'Failed to save bids'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmTricks() {
    if (!game || !current) return;
    setError(null);
    const order = bidOrder;
    const pid = order[trickStep];
    if (!pid) return;

    const nextLocked = { ...lockedTricks, [pid]: currentTricks };
    const isLast = trickStep >= order.length - 1;

    if (!isLast) {
      setLockedTricks(nextLocked);
      setTrickStep((s) => s + 1);
      setCurrentTricks(0);
      return;
    }

    const sum = Object.values(nextLocked).reduce((a, b) => a + b, 0);
    if (sum !== handSize) {
      setError(`Tricks must sum to ${handSize} (got ${sum})`);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.setTricks(
        game.id,
        current.number,
        buildTrickPayload(order, nextLocked),
      );
      setGame(updated);
      setLockedTricks({});
      setTrickStep(0);
      setCurrentTricks(0);
    } catch (e) {
      setError(toUserMessage(e, 'Failed to save tricks'));
    } finally {
      setSaving(false);
    }
  }

  function undoLastBid() {
    if (bidStep === 0) return;
    const prevId = bidOrder[bidStep - 1];
    const prevValue = lockedBids[prevId] ?? 0;
    const next = { ...lockedBids };
    delete next[prevId];
    setLockedBids(next);
    setBidStep((s) => s - 1);
    setCurrentBid(prevValue);
    setForceBurn(false);
    setError(null);
  }

  function undoLastTrick() {
    if (!game || trickStep === 0) return;
    const order = bidOrder;
    const prevId = order[trickStep - 1];
    const prevValue = lockedTricks[prevId] ?? 0;
    const next = { ...lockedTricks };
    delete next[prevId];
    setLockedTricks(next);
    setTrickStep((s) => s - 1);
    setCurrentTricks(prevValue);
    setError(null);
  }

  const trickPlayerId = bidOrder[trickStep];
  const trickPlayer = game.players.find((p) => p.id === trickPlayerId);
  const remainingTricks = handSize - lockedTrickSum;
  const isLastTrickEntry =
    trickStep >= bidOrder.length - 1 && bidOrder.length > 0;

  const alreadyClaimed = user
    ? game.players.some((p) => p.userId === user.id)
    : false;
  const unclaimed = game.players.filter((p) => !p.userId);
  const canClaim = !alreadyClaimed && unclaimed.length > 0;

  if (pickingClaim) {
    return (
      <ClaimGameScreen
        gameName={game.name}
        players={unclaimed}
        pending={pendingClaim}
        busy={claimBusy}
        error={error}
        onPick={(p) => setPendingClaim(p)}
        onCancel={() => {
          setPickingClaim(false);
          setPendingClaim(null);
          setError(null);
        }}
        onCancelConfirm={() => setPendingClaim(null)}
        onConfirm={async () => {
          if (!pendingClaim) return;
          setClaimBusy(true);
          setError(null);
          try {
            const g = await api.claimSeat(game.id, pendingClaim.id);
            setGame(g);
            setClaimMessage(`Claimed ${possessive(pendingClaim.name)} game.`);
            setPickingClaim(false);
            setPendingClaim(null);
          } catch (e) {
            setError(toUserMessage(e, 'Could not claim'));
          } finally {
            setClaimBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="game-screen">
      <header className="game-topbar">
        <Link
          to={
            navFrom(location.state) === 'stats'
              ? '/stats'
              : navFrom(location.state) === 'account'
                ? '/account'
                : game.tournamentId
                  ? `/play/tournaments/${game.tournamentId}`
                  : '/play/single'
          }
          state={
            navFrom(location.state) === 'stats'
              ? { tab: 'games' }
              : undefined
          }
          className="icon-btn"
          aria-label="Back"
        >
          ←
        </Link>
        <div className="game-tabs">
          {!isFinished && (
            <button
              type="button"
              className={tab === 'play' ? 'active' : ''}
              onClick={() => setTab('play')}
            >
              Play
            </button>
          )}
          <button
            type="button"
            className={tab === 'board' ? 'active' : ''}
            onClick={() => setTab('board')}
          >
            Board
          </button>
          {canTakeNotes && (
            <button
              type="button"
              className={tab === 'notes' ? 'active' : ''}
              onClick={() => setTab('notes')}
              aria-label={
                hasGameNotes(game.notes) ? 'Notes, has notes' : 'Notes'
              }
            >
              Notes
              {hasGameNotes(game.notes) ? (
                <span className="tab-dot" aria-hidden />
              ) : null}
            </button>
          )}
        </div>
        <div className="icon-btn spacer" aria-hidden />
      </header>

      {error && <div className="banner banner-inline">{error}</div>}
      {claimMessage && (
        <div className="banner banner-ok banner-inline">{claimMessage}</div>
      )}

      {(isFinished || tab === 'board') && tab !== 'notes' && (
        <div className="panel-scroll">
          {canClaim && (
            <div className="card claim-panel">
              <button
                type="button"
                className="btn primary block"
                onClick={() => {
                  setError(null);
                  setClaimMessage(null);
                  if (!user) {
                    setError('Sign in to claim this game.');
                    return;
                  }
                  setPickingClaim(true);
                }}
              >
                Claim game
              </button>
            </div>
          )}
          <Scoreboard
            game={game}
            onEditRound={
              game.prelimEditsLocked
                ? undefined
                : (n) => setEditRound(n)
            }
          />
          {isFinished && (
            <div className="card">
              <button
                type="button"
                className="btn ghost block"
                onClick={() => downloadGameCsv(game)}
              >
                Export game
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && canTakeNotes && (
        <GameNotes
          notes={game.notes ?? []}
          onSave={async (notes) => {
            const updated = await api.updateNotes(game.id, notes);
            setGame(updated);
          }}
        />
      )}

      {!isFinished && tab === 'play' && current && (
        <div className="play-layout">
          <header className="phase-header">
            <h2 className="phase-title">
              {game.superScorer && !hasTrumpCard(current.trumpCard) && phase === 'bidding'
                ? 'Choose trump'
                : phase === 'bidding'
                  ? 'Bidding'
                  : game.superScorer
                    ? 'Play'
                    : 'Scoring'}
            </h2>
            <p className="phase-sub">
              Round {current.number}
              <span className="phase-dot">·</span>
              {handSize} cards
              {hasTrumpCard(current.trumpCard) && current.trumpCard ? (
                <>
                  <span className="phase-dot">·</span>
                  {suitGlyph(current.trumpCard.s)}
                </>
              ) : null}
              {phase === 'tricks' && current.forceBurn ? (
                <>
                  <span className="phase-dot">·</span>
                  FB
                </>
              ) : null}
            </p>
            <p className="phase-dealer">
              {game.players.find(
                (p) =>
                  p.id === current.dealerPlayerId ||
                  p.seatIndex === current.dealerSeat,
              )?.name}{' '}
              is Dealer
            </p>
            {!(
              game.superScorer &&
              !hasTrumpCard(current.trumpCard) &&
              phase === 'bidding'
            ) && (
              <p className="phase-total">
                <strong>
                  {phase === 'bidding' ? totalBidsLocked : totalBidsForRound}
                </strong>{' '}
                {(phase === 'bidding' ? totalBidsLocked : totalBidsForRound) <= 1
                  ? 'has been bid'
                  : 'have been bid'}
              </p>
            )}
          </header>

          {phase === 'bidding' &&
            game.superScorer &&
            !hasTrumpCard(current.trumpCard) && (
              <SuperScorerTrump
                saving={saving}
                onSave={async (trumpCard) => {
                  setError(null);
                  setSaving(true);
                  try {
                    const updated = await api.setSuperPlay(
                      game.id,
                      current.number,
                      { trumpCard, plays: [] },
                    );
                    setGame(updated);
                  } catch (e) {
                    setError(toUserMessage(e, 'Failed to save trump'));
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            )}

          {phase === 'bidding' &&
            currentBidder &&
            !(game.superScorer && !hasTrumpCard(current.trumpCard)) && (
            <>
              <div className="play-middle">
                <div className="turn-list">
                  {bidOrder.map((pid, idx) => {
                    const p = game.players.find((x) => x.id === pid)!;
                    const isActive = idx === bidStep;
                    const isDone = idx < bidStep;
                    const isPending = idx > bidStep;
                    const isLast = idx === bidOrder.length - 1;
                    const value = isDone ? lockedBids[pid] : undefined;

                    return (
                      <div
                        key={pid}
                        className={[
                          'turn-card',
                          isActive ? 'expanded' : 'collapsed',
                          isDone ? 'done' : '',
                          isPending ? 'pending' : '',
                          isLast && isActive ? 'dealer' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="turn-card-head">
                          <div className="turn-card-who">
                            <span className="turn-card-name truncate">
                              {p.name}
                            </span>
                            {isLast && (
                              <span className="turn-card-tag">last</span>
                            )}
                          </div>
                          <div className="turn-card-value">
                            {isDone && <strong>{value}</strong>}
                            {(isPending || isActive) && (
                              <span className="muted">—</span>
                            )}
                          </div>
                        </div>

                        {isActive && (
                          <div className="turn-card-body">
                            {isLast && forbiddenLast !== null && (
                              <p className="focus-warn">
                                Cannot bid {forbiddenLast}
                              </p>
                            )}
                            <NumberStepper
                              value={currentBid}
                              min={0}
                              max={handSize}
                              forbidden={isLast ? forbiddenLast : null}
                              onChange={setCurrentBid}
                            />
                            {isLast && forbiddenLast !== null && (
                              <button
                                type="button"
                                className={`fb-toggle ${forceBurn ? 'on' : ''}`}
                                aria-pressed={forceBurn}
                                title="Force Burn"
                                onClick={() => setForceBurn((v) => !v)}
                              >
                                FB
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="action-bar">
                {bidStep > 0 && (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={saving}
                    onClick={undoLastBid}
                  >
                    Undo
                  </button>
                )}
                <button
                  type="button"
                  className="btn primary block"
                  disabled={
                    saving ||
                    (isLastBidder &&
                      forbiddenLast !== null &&
                      currentBid === forbiddenLast)
                  }
                  onClick={confirmBid}
                >
                  {saving ? '…' : 'Confirm bid'}
                </button>
              </div>
            </>
          )}

          {phase === 'tricks' && game.superScorer && (
            <SuperScorerPlay
              game={game}
              current={current}
              saving={saving}
              onSave={async (body) => {
                setError(null);
                setSaving(true);
                try {
                  const updated = await api.setSuperPlay(
                    game.id,
                    current.number,
                    body,
                  );
                  setGame(updated);
                } catch (e) {
                  setError(toUserMessage(e, 'Failed to save play'));
                } finally {
                  setSaving(false);
                }
              }}
            />
          )}

          {phase === 'tricks' && !game.superScorer && trickPlayer && (
            <>
              <div className="play-middle">
                <div className="turn-list">
                  {bidOrder.map((pid, idx) => {
                    const e = current.entries.find((x) => x.playerId === pid)!;
                    const isActive = idx === trickStep;
                    const isDone = idx < trickStep;
                    const isPending = idx > trickStep;
                    const taken = isDone
                      ? lockedTricks[pid]
                      : isActive
                        ? currentTricks
                        : undefined;

                    return (
                      <div
                        key={pid}
                        className={[
                          'turn-card',
                          isActive ? 'expanded' : 'collapsed',
                          isDone ? 'done' : '',
                          isPending ? 'pending' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="turn-card-head">
                          <div className="turn-card-who">
                            <span className="turn-card-name truncate">
                              {e.playerName}
                            </span>
                          </div>
                          <div className="turn-card-value">
                            {isDone ? (
                              <strong>
                                {taken}
                                <span className="value-of">/{e.bid}</span>
                              </strong>
                            ) : (
                              <span className="muted">
                                —
                                <span className="value-of">/{e.bid}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {isActive && (
                          <div className="turn-card-body">
                            <p
                              className="hint"
                              style={{ margin: 0, textAlign: 'center' }}
                            >
                              {remainingTricks - currentTricks} left in round
                            </p>
                            <NumberStepper
                              value={currentTricks}
                              min={0}
                              max={remainingTricks}
                              ofTotal={e.bid ?? 0}
                              onChange={setCurrentTricks}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="action-bar">
                {trickStep > 0 && (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={saving}
                    onClick={undoLastTrick}
                  >
                    Undo
                  </button>
                )}
                <button
                  type="button"
                  className="btn primary block"
                  disabled={
                    saving ||
                    (isLastTrickEntry &&
                      lockedTrickSum + currentTricks !== handSize)
                  }
                  onClick={confirmTricks}
                >
                  {saving
                    ? '…'
                    : isLastTrickEntry
                      ? current.number === TOTAL_ROUNDS
                        ? 'Finish game'
                        : 'Score round'
                      : 'Confirm tricks'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {editRound != null && (
        <EditRoundModal
          game={game}
          roundNumber={editRound}
          onClose={() => setEditRound(null)}
          onSave={async (payload) => {
            const updated = await api.updateRound(game.id, editRound, payload);
            setGame(updated);
          }}
        />
      )}
    </div>
  );
}

function ClaimGameScreen({
  gameName,
  players,
  pending,
  busy,
  error,
  onPick,
  onCancel,
  onCancelConfirm,
  onConfirm,
}: {
  gameName: string | null;
  players: { id: string; name: string }[];
  pending: { id: string; name: string } | null;
  busy: boolean;
  error: string | null;
  onPick: (p: { id: string; name: string }) => void;
  onCancel: () => void;
  onCancelConfirm: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="page-fit">
      <div className="page-fit-header">
        <h2 className="page-title">Claim game</h2>
        <p className="lede">
          Who did you play as
          {gameName ? ` in ${gameName}` : ''}? The table name stays the same.
        </p>
      </div>
      <div className="page-fit-body stack">
        {error && <div className="banner">{error}</div>}
        {players.length === 0 ? (
          <div className="empty">No unclaimed seats left.</div>
        ) : (
          <div className="claim-card-list">
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn mode-card"
                disabled={busy}
                onClick={() => onPick({ id: p.id, name: p.name })}
              >
                <span className="mode-card-title">{p.name}</span>
                <span className="mode-card-meta">Tap to claim this seat</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="action-bar">
        <button
          type="button"
          className="btn ghost block"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      {pending && (
        <div
          className="modal-backdrop"
          onClick={busy ? undefined : onCancelConfirm}
        >
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <p className="section-title" style={{ margin: 0 }}>
              Claim this game?
            </p>
            <p style={{ margin: 0 }}>
              Are you sure you want to claim {possessive(pending.name)} game?
              These stats will count as yours.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={onCancelConfirm}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={onConfirm}
                style={{ flex: 1 }}
              >
                {busy ? '…' : 'Yes, claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}
