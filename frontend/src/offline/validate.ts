import type { GameDetail } from '../api';
import { bidOrderSeats, forbiddenLastBid } from './rules';

export function assertBids(
  game: GameDetail,
  roundNumber: number,
  bids: { playerId: string; bid: number }[],
  opts?: { allowEditPast?: boolean },
): void {
  const round = game.rounds.find((r) => r.number === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);
  if (!opts?.allowEditPast) {
    if (game.status === 'COMPLETED' || game.phase === 'completed') {
      throw new Error('Game is completed');
    }
    if (game.currentRound != null && roundNumber !== game.currentRound) {
      throw new Error(`Can only set bids on current round (${game.currentRound})`);
    }
    if (round.complete) throw new Error('Round already complete; use edit');
  } else {
    // Edit path: no future rounds past the furthest incomplete/complete frontier
    const maxRound =
      game.currentRound ??
      Math.max(...game.rounds.filter((r) => r.complete).map((r) => r.number), 0);
    if (roundNumber > maxRound && game.phase !== 'completed') {
      throw new Error('Cannot edit a future round');
    }
  }
  if (bids.length !== game.players.length) {
    throw new Error('Must include a bid for every player');
  }
  const seen = new Set<string>();
  for (const b of bids) {
    if (seen.has(b.playerId)) throw new Error('Duplicate player bid');
    seen.add(b.playerId);
    if (!game.players.some((p) => p.id === b.playerId)) {
      throw new Error('Unknown player in bids');
    }
    if (!Number.isInteger(b.bid) || b.bid < 0 || b.bid > round.handSize) {
      throw new Error(`Bid must be 0–${round.handSize}`);
    }
  }

  const order =
    round.bidOrderSeats?.length === game.players.length
      ? round.bidOrderSeats
      : bidOrderSeats(round.number, game.players.length);
  const seatToPlayer = new Map(game.players.map((p) => [p.seatIndex, p]));
  const bidByPlayer = new Map(bids.map((b) => [b.playerId, b.bid]));
  let running = 0;
  for (let i = 0; i < order.length; i++) {
    const player = seatToPlayer.get(order[i]);
    if (!player) throw new Error('Invalid seat order');
    const bid = bidByPlayer.get(player.id);
    if (bid === undefined) throw new Error('Missing bid');
    const isLast = i === order.length - 1;
    if (isLast) {
      const forbidden = forbiddenLastBid(running, round.handSize);
      if (forbidden !== null && bid === forbidden) {
        throw new Error(
          `Last bidder cannot bid ${forbidden} (total would equal ${round.handSize})`,
        );
      }
    }
    running += bid;
  }
}

export function assertTricks(
  game: GameDetail,
  roundNumber: number,
  tricks: { playerId: string; tricksTaken: number }[],
  opts?: { requireBidsOnGame?: boolean; allowEditPast?: boolean },
): void {
  const round = game.rounds.find((r) => r.number === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);
  if (!opts?.allowEditPast) {
    if (game.status === 'COMPLETED' || game.phase === 'completed') {
      throw new Error('Game is completed');
    }
    if (game.currentRound != null && roundNumber !== game.currentRound) {
      throw new Error(
        `Can only set tricks on current round (${game.currentRound})`,
      );
    }
  }
  if (opts?.requireBidsOnGame !== false) {
    if (round.entries.some((e) => e.bid === null)) {
      throw new Error('All bids must be set before tricks');
    }
  }
  if (tricks.length !== game.players.length) {
    throw new Error('Must include tricks for every player');
  }
  const seen = new Set<string>();
  let sum = 0;
  for (const t of tricks) {
    if (seen.has(t.playerId)) throw new Error('Duplicate player tricks');
    seen.add(t.playerId);
    if (!game.players.some((p) => p.id === t.playerId)) {
      throw new Error('Unknown player in tricks');
    }
    if (
      !Number.isInteger(t.tricksTaken) ||
      t.tricksTaken < 0 ||
      t.tricksTaken > round.handSize
    ) {
      throw new Error(`Tricks must be 0–${round.handSize}`);
    }
    sum += t.tricksTaken;
  }
  if (sum !== round.handSize) {
    throw new Error(`Tricks must sum to ${round.handSize} (got ${sum})`);
  }
}

export function assertTricksWithBids(
  game: GameDetail,
  roundNumber: number,
  bids: { playerId: string; bid: number }[],
  tricks: { playerId: string; tricksTaken: number }[],
): void {
  assertBids(game, roundNumber, bids, { allowEditPast: true });
  assertTricks(game, roundNumber, tricks, {
    requireBidsOnGame: false,
    allowEditPast: true,
  });
  const bidMap = new Map(bids.map((b) => [b.playerId, b.bid]));
  for (const p of game.players) {
    if (bidMap.get(p.id) === undefined) {
      throw new Error('Bid missing for player');
    }
  }
}
