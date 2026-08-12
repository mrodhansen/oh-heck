import { newId } from './rules';
import type { GameDetail, GameEvent, GameEventType, RoundEntry } from '../api';

type SeatPlayer = { id: string; seatIndex: number };

/** Bid order from dealer: left of dealer → … → dealer last. */
function bidOrderFromDealer(dealerSeat: number, playerCount: number): number[] {
  if (playerCount < 1) {
    throw new Error('playerCount must be >= 1');
  }
  const order: number[] = [];
  for (let i = 1; i <= playerCount; i++) {
    order.push((dealerSeat + i) % playerCount);
  }
  return order;
}

export function firstBidderSeat(dealerSeat: number, playerCount: number): number {
  return (dealerSeat + 1) % playerCount;
}

export function entryRoles(
  seatIndex: number,
  dealerSeat: number,
  order: number[],
): {
  bidPosition: number;
  isDealer: boolean;
  isFirstBidder: boolean;
  isLastBidder: boolean;
} {
  const bidPosition = order.indexOf(seatIndex);
  if (bidPosition < 0) {
    throw new Error(`Seat ${seatIndex} not in bid order`);
  }
  return {
    bidPosition,
    isDealer: seatIndex === dealerSeat,
    isFirstBidder: bidPosition === 0,
    isLastBidder: bidPosition === order.length - 1,
  };
}

export function computeBidAnalytics(
  players: SeatPlayer[],
  dealerSeat: number,
  handSize: number,
  bids: { playerId: string; bid: number }[],
  forbiddenFn: (prior: number, hand: number) => number | null,
) {
  const order = bidOrderFromDealer(dealerSeat, players.length);
  const seatToPlayer = new Map(players.map((p) => [p.seatIndex, p] as const));
  const bidByPlayer = new Map(bids.map((b) => [b.playerId, b.bid]));
  const perPlayer = new Map<
    string,
    {
      bidPosition: number;
      isDealer: boolean;
      isFirstBidder: boolean;
      isLastBidder: boolean;
      bid: number;
      runningBidBefore: number;
    }
  >();

  let running = 0;
  let priorForLast = 0;
  for (let i = 0; i < order.length; i++) {
    const player = seatToPlayer.get(order[i]);
    if (!player) {
      throw new Error(`No player at seat ${order[i]}`);
    }
    const bid = bidByPlayer.get(player.id);
    if (bid === undefined) {
      throw new Error(`Missing bid for player ${player.id}`);
    }
    const roles = entryRoles(player.seatIndex, dealerSeat, order);
    perPlayer.set(player.id, {
      ...roles,
      bid,
      runningBidBefore: running,
    });
    if (i < order.length - 1) priorForLast += bid;
    running += bid;
  }

  return {
    bidSum: running,
    bidDeficit: handSize - running,
    forbiddenLastBid: forbiddenFn(priorForLast, handSize),
    perPlayer,
    order,
  };
}

export function computeOutcome(
  bid: number,
  tricksTaken: number,
  scoreFn: (bid: number, tricks: number) => number,
) {
  const trickDelta = tricksTaken - bid;
  return {
    made: bid === tricksTaken,
    trickDelta,
    absDelta: Math.abs(trickDelta),
    isNilBid: bid === 0,
    isNilMade: bid === 0 && tricksTaken === 0,
    points: scoreFn(bid, tricksTaken),
  };
}

export function assignPlacesByTotal<T extends { total: number }>(
  rows: T[],
): (T & { place: number })[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  let place = 0;
  let last: number | null = null;
  return sorted.map((row, idx) => {
    if (last === null || row.total !== last) {
      place = idx + 1;
      last = row.total;
    }
    return { ...row, place };
  });
}

function standingsThrough(
  players: SeatPlayer[],
  rounds: {
    number: number;
    entries: { playerId: string; points: number | null }[];
  }[],
  throughRoundNumber: number,
) {
  const totals = players.map((p) => {
    let total = 0;
    for (const round of rounds) {
      if (round.number > throughRoundNumber) continue;
      const e = round.entries.find((x) => x.playerId === p.id);
      if (e?.points != null) total += e.points;
    }
    return { playerId: p.id, total };
  });
  return assignPlacesByTotal(totals);
}

