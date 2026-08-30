import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, GameDetail } from '../api';
import { toUserMessage } from '../api/errors';
import { NumberStepper } from '../components/NumberStepper';
import { PlayingCard } from '../components/PlayingCard';
import { Scoreboard } from '../components/Scoreboard';
import { CastScoreboardButton } from '../components/CastScoreboardButton';
import { liveApi } from '../live/api';
import { trumpLabel } from '../live/cards';
import { clearLiveAuth, loadLiveAuth } from '../live/session';
import type { LivePlayerPublic, LiveView } from '../live/types';
import { useSocketRoom } from '../useSocketRoom';
import {
  banner,
  bannerWarn,
  boardMid,
  boardTrump,
  boardTrumpLabel,
  boardTrumpSuit,
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
  liveBidBackdrop,
  liveBidRange,
  liveBidReopen,
  liveBidSheet,
  liveBidSheetTitle,
  liveBidSheetTop,
  liveFeltWrap,
  liveHand,
  liveMeArea,
  livePhaseHeader,
  livePhaseRow,
  livePhaseRowMeta,
  livePlay,
  livePlayBody,
  liveTurnHint,
  lobbyCenter,
  lobbyCode,
  lobbyCodeLabel,
  lobbyCol,
  lobbyMe,
  lobbySides,
  lobbyTable,
  pageFit,
  panelScroll,
  phaseDot,
  stack,
  trickCount,
  trickEmpty,
  trickWinnerLabel,
} from '../ui';

