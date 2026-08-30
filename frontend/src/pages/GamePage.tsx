import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, GameDetail } from '../api';
import { toUserMessage } from '../api/errors';
import { hasGameNotes } from '../offline/notes';
import { NumberStepper } from '../components/NumberStepper';
import { Scoreboard } from '../components/Scoreboard';
import { CastScoreboardButton } from '../components/CastScoreboardButton';
import { EditRoundModal } from '../components/EditRoundModal';
import { GameNotes } from '../components/GameNotes';
import { SuperScorerPlay } from '../components/SuperScorerPlay';
import { SuperScorerTrump } from '../components/SuperScorerTrump';
import { BidReadyScreen } from '../components/BidReadyScreen';
import { suitGlyph } from '../live/cards';
import { hasTrumpCard } from '../offline/superPlay';
import { forbiddenLastBid as computeForbiddenLast } from '../offline/rules';
import { buildBidPayload, buildTrickPayload } from '../offline/payloads';
import {
  allLocked,
  applyTurnContinue,
  lastBidBlocked,
  trickSumBlocked,
} from '../offline/turnContinue';
import { onSyncChange } from '../offline/sync';
import { useSocketRoom } from '../useSocketRoom';
import { useAuth } from '../useAuth';
import {
  downloadGameCsv,
  downloadGameJson,
  downloadGameXml,
} from '../exportGameCsv';
import {
  actionBar,
  actionStack,
  banner,
  bannerOk,
  btnClass,
  card,
  cn,
  empty,
  fillCenter,
  gameScreen,
  gameTabClass,
  gameTabs,
  gameTopbar,
  hint,
  iconBtn,
  iconBtnSpacer,
  lede,
  modal,
  modalBackdrop,
  modeCard,
  modeCardMeta,
  modeCardTitle,
  muted,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageTitle,
  panelScroll,
  phaseDealer,
  phaseDot,
  phaseHeader,
  phaseSub,
  phaseTitle,
  phaseTotal,
  playLayout,
  playMiddle,
  row,
  sectionTitle,
  stack,
  stackSm,
  turnCardBody,
  turnCardClass,
  turnCardHead,
  turnList,
} from '../ui';

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
  const [expandedBidId, setExpandedBidId] = useState<string | null>(null);
  const [currentBid, setCurrentBid] = useState(0);
  const [forceBurn, setForceBurn] = useState(false);
  const [showBidRecap, setShowBidRecap] = useState(false);
  const [lockedTricks, setLockedTricks] = useState<Record<string, number>>({});
  const [expandedTrickId, setExpandedTrickId] = useState<string | null>(null);
  const [currentTricks, setCurrentTricks] = useState(0);

  useEffect(() => {
    if (!current || !game) return;
    const first = current.bidOrderPlayerIds[0] ?? null;
    setLockedBids({});
    setExpandedBidId(first);
    setCurrentBid(0);
    setForceBurn(false);
    setLockedTricks({});
    setExpandedTrickId(first);
    setCurrentTricks(0);
  }, [current?.id, game?.phase, game?.currentRound]);

  useEffect(() => {
    setShowBidRecap(false);
  }, [current?.id, game?.currentRound]);

  useEffect(() => {
    if (game?.phase === 'completed' || game?.status === 'COMPLETED') {
      setTab((t) => (t === 'play' ? 'board' : t));
    }
  }, [game?.phase, game?.status]);

  const bidOrder = current?.bidOrderPlayerIds ?? [];
  const handSize = current?.handSize ?? 0;
  const lastBidderId = bidOrder[bidOrder.length - 1];
  const lastBidValue =
    expandedBidId === lastBidderId
      ? currentBid
      : lastBidderId
        ? lockedBids[lastBidderId]
        : undefined;

  const priorBidSum = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < bidOrder.length - 1; i++) {
      const pid = bidOrder[i];
      if (pid === expandedBidId) {
        sum += currentBid;
      } else {
        sum += lockedBids[pid] ?? 0;
      }
    }
    return sum;
  }, [lockedBids, bidOrder, expandedBidId, currentBid]);

  const forbiddenLast = useMemo(() => {
    if (!current || bidOrder.length === 0) return null;
    return computeForbiddenLast(priorBidSum, current.handSize);
  }, [current, bidOrder.length, priorBidSum]);

  const liveBidSum = useMemo(() => {
    return bidOrder.reduce((sum, pid) => {
      if (pid === expandedBidId) return sum + currentBid;
      return sum + (lockedBids[pid] ?? 0);
    }, 0);
  }, [bidOrder, expandedBidId, currentBid, lockedBids]);

  const lockedTrickSum = useMemo(
    () =>
      bidOrder.reduce((sum, pid) => {
        if (pid === expandedTrickId) return sum + currentTricks;
        return sum + (lockedTricks[pid] ?? 0);
      }, 0),
    [bidOrder, expandedTrickId, currentTricks, lockedTricks],
  );

  const othersTrickSum = useMemo(
    () =>
      bidOrder.reduce((sum, pid) => {
        if (pid === expandedTrickId) return sum;
        return sum + (lockedTricks[pid] ?? 0);
      }, 0),
    [bidOrder, expandedTrickId, lockedTricks],
  );

  const remainingTricks = handSize - othersTrickSum;

  const totalBidsForRound = useMemo(() => {
    if (!current) return 0;
    return current.entries.reduce((sum, e) => sum + (e.bid ?? 0), 0);
  }, [current]);

  if (loading) return <div className={cn(empty, fillCenter)}>Loading…</div>;
  if (!game && error) return <div className={banner}>{error}</div>;
  if (!game) return <div className={cn(empty, fillCenter)}>Game not found</div>;

  const phase = game.phase;
  const isFinished = phase === 'completed' || game.status === 'COMPLETED';
  const canTakeNotes = game.playMode !== 'ONLINE';
  const bidIllegal =
    lastBidValue !== undefined &&
    forbiddenLast !== null &&
    lastBidValue === forbiddenLast;
  const trickSumOk = lockedTrickSum === handSize;
  const bidsReady = allLocked(bidOrder, lockedBids) && expandedBidId == null;
  const tricksReady =
    allLocked(bidOrder, lockedTricks) && expandedTrickId == null;

  function setBidValue(n: number) {
    setCurrentBid(n);
    if (expandedBidId) {
      setLockedBids((prev) => ({ ...prev, [expandedBidId]: n }));
    }
  }

  function setTrickValue(n: number) {
    setCurrentTricks(n);
    if (expandedTrickId) {
      setLockedTricks((prev) => ({ ...prev, [expandedTrickId]: n }));
    }
  }

  function expandBid(pid: string) {
    setError(null);
    setExpandedBidId(pid);
    setCurrentBid(lockedBids[pid] ?? 0);
  }

  function expandTrick(pid: string) {
    setError(null);
    setExpandedTrickId(pid);
    setCurrentTricks(lockedTricks[pid] ?? 0);
  }

  function continueBid() {
    if (!expandedBidId || !current) return;
    setError(null);
    const { locked, nextId } = applyTurnContinue(
      bidOrder,
      lockedBids,
      expandedBidId,
      currentBid,
    );
    setLockedBids(locked);
    if (nextId == null) {
      setExpandedBidId(null);
      const blocked = lastBidBlocked(
        bidOrder,
        locked,
        current.handSize,
        computeForbiddenLast,
      );
      if (blocked) setError(blocked);
      return;
    }
    setExpandedBidId(nextId);
    setCurrentBid(locked[nextId] ?? 0);
  }

  function continueTricks() {
    if (!expandedTrickId) return;
    setError(null);
    const { locked, nextId } = applyTurnContinue(
      bidOrder,
      lockedTricks,
      expandedTrickId,
      currentTricks,
    );
    setLockedTricks(locked);
    if (nextId == null) {
      setExpandedTrickId(null);
      const blocked = trickSumBlocked(bidOrder, locked, handSize);
      if (blocked) setError(blocked);
      return;
    }
    setExpandedTrickId(nextId);
    setCurrentTricks(locked[nextId] ?? 0);
  }

  async function submitBids() {
    if (!game || !current) return;
    setError(null);
    const blocked = lastBidBlocked(
      bidOrder,
      lockedBids,
      current.handSize,
      computeForbiddenLast,
    );
    if (blocked) {
      setError(blocked);
      return;
    }
    const applyForceBurn = forceBurn && forbiddenLast !== null;
    setSaving(true);
    try {
      const updated = await api.setBids(
        game.id,
        current.number,
        buildBidPayload(game.players, lockedBids),
        applyForceBurn,
      );
      setGame(updated);
      setLockedBids({});
      setCurrentBid(0);
      setForceBurn(false);
      setShowBidRecap(!game.superScorer);
    } catch (e) {
      setError(toUserMessage(e, 'Failed to save bids'));
    } finally {
      setSaving(false);
    }
  }

  async function submitTricks() {
    if (!game || !current) return;
    setError(null);
    const blocked = trickSumBlocked(bidOrder, lockedTricks, handSize);
    if (blocked) {
      setError(blocked);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.setTricks(
        game.id,
        current.number,
        buildTrickPayload(bidOrder, lockedTricks),
      );
      setGame(updated);
      setLockedTricks({});
      setCurrentTricks(0);
    } catch (e) {
      setError(toUserMessage(e, 'Failed to save tricks'));
    } finally {
      setSaving(false);
    }
  }

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
    <div className={gameScreen}>
      <header className={gameTopbar}>
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
          className={iconBtn}
          aria-label="Back"
        >
          ←
        </Link>
        <div className={gameTabs}>
          {!isFinished && (
            <button
              type="button"
              className={gameTabClass(tab === 'play')}
              onClick={() => setTab('play')}
            >
              Play
            </button>
          )}
          <button
            type="button"
            className={gameTabClass(tab === 'board')}
            onClick={() => setTab('board')}
          >
            Board
          </button>
          {canTakeNotes && (
            <button
              type="button"
              className={gameTabClass(tab === 'notes')}
              onClick={() => setTab('notes')}
              aria-label={
                hasGameNotes(game.notes) ? 'Notes, has notes' : 'Notes'
              }
            >
              Notes
              {hasGameNotes(game.notes) ? (
                <span
                  className="mb-px ml-1 inline-block size-1.5 rounded-full bg-grey-700 align-middle"
                  aria-hidden
                />
              ) : null}
            </button>
          )}
        </div>
        <div
          className={iconBtnSpacer}
          aria-hidden
        />
      </header>

      {error && (isFinished || tab !== 'play') && (
        <div className={cn(banner, 'shrink-0')}>{error}</div>
      )}
      {claimMessage && (
        <div className={cn(bannerOk, 'shrink-0')}>{claimMessage}</div>
      )}

      {(isFinished || tab === 'board') && tab !== 'notes' && (
        <div className={panelScroll}>
          <div
            className={cn(
              card,
              'mb-3 flex items-center gap-2',
              !(isFinished && canClaim) && 'justify-end',
            )}
          >
            {isFinished && canClaim ? (
              <button
                type="button"
                className={cn(btnClass({ kind: 'primary' }), 'h-12 min-w-0 flex-1')}
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
            ) : null}
            <CastScoreboardButton game={game} />
          </div>
          <Scoreboard
            game={game}
            onEditRound={
              game.prelimEditsLocked
                ? undefined
                : (n) => setEditRound(n)
            }
          />
          {isFinished && (
            <div className={cn(card, stackSm)}>
              <button
                type="button"
                className={btnClass({ kind: 'ghost', block: true })}
                onClick={() => downloadGameCsv(game)}
              >
                Export CSV
              </button>
              <button
                type="button"
                className={btnClass({ kind: 'ghost', block: true })}
                onClick={() => downloadGameXml(game)}
              >
                Export XML
              </button>
              <button
                type="button"
                className={btnClass({ kind: 'ghost', block: true })}
                onClick={() => downloadGameJson(game)}
              >
                Export JSON
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && canTakeNotes && (
        <GameNotes
          notes={game.notes ?? []}
          readOnly={isFinished}
          onSave={async (notes) => {
            const updated = await api.updateNotes(game.id, notes);
            setGame(updated);
          }}
        />
      )}

      {!isFinished &&
        tab === 'play' &&
        current &&
        showBidRecap &&
        phase === 'tricks' &&
        !game.superScorer && (
          <BidReadyScreen
            roundNumber={current.number}
            handSize={handSize}
            firstPlayName={requireFirstPlayName(game, current)}
            forceBurn={current.forceBurn}
            bids={bidOrder.map((pid) => {
              const e = current.entries.find((x) => x.playerId === pid);
              if (!e || e.bid === null) {
                throw new Error('Missing bid on recap');
              }
              return {
                id: pid,
                name: e.playerName,
                bid: e.bid,
                last: pid === lastBidderId,
              };
            })}
            buttonLabel="Go to scoring"
            onGoToScoring={() => setShowBidRecap(false)}
          />
        )}

      {!isFinished &&
        tab === 'play' &&
        current &&
        !(showBidRecap && phase === 'tricks' && !game.superScorer) && (
        <div className={playLayout}>
          <header className={phaseHeader}>
            <h2 className={phaseTitle}>
              {game.superScorer && !hasTrumpCard(current.trumpCard) && phase === 'bidding'
                ? 'Choose trump'
                : phase === 'bidding'
                  ? 'Bidding'
                  : game.superScorer
                    ? 'Play'
                    : 'Scoring'}
            </h2>
            <p className={phaseSub}>
              Round {current.number}
              <span className={phaseDot}>·</span>
              {handSize} cards
              {hasTrumpCard(current.trumpCard) && current.trumpCard ? (
                <>
                  <span className={phaseDot}>·</span>
                  {suitGlyph(current.trumpCard.s)}
                </>
              ) : null}
              {phase === 'tricks' && current.forceBurn ? (
                <>
                  <span className={phaseDot}>·</span>
                  FB
                </>
              ) : null}
            </p>
            {phase === 'bidding' ? (
              <>
                <p className={phaseDealer}>
                  {requireDealerName(game, current)} is dealer
                </p>
                <p className={phaseDealer}>
                  {requireFirstPlayName(game, current)} is first bid
                </p>
              </>
            ) : (
              <p className={phaseDealer}>
                {requireFirstPlayName(game, current)} is first play
              </p>
            )}
            {!(
              game.superScorer &&
              !hasTrumpCard(current.trumpCard) &&
              phase === 'bidding'
            ) && (
              <p className={phaseTotal}>
                <strong>
                  {phase === 'bidding' ? liveBidSum : totalBidsForRound}
                </strong>{' '}
                {(phase === 'bidding' ? liveBidSum : totalBidsForRound) <= 1
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
            !(game.superScorer && !hasTrumpCard(current.trumpCard)) && (
            <>
              <div className={playMiddle}>
                <div className={turnList}>
                  {bidOrder.map((pid) => {
                    const p = game.players.find((x) => x.id === pid);
                    if (!p) throw new Error(`Missing player ${pid}`);
                    const isActive = pid === expandedBidId;
                    const locked = lockedBids[pid];
                    const isLast = pid === lastBidderId;
                    const display = isActive ? currentBid : locked;

                    return (
                      <div
                        key={pid}
                        className={turnCardClass({
                          expanded: isActive,
                          done: locked !== undefined,
                          pending: locked === undefined,
                          dealer: isLast && isActive,
                        })}
                      >
                        <button
                          type="button"
                          className={turnCardHead}
                          aria-expanded={isActive}
                          onClick={() => expandBid(pid)}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className={cn(
                                'min-w-0 truncate font-semibold text-grey-900',
                                isActive ? 'font-display text-mode' : 'text-btn',
                              )}
                            >
                              {p.name}
                            </span>
                            {isLast && (
                              <span className="shrink-0 text-kicker lowercase tracking-wide text-muted">
                                last
                              </span>
                            )}
                          </div>
                          <div className="min-w-6 shrink-0 text-right font-display text-md tabular-nums">
                            {display !== undefined ? (
                              <strong className="font-bold text-grey-900">{display}</strong>
                            ) : (
                              <span className={muted}>—</span>
                            )}
                          </div>
                        </button>

                        {isActive && (
                          <div className={turnCardBody}>
                            {isLast && forbiddenLast !== null && (
                              <p className="m-0 text-center text-meta text-danger">
                                Cannot bid {forbiddenLast}
                              </p>
                            )}
                            <NumberStepper
                              value={currentBid}
                              min={0}
                              max={handSize}
                              forbidden={isLast ? forbiddenLast : null}
                              onChange={setBidValue}
                            />
                            {isLast && forbiddenLast !== null && (
                              <button
                                type="button"
                                className={cn(
                                  'self-center min-h-9 min-w-12 cursor-pointer rounded-btn border border-line-strong bg-surface-2 px-3 text-meta font-bold tracking-wide text-grey-600',
                                  forceBurn && 'border-grey-800 bg-grey-800 text-sand-50',
                                )}
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

              <div className={actionStack}>
                {error ? (
                  <div className={cn(banner, 'shrink-0')}>{error}</div>
                ) : null}
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className={cn(btnClass({ kind: 'primary' }), 'h-12 min-w-0 flex-1')}
                    disabled={
                      saving ||
                      (bidsReady ? bidIllegal : !expandedBidId)
                    }
                    onClick={bidsReady ? submitBids : continueBid}
                  >
                    {saving ? '…' : bidsReady ? 'Confirm bids' : 'Continue'}
                  </button>
                </div>
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

          {phase === 'tricks' && !game.superScorer && (
            <>
              <div className={playMiddle}>
                <div className={turnList}>
                  {bidOrder.map((pid) => {
                    const e = current.entries.find((x) => x.playerId === pid);
                    if (!e) throw new Error(`Missing entry ${pid}`);
                    if (e.bid === null) {
                      throw new Error(`Missing bid for ${e.playerName}`);
                    }
                    const isActive = pid === expandedTrickId;
                    const locked = lockedTricks[pid];
                    const display = isActive ? currentTricks : locked;

                    return (
                      <div
                        key={pid}
                        className={turnCardClass({
                          expanded: isActive,
                          done: locked !== undefined,
                          pending: locked === undefined,
                        })}
                      >
                        <button
                          type="button"
                          className={turnCardHead}
                          aria-expanded={isActive}
                          onClick={() => expandTrick(pid)}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className={cn(
                                'min-w-0 truncate font-semibold text-grey-900',
                                isActive ? 'font-display text-mode' : 'text-btn',
                              )}
                            >
                              {e.playerName}
                            </span>
                          </div>
                          <div className="min-w-6 shrink-0 text-right font-display text-md tabular-nums">
                            {display !== undefined ? (
                              <strong className="font-bold text-grey-900">
                                {display}
                                <span className="text-meta font-semibold text-muted">
                                  /{e.bid}
                                </span>
                              </strong>
                            ) : (
                              <span className={muted}>
                                —
                                <span className="text-meta font-semibold text-muted">
                                  /{e.bid}
                                </span>
                              </span>
                            )}
                          </div>
                        </button>

                        {isActive && (
                          <div className={turnCardBody}>
                            <p className={cn(hint, 'm-0 text-center')}>
                              {remainingTricks - currentTricks} left in round
                            </p>
                            <NumberStepper
                              value={currentTricks}
                              min={0}
                              max={remainingTricks}
                              ofTotal={e.bid}
                              onChange={setTrickValue}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={actionStack}>
                {error ? (
                  <div className={cn(banner, 'shrink-0')}>{error}</div>
                ) : null}
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className={cn(btnClass({ kind: 'primary' }), 'h-12 min-w-0 flex-1')}
                    disabled={
                      saving ||
                      (tricksReady ? !trickSumOk : !expandedTrickId)
                    }
                    onClick={tricksReady ? submitTricks : continueTricks}
                  >
                    {saving ? '…' : tricksReady ? 'Confirm tricks' : 'Continue'}
                  </button>
                </div>
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
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <h2 className={pageTitle}>Claim game</h2>
        <p className={lede}>
          Who did you play as
          {gameName ? ` in ${gameName}` : ''}? The table name stays the same.
        </p>
      </div>
      <div className={cn(pageFitBody, stack)}>
        {error && <div className={banner}>{error}</div>}
        {players.length === 0 ? (
          <div className={empty}>No unclaimed seats left.</div>
        ) : (
          <div className={stackSm}>
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                className={modeCard}
                disabled={busy}
                onClick={() => onPick({ id: p.id, name: p.name })}
              >
                <span className={modeCardTitle}>{p.name}</span>
                <span className={modeCardMeta}>Tap to claim this seat</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={actionBar}>
        <button
          type="button"
          className={btnClass({ kind: 'ghost', block: true })}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      {pending && (
        <div
          className={modalBackdrop}
          onClick={busy ? undefined : onCancelConfirm}
        >
          <div className={cn(modal, stack)} onClick={(e) => e.stopPropagation()}>
            <p className={cn(sectionTitle, 'm-0')}>
              Claim this game?
            </p>
            <p className="m-0">
              Are you sure you want to claim {possessive(pending.name)} game?
              These stats will count as yours.
            </p>
            <div className={cn(row, 'gap-2')}>
              <button
                type="button"
                className={btnClass({ kind: 'ghost' })}
                disabled={busy}
                onClick={onCancelConfirm}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(btnClass({ kind: 'primary' }), 'flex-1')}
                disabled={busy}
                onClick={onConfirm}
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

function requireFirstPlayName(
  game: GameDetail,
  round: NonNullable<GameDetail['rounds'][number]>,
): string {
  const name =
    game.players.find((p) => p.id === round.firstBidderPlayerId)?.name ??
    round.entries.find((e) => e.isFirstBidder)?.playerName;
  if (!name) {
    throw new Error('Missing first play player');
  }
  return name;
}

function requireDealerName(
  game: GameDetail,
  round: NonNullable<GameDetail['rounds'][number]>,
): string {
  const name = game.players.find(
    (p) => p.id === round.dealerPlayerId || p.seatIndex === round.dealerSeat,
  )?.name;
  if (!name) {
    throw new Error('Missing dealer');
  }
  return name;
}
