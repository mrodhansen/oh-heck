import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, GameDetail } from '../api';
import { NumberStepper } from '../components/NumberStepper';
import { PlayingCard } from '../components/PlayingCard';
import { Scoreboard } from '../components/Scoreboard';
import { liveApi } from '../live/api';
import { suitGlyph, trumpLabel } from '../live/cards';
import { clearLiveAuth, loadLiveAuth } from '../live/session';
import type { LivePlayerPublic, LiveView } from '../live/types';
import { useSocketRoom } from '../useSocketRoom';

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
      setBoardError(e instanceof Error ? e.message : 'Scoreboard unavailable');
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
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, auth?.token, load]);

  useSocketRoom(id ? `live:${id}` : null, 'live:update', () => {
    void load().catch((e: Error) => setError(e.message));
  });

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
      setError(e instanceof Error ? e.message : 'Could not start');
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
      setError(e instanceof Error ? e.message : 'Bid failed');
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
      setError(e instanceof Error ? e.message : 'Play failed');
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
      setError(e instanceof Error ? e.message : 'Could not leave');
      setBusy(false);
    }
  }

  if (loading) return <div className="empty fill-center">Loading…</div>;
  if (!auth) {
    return (
      <div className="page-fit">
        <div className="banner">{error ?? 'Not seated'}</div>
        <Link className="btn primary" to="/play/live">
          Enter code
        </Link>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="page-fit">
        <div className="banner">{error ?? 'Session not found'}</div>
        <button type="button" className="btn ghost" onClick={() => nav('/')}>
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
    <div className="game-screen">
      <header className="game-topbar">
        <div className="icon-btn spacer" aria-hidden />
        {isFinished ? (
          <div className="game-topbar-title">Board</div>
        ) : (
          <div className="game-tabs">
            <button
              type="button"
              className={tab === 'play' ? 'active' : ''}
              onClick={() => setTab('play')}
            >
              Play
            </button>
            <button
              type="button"
              className={tab === 'board' ? 'active' : ''}
              onClick={() => setTab('board')}
            >
              Board
            </button>
          </div>
        )}
        <div className="icon-btn spacer" aria-hidden />
      </header>

      {error && <div className="banner banner-inline">{error}</div>}
      {view.goneCount > 0 && !isFinished && (
        <div className="banner banner-inline banner-warn">
          {view.goneCount === 1
            ? '1 player has left — others can reclaim their seat with the code'
            : `${view.goneCount} players have left — others can reclaim seats with the code`}
        </div>
      )}

      {(isFinished || tab === 'board') && (
        <div className="panel-scroll stack">
          <section className="card live-board-meta">
            <div className="lobby-code-label">Game code</div>
            <div className="lobby-code">{view.code}</div>
            <div className="row live-board-actions">
              <button type="button" className="btn sm" onClick={() => void copyLink()}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => void onLeave()}
                disabled={busy}
              >
                {isFinished ? 'Exit' : 'Leave'}
              </button>
            </div>
          </section>
          {board ? (
            <Scoreboard game={board} />
          ) : boardError ? (
            <div className="stack">
              <div className="banner">{boardError}</div>
              {view.gameId ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void loadBoard(view.gameId!)}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : (
            <div className="empty">Scoreboard loading…</div>
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
    <div className="game-screen lobby-screen">
      <header className="game-topbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="game-topbar-title">Waiting room</div>
        <button
          type="button"
          className="btn sm ghost leave-btn"
          onClick={onLeave}
          disabled={busy}
        >
          Leave
        </button>
      </header>

      {error && <div className="banner banner-inline">{error}</div>}

      <div className="lobby-table">
        <div className="lobby-sides">
          <div className="lobby-col">
            {padSeats(left, 3).map((p, i) => (
              <SeatChip key={p?.id ?? `l${i}`} player={p} />
            ))}
          </div>
          <div className="lobby-center">
            <div className="lobby-code-label">Game code</div>
            <div className="lobby-code">{view.code}</div>
            <button type="button" className="btn sm" onClick={onCopy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            {view.me.isHost ? (
              <button
                type="button"
                className="btn primary"
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
              <p className="hint lobby-wait-hint">Waiting for host to start…</p>
            )}
            <p className="hint">
              {presentCount}/{view.maxPlayers} players
            </p>
          </div>
          <div className="lobby-col">
            {padSeats(right, 3).map((p, i) => (
              <SeatChip key={p?.id ?? `r${i}`} player={p} />
            ))}
          </div>
        </div>
        <div className="lobby-me">
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
  const myPlay = playBySeat.get(view.me.seatIndex) ?? null;
  const showTricks = view.phase === 'playing' || view.phase === 'trick_reveal';
  const trickNum =
    (view.tricksPlayed ?? 0) +
    (view.table.plays.length > 0 && !view.table.complete ? 1 : 0);

  return (
    <div className="live-play">
      <header className="phase-header live-phase-header">
        <h2 className="phase-title">
          {view.phase === 'bidding' ? 'Bidding' : 'Play'}
        </h2>
        <p className="phase-sub">
          Round {view.roundNumber}
          <span className="phase-dot">·</span>
          {handSize} cards
          <span className="phase-dot">·</span>
          Trump {trumpLabel(view.trumpSuit)}
          {view.trumpCard ? (
            <span className="trump-card-inline">
              {' '}
              ({view.trumpCard.r}
              {suitGlyph(view.trumpCard.s)})
            </span>
          ) : null}
        </p>
        <p className="phase-total">
          <strong>{totalBid}</strong>{' '}
          {totalBid === 1 ? 'has been bid' : 'have been bid'}
          {showTricks && handSize > 0 ? (
            <>
              <span className="phase-dot">·</span>
              Trick {Math.max(1, trickNum)}/{handSize}
            </>
          ) : null}
        </p>
      </header>

      <div className="live-felt">
        <div className="live-felt-top">
          {layout.top.map(({ player }) => (
            <PlayerSlot
              key={player.id}
              player={player}
              view={view}
              play={playBySeat.get(player.seatIndex) ?? null}
              side="top"
            />
          ))}
        </div>
        <div className="live-felt-mid">
          <div className="live-felt-side left">
            {layout.left.map(({ player }) => (
              <PlayerSlot
                key={player.id}
                player={player}
                view={view}
                play={playBySeat.get(player.seatIndex) ?? null}
                side="left"
              />
            ))}
          </div>
          <div className="live-felt-center">
            {view.phase === 'bidding' ? (
              <span className="trick-empty">Bidding…</span>
            ) : view.table.plays.length === 0 ? (
              <span className="trick-empty">
                {view.isMyTurn ? 'Your lead' : 'Waiting for lead'}
              </span>
            ) : view.table.complete && view.table.winnerSeat != null ? (
              <span className="trick-empty trick-winner-label">
                {view.players.find((p) => p.seatIndex === view.table.winnerSeat)
                  ?.name ?? 'Player'}{' '}
                takes it
              </span>
            ) : null}
          </div>
          <div className="live-felt-side right">
            {layout.right.map(({ player }) => (
              <PlayerSlot
                key={player.id}
                player={player}
                view={view}
                play={playBySeat.get(player.seatIndex) ?? null}
                side="right"
              />
            ))}
          </div>
        </div>

        <div className="live-felt-bottom">
          <PlayerSlot
            player={
              view.players.find((p) => p.id === view.me.playerId) ?? {
                id: view.me.playerId,
                name: view.me.name,
                seatIndex: view.me.seatIndex,
                isHost: view.me.isHost,
                gone: view.me.gone,
              }
            }
            view={view}
            play={myPlay}
            side="bottom"
            me
          />
        </div>
      </div>

      <div className="live-me-area">
        {view.isMyBidTurn && (
          <div className="live-bid-panel card">
            <div className="hint">Your bid (0–{handSize})</div>
            <NumberStepper
              value={bid}
              min={0}
              max={handSize}
              forbidden={view.forbiddenLastBid}
              onChange={setBid}
            />
            {view.forbiddenLastBid !== null && (
              <label className="fb-toggle">
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
              className="btn primary"
              disabled={busy || bid === view.forbiddenLastBid}
              onClick={onBid}
            >
              {busy ? '…' : `Bid ${bid}`}
            </button>
          </div>
        )}

        {!view.isMyBidTurn && view.phase === 'bidding' && (
          <p className="hint live-turn-hint">
            {turnWaitLabel(view, view.bidderSeat)}
          </p>
        )}

        {view.phase === 'playing' && !view.isMyTurn && (
          <p className="hint live-turn-hint">
            {turnWaitLabel(view, view.turnSeat)}
          </p>
        )}

        {(view.phase === 'playing' || view.phase === 'bidding') && (
          <div
            className={`live-hand ${view.phase === 'bidding' ? 'muted-hand' : ''}`}
          >
            {view.hand.map((c) => {
              const legal =
                view.phase !== 'playing' ||
                !view.isMyTurn ||
                view.legalCardKeys.includes(c.key);
              const canPlay =
                view.phase === 'playing' && view.isMyTurn && legal && !busy;
              return (
                <PlayingCard
                  key={c.key}
                  card={c}
                  disabled={!canPlay}
                  onClick={canPlay ? () => onPlay(c.key) : undefined}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function layoutOpponents(
  orderedAway: { player: LivePlayerPublic; rel: number }[],
): {
  top: { player: LivePlayerPublic; rel: number }[];
  left: { player: LivePlayerPublic; rel: number }[];
  right: { player: LivePlayerPublic; rel: number }[];
} {
  const m = orderedAway.length;
  if (m === 0) return { top: [], left: [], right: [] };
  if (m === 1) return { top: [orderedAway[0]!], left: [], right: [] };
  if (m === 2) {
    return { top: [], left: [orderedAway[1]!], right: [orderedAway[0]!] };
  }
  if (m === 3) {
    return {
      top: [orderedAway[1]!],
      left: [orderedAway[2]!],
      right: [orderedAway[0]!],
    };
  }
  if (m === 4) {
    return {
      top: [orderedAway[1]!, orderedAway[2]!],
      left: [orderedAway[3]!],
      right: [orderedAway[0]!],
    };
  }
  if (m === 5) {
    return {
      top: [orderedAway[2]!],
      left: [orderedAway[4]!, orderedAway[3]!],
      right: [orderedAway[0]!, orderedAway[1]!],
    };
  }
  return {
    top: [orderedAway[2]!, orderedAway[3]!],
    left: [orderedAway[5]!, orderedAway[4]!],
    right: [orderedAway[0]!, orderedAway[1]!],
  };
}

function PlayerSlot({
  player,
  view,
  play,
  side,
  me,
}: {
  player: LivePlayerPublic;
  view: LiveView;
  play: LiveView['table']['plays'][number] | null;
  side: 'top' | 'left' | 'right' | 'bottom';
  me?: boolean;
}) {
  const active = isActiveSeat(view, player.seatIndex);
  const winner =
    view.table.complete && view.table.winnerSeat === player.seatIndex;
  const cardEl = (
    <div
      className={`seat-play-slot ${play ? 'has-card' : ''} ${winner ? 'winner' : ''}`}
    >
      {play ? (
        <PlayingCard card={play.card} compact />
      ) : (
        <div className="seat-play-empty" aria-hidden />
      )}
    </div>
  );

  return (
    <div
      className={`player-slot side-${side} ${me ? 'is-me' : ''} ${active ? 'active-turn' : ''} ${player.gone ? 'gone' : ''}`}
    >
      {side === 'bottom' || side === 'right' ? (
        <>
          {cardEl}
          <SeatInfo player={player} view={view} me={me} />
        </>
      ) : (
        <>
          <SeatInfo player={player} view={view} me={me} />
          {cardEl}
        </>
      )}
    </div>
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
  return (
    <div className={`seat-chip ${me ? 'me' : ''} ${player.gone ? 'gone' : ''}`}>
      <span className="seat-chip-name">
        {player.name}
        {me ? ' (you)' : ''}
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

  if (view.phase === 'bidding') {
    return (
      <span className="seat-stats">
        <span className="seat-stat">
          <span className="seat-stat-label">Bid</span>
          <span className="seat-stat-value">{bidVal == null ? '…' : bidVal}</span>
        </span>
      </span>
    );
  }

  if (!playing && bidVal == null && tricks == null) return null;

  return (
    <span className="seat-stats">
      <span className="seat-stat">
        <span className="seat-stat-label">Bid</span>
        <span className="seat-stat-value">{bidVal ?? '—'}</span>
      </span>
      <span className="seat-stat seat-stat-tricks">
        <span className="seat-stat-label">Tricks</span>
        <span className="seat-stat-value tricks-num">{tricks ?? 0}</span>
      </span>
    </span>
  );
}

function isActiveSeat(view: LiveView, seat: number): boolean {
  if (view.phase === 'bidding') return view.bidderSeat === seat;
  if (view.phase === 'playing') return view.turnSeat === seat;
  return false;
}