export function cumulativeFieldsForRound(
  players: SeatPlayer[],
  rounds: {
    number: number;
    entries: { playerId: string; points: number | null }[];
  }[],
  roundNumber: number,
) {
  const rows = standingsThrough(players, rounds, roundNumber);
  const leader = rows.reduce((m, r) => Math.max(m, r.total), Number.NEGATIVE_INFINITY);
  const map = new Map<
    string,
    { cumulativeScore: number; placeAfterRound: number; scoreBehindLeader: number }
  >();
  for (const r of rows) {
    map.set(r.playerId, {
      cumulativeScore: r.total,
      placeAfterRound: r.place,
      scoreBehindLeader:
        leader === Number.NEGATIVE_INFINITY ? 0 : leader - r.total,
    });
  }
  return map;
}

export function computeGameFinishStats(
  players: SeatPlayer[],
  rounds: { forceBurn: boolean; entries: { playerId: string; points: number | null }[] }[],
  createdAt: string,
  finishedAt: string,
) {
  if (players.length < 1) {
    throw new Error('Cannot compute finish stats: no players');
  }
  for (const round of rounds) {
    for (const p of players) {
      const e = round.entries.find((x) => x.playerId === p.id);
      if (!e || e.points === null) {
        throw new Error(
          `Cannot compute finish stats: missing points for player ${p.id}`,
        );
      }
    }
  }

  const totals = players.map((p) => {
    let total = 0;
    for (const round of rounds) {
      const e = round.entries.find((x) => x.playerId === p.id)!;
      total += e.points!;
    }
    return { playerId: p.id, seatIndex: p.seatIndex, total };
  });
  totals.sort((a, b) => b.total - a.total || a.seatIndex - b.seatIndex);
  const winner = totals[0] ?? null;
  const runnerUp = totals.length > 1 ? totals[1] : null;
  const durationMs =
    new Date(finishedAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(durationMs)) {
    throw new Error('Invalid game timestamps for duration');
  }
  return {
    winnerPlayerId: winner?.playerId ?? null,
    winnerScore: winner?.total ?? null,
    runnerUpScore: runnerUp?.total ?? null,
    winMargin:
      winner && runnerUp != null ? winner.total - runnerUp.total : null,
    durationMs: Math.max(0, durationMs),
    totalForceBurns: rounds.filter((r) => r.forceBurn).length,
  };
}

export function emptyEntryAnalytics(
  seatIndex: number,
  dealerSeat: number,
  order: number[],
): Pick<
  RoundEntry,
  | 'bidPosition'
  | 'isDealer'
  | 'isFirstBidder'
  | 'isLastBidder'
  | 'runningBidBefore'
  | 'made'
  | 'trickDelta'
  | 'absDelta'
  | 'isNilBid'
  | 'isNilMade'
  | 'cumulativeScore'
  | 'placeAfterRound'
  | 'scoreBehindLeader'
> {
  const roles = entryRoles(seatIndex, dealerSeat, order);
  return {
    ...roles,
    runningBidBefore: null,
    made: null,
    trickDelta: null,
    absDelta: null,
    isNilBid: null,
    isNilMade: null,
    cumulativeScore: null,
    placeAfterRound: null,
    scoreBehindLeader: null,
  };
}

export function appendEvent(
  game: GameDetail,
  type: GameEventType,
  payload: unknown,
  roundNumber?: number | null,
): GameEvent[] {
  const ev: GameEvent = {
    id: newId(),
    type,
    roundNumber: roundNumber ?? null,
    payload,
    createdAt: new Date().toISOString(),
  };
  return [...(game.events ?? []), ev];
}

/** Bid totals from raw bids. Null until every seat has a bid. */
export function derivedBidAggregates(
  handSize: number,
  bids: (number | null)[],
): { bidSum: number | null; bidDeficit: number | null } {
  if (bids.some((b) => b === null)) {
    return { bidSum: null, bidDeficit: null };
  }
  const present = bids as number[];
  const bidSum = present.reduce((s, b) => s + b, 0);
  return { bidSum, bidDeficit: handSize - bidSum };
}