export function LiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const auth = id ? loadLiveAuth(id) : null;

  const [view, setView] = useState<LiveView | null>(null);
  const [board, setBoard] = useState<GameDetail | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'play' | 'board'>('play');
  const [busy, setBusy] = useState(false);
  const [bid, setBid] = useState(0);
  const [forceBurn, setForceBurn] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadBoard = useCallback(async (gameId: string) => {
    try {
      const g = await api.getGame(gameId);
      setBoard(g);
      setBoardError(null);
    } catch (e) {
      setBoard(null);
      setBoardError(toUserMessage(e, 'Scoreboard unavailable'));
    }
  }, []);

  const load = useCallback(async () => {
    if (!id || !auth) return;
    const data = await liveApi.get(id, auth.token);
    setView(data);
    if (data.gameId) {
      await loadBoard(data.gameId);
    }
  }, [id, auth?.token, loadBoard]);

  useEffect(() => {
    if (!id) return;
    if (!auth) {
      setError('No seat on this device — join with the game code.');
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    load()
      .catch((e: unknown) => {
        if (alive) setError(toUserMessage(e, 'Could not load session'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, auth?.token, load]);

  useSocketRoom(
    id ? `live:${id}` : null,
    'live:update',
    () => {
      void load().catch((e: unknown) =>
        setError(toUserMessage(e, 'Could not refresh session')),
      );
    },
    auth?.token,
  );

  useEffect(() => {
    if (view?.phase === 'complete' || view?.status === 'COMPLETED') {
      setTab('board');
    }
  }, [view?.phase, view?.status]);

  useEffect(() => {
    setBid(0);
    setForceBurn(false);
  }, [view?.roundNumber, view?.bidderSeat, view?.phase]);

  const shareUrl = useMemo(() => {
    if (!view) return '';
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${window.location.origin}${base}/play/live?code=${view.code}`;
  }, [view]);

  async function copyLink() {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(shareUrl || view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(view.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        setError(`Code: ${view.code}`);
      }
    }
  }

  async function onStart() {
    if (!id || !auth) return;
    setBusy(true);
    setError(null);
    try {
      const data = await liveApi.start(id, auth.token);
      setView(data);
      setTab('play');
      if (data.gameId) await loadBoard(data.gameId);
    } catch (e) {
      setError(toUserMessage(e, 'Could not start'));
    } finally {
      setBusy(false);
    }
  }

  async function onBid() {
    if (!id || !auth || !view) return;
    setBusy(true);
    setError(null);
    try {
      const data = await liveApi.bid(
        id,
        auth.token,
        bid,
        forceBurn && view.forbiddenLastBid !== null,
      );
      setView(data);
      if (data.gameId) await loadBoard(data.gameId);
    } catch (e) {
      setError(toUserMessage(e, 'Bid failed'));
    } finally {
      setBusy(false);
    }
  }

  async function onPlay(cardKey: string) {
    if (!id || !auth || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await liveApi.play(id, auth.token, cardKey);
      setView(data);
      if (data.gameId) await loadBoard(data.gameId);
    } catch (e) {
      setError(toUserMessage(e, 'Play failed'));
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    if (!id || !auth || busy) return;
    setBusy(true);
    setError(null);
    try {
      await liveApi.leave(id, auth.token);
      clearLiveAuth(id);
      nav('/play/live');
    } catch (e) {
      setError(toUserMessage(e, 'Could not leave'));
      setBusy(false);
    }
  }

  if (loading) return <div className={cn(empty, fillCenter)}>Loading…</div>;
  if (!auth) {
    return (
      <div className={pageFit}>
        <div className={banner}>{error ?? 'Not seated'}</div>
        <Link className={btnClass({ kind: 'primary' })} to="/play/live">
          Enter code
        </Link>
      </div>
    );
  }
  if (!view) {
    return (
      <div className={pageFit}>
        <div className={banner}>{error ?? 'Session not found'}</div>
        <button
          type="button"
          className={btnClass({ kind: 'ghost' })}
          onClick={() => nav('/')}
        >
          Home
        </button>
      </div>
    );
  }

  if (view.status === 'LOBBY') {
    return (
      <LobbyView
        view={view}
        error={error}
        busy={busy}
        copied={copied}
        onCopy={copyLink}
        onStart={onStart}
        onLeave={onLeave}
        onBack={() => nav('/play/live')}
      />
    );
  }

  const isFinished =
    view.phase === 'complete' || view.status === 'COMPLETED';

  return (
    <div className={gameScreen}>
      <header className={gameTopbar}>
        <div
          className={iconBtnSpacer}
          aria-hidden
        />
        {isFinished ? (
          <div className="border-b border-line py-2 text-center font-display text-md font-650 text-grey-900">
            Board
          </div>
        ) : (
          <div className={gameTabs}>
            <button
              type="button"
              className={gameTabClass(tab === 'play')}
              onClick={() => setTab('play')}
            >
              Play
            </button>
            <button
              type="button"
              className={gameTabClass(tab === 'board')}
              onClick={() => setTab('board')}
            >
              Board
            </button>
          </div>
        )}
        <div
          className={iconBtnSpacer}
          aria-hidden
        />
      </header>

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}
      {view.goneCount > 0 && !isFinished && (
        <div className={cn(bannerWarn, 'shrink-0')}>
          {view.goneCount === 1
            ? '1 player has left — others can reclaim their seat with the code'
            : `${view.goneCount} players have left — others can reclaim seats with the code`}
        </div>
      )}

      {(isFinished || tab === 'board') && (
        <div className={cn(panelScroll, stack)}>
          <section className={cn(card, 'flex flex-col items-center gap-2 text-center')}>
            <div className={lobbyCodeLabel}>Game code</div>
            <div className={lobbyCode}>{view.code}</div>
            <div className="flex w-full flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className={btnClass({ size: 'sm' })}
                onClick={() => void copyLink()}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                className={btnClass({ kind: 'ghost', size: 'sm' })}
                onClick={() => void onLeave()}
                disabled={busy}
              >
                {isFinished ? 'Exit' : 'Leave'}
              </button>
              {board ? <CastScoreboardButton game={board} /> : null}
            </div>
          </section>
          {board ? (
            <Scoreboard game={board} />
          ) : boardError ? (
            <div className={stack}>
              <div className={banner}>{boardError}</div>
              {view.gameId ? (
                <button
                  type="button"
                  className={btnClass({ kind: 'primary' })}
                  onClick={() => void loadBoard(view.gameId!)}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : (
            <div className={empty}>Scoreboard loading…</div>
          )}
        </div>
      )}

      {!isFinished && tab === 'play' && (
        <LivePlayTable
          view={view}
          bid={bid}
          setBid={setBid}
          forceBurn={forceBurn}
          setForceBurn={setForceBurn}
          busy={busy}
          onBid={onBid}
          onPlay={onPlay}
        />
      )}
    </div>
  );
}

function LobbyView({
  view,
  error,
  busy,
  copied,
  onCopy,
  onStart,
  onLeave,
  onBack,
}: {
  view: LiveView;
  error: string | null;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onStart: () => void;
  onLeave: () => void;
  onBack: () => void;
}) {
  const orderedOthers = [...view.players]
    .filter((p) => p.id !== view.me.playerId)
    .sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? 1 : -1;
      return a.seatIndex - b.seatIndex;
    });

  const left = orderedOthers.filter((_, i) => i % 2 === 0).slice(0, 3);
  const right = orderedOthers.filter((_, i) => i % 2 === 1).slice(0, 3);

  const presentCount = view.players.filter((p) => !p.gone).length;

  return (
    <div className={cn(gameScreen, 'min-h-0')}>
      <header className={gameTopbar}>
        <button type="button" className={iconBtn} onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="border-b border-line py-2 text-center font-display text-md font-650 text-grey-900">
          Waiting room
        </div>
        <button
          type="button"
          className={cn(
            btnClass({ kind: 'ghost', size: 'sm' }),
            'min-w-stepper justify-self-end',
          )}
          onClick={onLeave}
          disabled={busy}
        >
          Leave
        </button>
      </header>

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}

      <div className={lobbyTable}>
        <div className={lobbySides}>
          <div className={lobbyCol}>
            {padSeats(left, 3).map((p, i) => (
              <SeatChip key={p?.id ?? `l${i}`} player={p} />
            ))}
          </div>
          <div className={lobbyCenter}>
            <div className={lobbyCodeLabel}>Game code</div>
            <div className={lobbyCode}>{view.code}</div>
            <button type="button" className={btnClass({ size: 'sm' })} onClick={onCopy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            {view.me.isHost ? (
              <button
                type="button"
                className={btnClass({ kind: 'primary' })}
                disabled={!view.canStart || busy}
                onClick={onStart}
              >
                {busy
                  ? 'Starting…'
                  : view.canStart
                    ? 'Start game'
                    : 'Waiting for players'}
              </button>
            ) : (
              <p className={cn(hint, 'm-0')}>Waiting for host to start…</p>
            )}
            <p className={hint}>
              {presentCount}/{view.maxPlayers} players
            </p>
          </div>
          <div className={lobbyCol}>
            {padSeats(right, 3).map((p, i) => (
              <SeatChip key={p?.id ?? `r${i}`} player={p} />
            ))}
          </div>
        </div>
        <div className={lobbyMe}>
          <SeatChip player={view.players.find((p) => p.id === view.me.playerId) ?? null} me />
        </div>
      </div>
    </div>
  );
}

function padSeats(
  list: LivePlayerPublic[],
  n: number,
): (LivePlayerPublic | null)[] {
  const out: (LivePlayerPublic | null)[] = [...list];
  while (out.length < n) out.push(null);
  return out.slice(0, n);
}

function SeatChip({
  player,
  me,
}: {
  player: LivePlayerPublic | null;
  me?: boolean;
}) {
  if (!player) {
    return <div className="seat-chip empty-seat">Empty</div>;
  }
  return (
    <div
      className={`seat-chip ${me ? 'me' : ''} ${player.isHost ? 'host' : ''} ${player.gone ? 'gone' : ''}`}
    >
      <span className="seat-chip-name">{player.name}</span>
      {player.gone ? <span className="seat-chip-tag">Gone</span> : null}
      {!player.gone && player.isHost ? (
        <span className="seat-chip-tag">Host</span>
      ) : null}
      {!player.gone && me ? <span className="seat-chip-tag">You</span> : null}
    </div>
  );
}


function LivePlayTable({
  view,
  bid,
  setBid,
  forceBurn,
  setForceBurn,
  busy,
  onBid,
  onPlay,
}: {
  view: LiveView;
  bid: number;
  setBid: (n: number) => void;
  forceBurn: boolean;
  setForceBurn: (v: boolean) => void;
  busy: boolean;
  onBid: () => void;
  onPlay: (key: string) => void;
}) {
  const [bidSheetOpen, setBidSheetOpen] = useState(true);

  // Re-open the bid sheet whenever it becomes (or returns to) our turn.
  useEffect(() => {
    if (view.isMyBidTurn) setBidSheetOpen(true);
  }, [view.isMyBidTurn, view.bidderSeat, view.roundNumber]);

  const others = view.players.filter((p) => p.id !== view.me.playerId);
  const playBySeat = new Map(
    view.table.plays.map((p) => [p.seat, p] as const),
  );

  const n = view.players.length;
  const mySeat = view.me.seatIndex;
  const orderedAway = others
    .map((p) => ({
      player: p,
      rel: (p.seatIndex - mySeat + n) % n,
    }))
    .sort((a, b) => a.rel - b.rel);

  const layout = layoutOpponents(orderedAway);

  const handSize = view.handSize ?? 0;
  const totalBid = view.bids.reduce((s, b) => s + (b.bid ?? 0), 0);
  const tricksTaken = view.tricksPlayed ?? 0;
  const myPlay = playBySeat.get(view.me.seatIndex) ?? null;
  const bidding = view.phase === 'bidding';
  const mePlayer =
    view.players.find((p) => p.id === view.me.playerId) ?? {
      id: view.me.playerId,
      name: view.me.name,
      seatIndex: view.me.seatIndex,
      isHost: view.me.isHost,
      gone: view.me.gone,
    };

  return (
    <div className={livePlay}>
      <header className={livePhaseHeader}>
        <p className={livePhaseRow}>
          Round {view.roundNumber}
          <span className={phaseDot}>·</span>
          {handSize} cards
        </p>
        <p className={cn(livePhaseRow, livePhaseRowMeta)}>
          Tricks {tricksTaken}
          {handSize > 0 ? `/${handSize}` : ''}
          <span className={phaseDot}>·</span>
          Bid {totalBid}
        </p>
      </header>

      <div className={livePlayBody}>
        <div className={cn('live-felt-wrap', liveFeltWrap)}>
          <LiveBoard
            view={view}
            layout={layout}
            playBySeat={playBySeat}
            myPlay={myPlay}
            mePlayer={mePlayer}
          />

          {/* Bid popup sits over the table only — hand stays fully visible below. */}
          {view.isMyBidTurn && bidSheetOpen && (
            <div
              className={liveBidBackdrop}
              onClick={() => setBidSheetOpen(false)}
              role="presentation"
            >
              <div
                className={cn(liveBidSheet, card)}
                role="dialog"
                aria-label="Place your bid"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={liveBidSheetTop}>
                  <div className={liveBidSheetTitle}>
                    Your bid{' '}
                    <span className={liveBidRange}>(0–{handSize})</span>
                  </div>
                  <button
                    type="button"
                    className={btnClass({ kind: 'ghost', size: 'sm' })}
                    onClick={() => setBidSheetOpen(false)}
                  >
                    View board
                  </button>
                </div>
                <NumberStepper
                  value={bid}
                  min={0}
                  max={handSize}
                  forbidden={view.forbiddenLastBid}
                  onChange={setBid}
                />
                {view.forbiddenLastBid !== null && (
                  <label className="self-center min-h-9 min-w-12 cursor-pointer rounded-btn border border-line-strong bg-surface-2 px-3 text-btn-sm font-bold tracking-wide text-grey-600">
                    <input
                      type="checkbox"
                      checked={forceBurn}
                      onChange={(e) => setForceBurn(e.target.checked)}
                    />
                    Force burn
                  </label>
                )}
                <button
                  type="button"
                  className={btnClass({ kind: 'primary' })}
                  disabled={busy || bid === view.forbiddenLastBid}
                  onClick={onBid}
                >
                  {busy ? '…' : `Bid ${bid}`}
                </button>
              </div>
            </div>
          )}

          {view.isMyBidTurn && !bidSheetOpen && (
            <button
              type="button"
              className={cn(liveBidReopen, btnClass({ kind: 'primary' }))}
              onClick={() => setBidSheetOpen(true)}
            >
              Your turn to bid
            </button>
          )}
        </div>

        <div className={liveMeArea}>
          {!view.isMyBidTurn && bidding && (
            <p className={cn(hint, liveTurnHint)}>
              {turnWaitLabel(view, view.bidderSeat)}
            </p>
          )}

          {view.phase === 'playing' && !view.isMyTurn && (
            <p className={cn(hint, liveTurnHint)}>
              {turnWaitLabel(view, view.turnSeat)}
            </p>
          )}

          {(view.phase === 'playing' || bidding) && (
            <div className={cn('live-hand', liveHand, bidding && 'live-hand-bidding')}>
              {view.hand.map((c) => {
                const legal =
                  view.phase !== 'playing' ||
                  !view.isMyTurn ||
                  view.legalCardKeys.includes(c.key);
                const canPlay =
                  view.phase === 'playing' && view.isMyTurn && legal && !busy;
                // During bidding, never dim the hand — players need to read cards.
                const dimmed = view.phase === 'playing' && !canPlay;
                return (
                  <PlayingCard
                    key={c.key}
                    card={c}
                    disabled={dimmed}
                    onClick={canPlay ? () => onPlay(c.key) : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * orderedAway[0] = first seat clockwise from me (engine seat+1).
 * Clockwise around the table from me at bottom-right:
 *   up the left column (bottom = nearest = first CW), then down the right.
 * left/right arrays are top→bottom for display.
 *
 * Even tables (2/4/6p): balanced L/R with you as bottom-right seat
 *   2p → 1L 1R(you) | 4p → 2L 2R(you) | 6p → 3L 3R(you)
 */
function layoutOpponents(
  orderedAway: { player: LivePlayerPublic; rel: number }[],
): {
  left: { player: LivePlayerPublic; rel: number }[];
  right: { player: LivePlayerPublic; rel: number }[];
} {
  const m = orderedAway.length;
  if (m === 0) return { left: [], right: [] };

  // Take first `leftCount` clockwise players for the left column (near me = last in list).
  const split = (leftCount: number) => {
    const leftCw = orderedAway.slice(0, leftCount); // nearest-first
    const rightCw = orderedAway.slice(leftCount); // continue CW, far-to-near toward me on right
    return {
      left: [...leftCw].reverse(), // top → bottom
      right: rightCw, // top → bottom
    };
  };

  // Opponents only — you are placed separately as bottom-right.
  // 2p (1 opp): 1L
  // 3p (2): 1L 1R
  // 4p (3): 2L 1R  (+ you = 2R)
  // 5p (4): 2L 2R
  // 6p (5): 3L 2R  (+ you = 3R)
  // 7p (6): 3L 3R
  if (m === 1) return split(1);
  if (m === 2) return split(1);
  if (m === 3) return split(2);
  if (m === 4) return split(2);
  if (m === 5) return split(3);
  return split(3);
}

/**
 * 5-column board grid:
 *   [seat-L | play-L | mid/trump | play-R | seat-R]
 * You are always bottom-right (col 5); your play slot is col 4 on that row.
 */
function LiveBoard({
  view,
  layout,
  playBySeat,
  myPlay,
  mePlayer,
}: {
  view: LiveView;
  layout: {
    left: { player: LivePlayerPublic; rel: number }[];
    right: { player: LivePlayerPublic; rel: number }[];
  };
  playBySeat: Map<number, LiveView['table']['plays'][number]>;
  myPlay: LiveView['table']['plays'][number] | null;
  mePlayer: LivePlayerPublic;
}) {
  const showSlots = view.phase !== 'bidding';
  // Right column includes you at the bottom
  const sideRows = Math.max(layout.left.length, layout.right.length + 1, 1);
  const meRow = sideRows;
  const cells: ReactNode[] = [];

  // Side rows: seat-L | play-L | (mid) | play-R | seat-R
  for (let i = 0; i < sideRows; i++) {
    const r = i + 1;
    const lp = layout.left[i];
    const rp = layout.right[i]; // undefined on me row when right is shorter
    const isMeRow = r === meRow;

    if (lp) {
      cells.push(
        <BoardSeat
          key={`ls-${lp.player.id}`}
          player={lp.player}
          view={view}
          style={{ gridColumn: 1, gridRow: r }}
        />,
      );
      if (showSlots) {
        cells.push(
          <BoardPlay
            key={`lpl-${lp.player.id}`}
            player={lp.player}
            view={view}
            play={playBySeat.get(lp.player.seatIndex) ?? null}
            style={{ gridColumn: 2, gridRow: r }}
          />,
        );
      }
    }

    if (isMeRow) {
      if (showSlots) {
        cells.push(
          <BoardPlay
            key="my-play"
            player={mePlayer}
            view={view}
            play={myPlay}
            me
            style={{ gridColumn: 4, gridRow: r }}
          />,
        );
      }
      cells.push(
        <BoardSeat
          key="me"
          player={mePlayer}
          view={view}
          me
          style={{ gridColumn: 5, gridRow: r }}
        />,
      );
    } else if (rp) {
      if (showSlots) {
        cells.push(
          <BoardPlay
            key={`rpl-${rp.player.id}`}
            player={rp.player}
            view={view}
            play={playBySeat.get(rp.player.seatIndex) ?? null}
            style={{ gridColumn: 4, gridRow: r }}
          />,
        );
      }
      cells.push(
        <BoardSeat
          key={`rs-${rp.player.id}`}
          player={rp.player}
          view={view}
          style={{ gridColumn: 5, gridRow: r }}
        />,
      );
    }
  }

  // Trump + status spans all side rows in the center
  cells.push(
    <div
      key="mid"
      className={cn('board-mid', boardMid)}
      style={{ gridColumn: 3, gridRow: `1 / span ${sideRows}` }}
    >
      <BoardTrump view={view} />
      <TrickStatus view={view} />
    </div>,
  );

  return (
    <div
      className={`live-board players-${view.players.length}`}
      style={
        {
          '--board-rows': sideRows,
        } as CSSProperties
      }
    >
      {cells}
    </div>
  );
}

function BoardTrump({ view }: { view: LiveView }) {
  if (!view.trumpCard && !view.trumpSuit) return null;
  return (
    <div className={cn('board-trump', boardTrump)}>
      <span className={cn('board-trump-label', boardTrumpLabel)}>Trump</span>
      {view.trumpCard ? (
        <PlayingCard
          card={{
            key: `${view.trumpCard.r}${view.trumpCard.s}`,
            rank: view.trumpCard.r,
            suit: view.trumpCard.s,
          }}
          compact
        />
      ) : (
        <span className={boardTrumpSuit}>{trumpLabel(view.trumpSuit)}</span>
      )}
    </div>
  );
}

function BoardSeat({
  player,
  view,
  me,
  style,
}: {
  player: LivePlayerPublic;
  view: LiveView;
  me?: boolean;
  style: CSSProperties;
}) {
  const active = isActiveSeat(view, player.seatIndex);
  return (
    <div
      className={`board-seat ${me ? 'is-me' : ''} ${active ? 'active-turn' : ''} ${player.gone ? 'gone' : ''}`}
      style={style}
    >
      <SeatInfo player={player} view={view} me={me} />
    </div>
  );
}

function BoardPlay({
  player,
  view,
  play,
  me,
  style,
}: {
  player: LivePlayerPublic;
  view: LiveView;
  play: LiveView['table']['plays'][number] | null;
  me?: boolean;
  style: CSSProperties;
}) {
  const winner =
    view.table.complete && view.table.winnerSeat === player.seatIndex;
  return (
    <div
      className={`board-play trick-slot ${play ? 'has-card' : 'is-empty'} ${winner ? 'winner' : ''} ${me ? 'is-me' : ''}`}
      style={style}
      title={player.name}
      aria-hidden={play ? undefined : true}
    >
      {play ? <PlayingCard card={play.card} compact /> : null}
    </div>
  );
}

function TrickStatus({ view }: { view: LiveView }) {
  if (view.phase === 'bidding') {
    return <span className={trickEmpty}>Bidding…</span>;
  }
  const hasPlays = view.table.plays.length > 0;
  const winnerSeat = view.table.complete ? view.table.winnerSeat : null;
  if (!hasPlays) {
    return (
      <span className={trickEmpty}>
        {view.isMyTurn ? 'Your lead' : 'Waiting for lead'}
      </span>
    );
  }
  if (view.table.complete && winnerSeat != null) {
    return (
      <span className={trickWinnerLabel}>
        {view.players.find((p) => p.seatIndex === winnerSeat)?.name ?? 'Player'}{' '}
        takes it
      </span>
    );
  }
  return (
    <span className={trickCount}>
      {view.table.plays.length}/{view.players.length}
    </span>
  );
}

function SeatInfo({
  player,
  view,
  me,
}: {
  player: LivePlayerPublic;
  view: LiveView;
  me?: boolean;
}) {
  const label = me ? `${player.name} (you)` : player.name;
  return (
    <div className={`seat-chip ${me ? 'me' : ''} ${player.gone ? 'gone' : ''}`}>
      <span className="seat-chip-name" title={label}>
        {label}
      </span>
      {player.gone ? (
        <span className="seat-chip-tag">Gone</span>
      ) : (
        <BidTricksBadge view={view} playerId={player.id} />
      )}
    </div>
  );
}

function turnWaitLabel(view: LiveView, seat: number | null): string {
  const p = view.players.find((x) => x.seatIndex === seat);
  if (!p) return 'Waiting…';
  if (p.gone) return `Waiting for someone to claim ${p.name}…`;
  return `Waiting for ${p.name}…`;
}

/** n = tricks taken, m = bid. Mobile shows compact n/m; desktop keeps labeled stats. */
function BidTricksBadge({
  view,
  playerId,
}: {
  view: LiveView;
  playerId: string;
}) {
  const row = view.bids.find((b) => b.playerId === playerId);
  if (!row) return null;
  const bidVal = row.bid;
  const tricks = row.tricksTaken;
  const playing = view.phase === 'playing' || view.phase === 'trick_reveal';

  const n = tricks ?? 0;
  const m = bidVal == null ? '…' : bidVal;
  const compact = `${n}/${m}`;
  const aria = `Tricks ${n} of bid ${bidVal == null ? 'pending' : bidVal}`;

  if (view.phase === 'bidding') {
    return (
      <>
        <span className="seat-nm" aria-label={aria}>
          {compact}
        </span>
        <span className="seat-stats seat-stats-full">
          <span className="seat-stat">
            <span className="seat-stat-label">Bid</span>
            <span className="seat-stat-value">
              {bidVal == null ? '…' : bidVal}
            </span>
          </span>
        </span>
      </>
    );
  }

  if (!playing && bidVal == null && tricks == null) return null;

  return (
    <>
      <span className="seat-nm" aria-label={aria}>
        {compact}
      </span>
      <span className="seat-stats seat-stats-full">
        <span className="seat-stat">
          <span className="seat-stat-label">Tricks</span>
          <span className="seat-stat-value">{tricks ?? 0}</span>
        </span>
        <span className="seat-stat">
          <span className="seat-stat-label">Bid</span>
          <span className="seat-stat-value">{bidVal ?? '—'}</span>
        </span>
      </span>
    </>
  );
}

function isActiveSeat(view: LiveView, seat: number): boolean {
  if (view.phase === 'bidding') return view.bidderSeat === seat;
  if (view.phase === 'playing') return view.turnSeat === seat;
  return false;
}
