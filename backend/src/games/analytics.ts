import { GameEventType, Prisma } from '@prisma/client';

/** Parse Json bid-order column (PG JSONB / SQLite Json) into seat indices. */
export function asIntArray(value: Prisma.JsonValue | null | undefined): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === 'number' && Number.isInteger(item)) {
      out.push(item);
    }
  }
  return out;
}

type SeatPlayer = {
  id: string;
  seatIndex: number;
};

type EntrySnap = {
  playerId: string;
  points: number | null;
};

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

function firstBidderSeat(dealerSeat: number, playerCount: number): number {
  return (dealerSeat + 1) % playerCount;
}

type RoleFields = {
  bidPosition: number;
  isDealer: boolean;
  isFirstBidder: boolean;
  isLastBidder: boolean;
};

export function entryRoles(
  seatIndex: number,
  dealerSeat: number,
  order: number[],
): RoleFields {
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

type BidAnalytics = {
  bidSum: number;
  bidDeficit: number;
  forbiddenLastBid: number | null;
  order: number[];
  perPlayer: Map<
    string,
    RoleFields & { bid: number; runningBidBefore: number }
  >;
};

export function computeBidAnalytics(
  players: SeatPlayer[],
  dealerSeat: number,
  handSize: number,
  bids: { playerId: string; bid: number }[],
  forbiddenFn: (priorBidsSum: number, handSize: number) => number | null,
): BidAnalytics {
  const order = bidOrderFromDealer(dealerSeat, players.length);
  const seatToPlayer = new Map(players.map((p) => [p.seatIndex, p] as const));
  const bidByPlayer = new Map(bids.map((b) => [b.playerId, b.bid]));
  const perPlayer = new Map<
    string,
    RoleFields & { bid: number; runningBidBefore: number }
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
    order,
    perPlayer,
  };
}

type OutcomeFields = {
  made: boolean;
  trickDelta: number;
  absDelta: number;
  isNilBid: boolean;
  isNilMade: boolean;
  points: number;
};

export function computeOutcome(
  bid: number,
  tricksTaken: number,
  scoreFn: (bid: number, tricksTaken: number) => number,
): OutcomeFields {
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

/** Competition ranking: ties share place, next place skipped (1,2,2,4). */
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
  rounds: { number: number; entries: EntrySnap[] }[],
  throughRoundNumber: number,
): { playerId: string; total: number; place: number }[] {
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
  rounds: { number: number; entries: EntrySnap[] }[],
  roundNumber: number,
): Map<
  string,
  { cumulativeScore: number; placeAfterRound: number; scoreBehindLeader: number }
> {
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

type GameFinishStats = {
  winnerPlayerId: string | null;
  winnerScore: number | null;
  runnerUpScore: number | null;
  winMargin: number | null;
  durationMs: number | null;
  totalForceBurns: number;
};

/**
 * Finish stats for a fully completed game.
 * Requires every player to have non-null points on every round.
 * Winner tie-break: higher total, then lower seatIndex (single winner id).
 * winMargin is null when there is no runner-up (sole player).
 */
export function computeGameFinishStats(
  players: SeatPlayer[],
  rounds: { forceBurn: boolean; entries: EntrySnap[] }[],
  createdAt: Date,
  finishedAt: Date,
): GameFinishStats {
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
  const totalForceBurns = rounds.filter((r) => r.forceBurn).length;
  const durationMs = finishedAt.getTime() - createdAt.getTime();
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
    totalForceBurns,
  };
}

export function roundSetupFields(
  players: SeatPlayer[],
  dealerSeat: number,
): {
  firstBidderSeat: number;
  dealerPlayerId: string;
  firstBidderPlayerId: string;
  bidOrderSeats: number[];
} {
  const order = bidOrderFromDealer(dealerSeat, players.length);
  const first = firstBidderSeat(dealerSeat, players.length);
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
  };
}

export function clearOutcomeFields(): {
  made: null;
  trickDelta: null;
  absDelta: null;
  isNilBid: null;
  isNilMade: null;
  cumulativeScore: null;
  placeAfterRound: null;
  scoreBehindLeader: null;
  tricksTaken: null;
  points: null;
} {
  return {
    made: null,
    trickDelta: null,
    absDelta: null,
    isNilBid: null,
    isNilMade: null,
    cumulativeScore: null,
    placeAfterRound: null,
    scoreBehindLeader: null,
    tricksTaken: null,
    points: null,
  };
}

export function eventCreate(
  gameId: string,
  type: GameEventType,
  payload: Prisma.InputJsonValue,
  roundNumber?: number | null,
): Prisma.GameEventCreateManyInput {
  return {
    gameId,
    type,
    roundNumber: roundNumber ?? null,
    payload,
  };
}