/** Outcome flags from raw bid / tricks. Not persisted. */
export function derivedEntryOutcome(
  bid: number | null,
  tricksTaken: number | null,
): {
  made: boolean | null;
  trickDelta: number | null;
  absDelta: number | null;
  isNilBid: boolean | null;
  isNilMade: boolean | null;
} {
  if (bid === null) {
    return {
      made: null,
      trickDelta: null,
      absDelta: null,
      isNilBid: null,
      isNilMade: null,
    };
  }
  const isNilBid = bid === 0;
  if (tricksTaken === null) {
    return {
      made: null,
      trickDelta: null,
      absDelta: null,
      isNilBid,
      isNilMade: null,
    };
  }
  const trickDelta = tricksTaken - bid;
  return {
    made: bid === tricksTaken,
    trickDelta,
    absDelta: Math.abs(trickDelta),
    isNilBid,
    isNilMade: isNilBid && tricksTaken === 0,
  };
}

export function recomputeAllCumulatives(game: GameDetail): GameDetail {
  const players = game.players;
  const roundsSnap = game.rounds.map((r) => ({
    number: r.number,
    entries: r.entries.map((e) => ({
      playerId: e.playerId,
      points: e.points,
    })),
  }));

  const rounds = game.rounds.map((round) => {
    if (!round.complete) {
      return {
        ...round,
        entries: round.entries.map((e) => ({
          ...e,
          cumulativeScore: null,
          placeAfterRound: null,
          scoreBehindLeader: null,
        })),
      };
    }
    const cum = cumulativeFieldsForRound(players, roundsSnap, round.number);
    return {
      ...round,
      entries: round.entries.map((e) => {
        const c = cum.get(e.playerId)!;
        return {
          ...e,
          cumulativeScore: c.cumulativeScore,
          placeAfterRound: c.placeAfterRound,
          scoreBehindLeader: c.scoreBehindLeader,
        };
      }),
    };
  });

  return { ...game, rounds };
}

/** Rebuild seating/order/role fields for a legacy cached game. */
export function hydrateRoundOrder(
  players: { id: string; name: string; seatIndex: number }[],
  dealerSeat: number,
): {
  firstBidderSeat: number;
  dealerPlayerId: string;
  firstBidderPlayerId: string;
  bidOrderSeats: number[];
  bidOrderPlayerIds: string[];
  entryRolesByPlayerId: Map<
    string,
    {
      bidPosition: number;
      isDealer: boolean;
      isFirstBidder: boolean;
      isLastBidder: boolean;
    }
  >;
} {
  const n = players.length;
  const order = bidOrderFromDealer(dealerSeat, n);
  const first = firstBidderSeat(dealerSeat, n);
  const entryRolesByPlayerId = new Map<
    string,
    {
      bidPosition: number;
      isDealer: boolean;
      isFirstBidder: boolean;
      isLastBidder: boolean;
    }
  >();
  for (const p of players) {
    entryRolesByPlayerId.set(p.id, entryRoles(p.seatIndex, dealerSeat, order));
  }
  const dealer = players.find((p) => p.seatIndex === dealerSeat);
  const firstBidder = players.find((p) => p.seatIndex === first);
  if (!dealer) {
    throw new Error(`No player at dealer seat ${dealerSeat}`);
  }
  if (!firstBidder) {
    throw new Error(`No player at first-bidder seat ${first}`);
  }
  return {
    firstBidderSeat: first,
    dealerPlayerId: dealer.id,
    firstBidderPlayerId: firstBidder.id,
    bidOrderSeats: order,
    bidOrderPlayerIds: order.map((seat) => {
      const p = players.find((x) => x.seatIndex === seat);
      if (!p) throw new Error(`No player at seat ${seat}`);
      return p.id;
    }),
    entryRolesByPlayerId,
  };
}
