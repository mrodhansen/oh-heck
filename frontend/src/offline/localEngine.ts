import type { GameDetail, GameSummary, Standing } from '../api';
import {
  TOTAL_ROUNDS,
  bidOrderSeats,
  dealerSeat,
  forbiddenLastBid,
  getHandSize,
  newId,
  scoreRound,
} from './rules';
import {
  assertBids,
  assertTricks,
  assertTricksWithBids,
} from './validate';

function defaultGameName(names: string[]): string {
  const d = new Date();
  const stamp = d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${names.join(', ')} — ${stamp}`;
}

function recompute(game: GameDetail): GameDetail {
  const standings = computeStandings(game);
  let currentRound: number | null = null;
  let phase: GameDetail['phase'] = 'completed';

  for (const round of game.rounds) {
    const incomplete = round.entries.some(
      (e) => e.bid === null || e.tricksTaken === null || e.points === null,
    );
    if (incomplete) {
      currentRound = round.number;
      const allBids = round.entries.every((e) => e.bid !== null);
      phase = allBids ? 'tricks' : 'bidding';
      break;
    }
  }

  if (currentRound === null) {
    phase = 'completed';
  }

  const status: GameDetail['status'] =
    phase === 'completed'
      ? 'COMPLETED'
      : phase === 'tricks'
        ? 'PLAYING'
        : 'BIDDING';

  const rounds = game.rounds.map((round) => {
    const order = bidOrderSeats(round.number, game.players.length);
    const bidOrderPlayerIds = order.map(
      (seat) => game.players.find((p) => p.seatIndex === seat)!.id,
    );
    let prior = 0;
    const lastIdx = bidOrderPlayerIds.length - 1;
    for (let i = 0; i < lastIdx; i++) {
      const e = round.entries.find((x) => x.playerId === bidOrderPlayerIds[i]);
      if (e?.bid != null) prior += e.bid;
    }
    const allBidsIn = round.entries.every((e) => e.bid !== null);
    return {
      ...round,
      dealerPlayerId: game.players.find((p) => p.seatIndex === round.dealerSeat)
        ?.id,
      bidOrderPlayerIds,
      forbiddenLastBid: allBidsIn
        ? null
        : forbiddenLastBid(prior, round.handSize),
      complete: round.entries.every(
        (e) => e.bid !== null && e.tricksTaken !== null && e.points !== null,
      ),
    };
  });

  return {
    ...game,
    status,
    phase,
    currentRound,
    finishedAt:
      phase === 'completed'
        ? (game.finishedAt ?? new Date().toISOString())
        : null,
    rounds,
    standings,
  };
}

function computeStandings(game: GameDetail): Standing[] {
  const totals = game.players.map((p) => {
    let total = 0;
    let roundsPlayed = 0;
    let bidsMade = 0;
    for (const round of game.rounds) {
      const e = round.entries.find((x) => x.playerId === p.id);
      if (e?.points != null) {
        total += e.points;
        roundsPlayed += 1;
        if (e.bid !== null && e.tricksTaken !== null && e.bid === e.tricksTaken) {
          bidsMade += 1;
        }
      }
    }
    return {
      playerId: p.id,
      playerName: p.name,
      seatIndex: p.seatIndex,
      total,
      roundsPlayed,
      bidsMade,
      place: 0,
    };
  });

  const sorted = [...totals].sort((a, b) => b.total - a.total);
  let place = 0;
  let last: number | null = null;
  const withPlace = sorted.map((row, idx) => {
    if (last === null || row.total !== last) {
      place = idx + 1;
      last = row.total;
    }
    return { ...row, place };
  });
  return withPlace.sort((a, b) => a.seatIndex - b.seatIndex);
}

export function createLocalGame(
  playerNames: string[],
  name?: string,
  ids?: { gameId: string; playerIds: string[] },
): GameDetail {
  const names = playerNames.map((n) => n.trim()).filter(Boolean);
  if (names.length < 2 || names.length > 7) {
    throw new Error('Need 2–7 players');
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    throw new Error('Player names must be unique');
  }
  const gameId = ids?.gameId ?? newId();
  const players = names.map((n, seatIndex) => ({
    id: ids?.playerIds[seatIndex] ?? newId(),
    name: n,
    seatIndex,
  }));
  const n = players.length;
  const now = new Date().toISOString();

  const rounds = Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
    const number = i + 1;
    const handSize = getHandSize(number);
    const dSeat = dealerSeat(number, n);
    const order = bidOrderSeats(number, n);
    return {
      id: newId(),
      number,
      handSize,
      dealerSeat: dSeat,
      forceBurn: false,
      dealerPlayerId: players.find((p) => p.seatIndex === dSeat)?.id,
      bidOrderPlayerIds: order.map(
        (seat) => players.find((p) => p.seatIndex === seat)!.id,
      ),
      forbiddenLastBid: forbiddenLastBid(0, handSize),
      entries: players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        seatIndex: p.seatIndex,
        bid: null,
        tricksTaken: null,
        points: null,
      })),
      complete: false,
    };
  });

  return recompute({
    id: gameId,
    name: name?.trim() || defaultGameName(names),
    status: 'BIDDING',
    phase: 'bidding',
    currentRound: 1,
    createdAt: now,
    finishedAt: null,
    players,
    rounds,
    standings: [],
  });
}

export function localSetBids(
  game: GameDetail,
  roundNumber: number,
  bids: { playerId: string; bid: number }[],
  forceBurn = false,
): GameDetail {
  assertBids(game, roundNumber, bids);
  const bidMap = new Map(bids.map((b) => [b.playerId, b.bid]));
  for (const p of game.players) {
    if (bidMap.get(p.id) === undefined) {
      throw new Error('Bid missing for player');
    }
  }
  const rounds = game.rounds.map((r) => {
    if (r.number !== roundNumber) return r;
    return {
      ...r,
      forceBurn,
      entries: r.entries.map((e) => ({
        ...e,
        bid: bidMap.get(e.playerId)!,
        tricksTaken: null,
        points: null,
      })),
    };
  });
  return recompute({ ...game, rounds });
}

export function localSetTricks(
  game: GameDetail,
  roundNumber: number,
  tricks: { playerId: string; tricksTaken: number }[],
): GameDetail {
  if (game.rounds.find((r) => r.number === roundNumber)?.entries.some((e) => e.bid === null)) {
    throw new Error('All bids must be set before tricks');
  }
  assertTricks(game, roundNumber, tricks);
  const trickMap = new Map(tricks.map((t) => [t.playerId, t.tricksTaken]));
  const rounds = game.rounds.map((r) => {
    if (r.number !== roundNumber) return r;
    return {
      ...r,
      entries: r.entries.map((e) => {
        const taken = trickMap.get(e.playerId);
        if (taken === undefined || e.bid === null) {
          throw new Error('Missing bid or tricks for player');
        }
        return {
          ...e,
          tricksTaken: taken,
          points: scoreRound(e.bid, taken),
        };
      }),
    };
  });
  return recompute({ ...game, rounds });
}

export function localUpdateRound(
  game: GameDetail,
  roundNumber: number,
  bids: { playerId: string; bid: number }[],
  tricks: { playerId: string; tricksTaken: number }[],
  forceBurn = false,
): GameDetail {
  assertTricksWithBids(game, roundNumber, bids, tricks);
  const bidMap = new Map(bids.map((b) => [b.playerId, b.bid]));
  const trickMap = new Map(tricks.map((t) => [t.playerId, t.tricksTaken]));
  const rounds = game.rounds.map((r) => {
    if (r.number !== roundNumber) return r;
    return {
      ...r,
      forceBurn,
      entries: r.entries.map((e) => {
        const bid = bidMap.get(e.playerId);
        const taken = trickMap.get(e.playerId);
        if (bid === undefined || taken === undefined) {
          throw new Error('Bid or tricks missing for player');
        }
        return {
          ...e,
          bid,
          tricksTaken: taken,
          points: scoreRound(bid, taken),
        };
      }),
    };
  });
  return recompute({ ...game, rounds });
}

export function toSummary(game: GameDetail): GameSummary {
  return {
    id: game.id,
    name: game.name,
    status: game.status,
    createdAt: game.createdAt,
    finishedAt: game.finishedAt,
    playerCount: game.players.length,
    players: game.players.map((p) => p.name),
    currentRound: game.currentRound,
    standings: game.standings,
  };
}
