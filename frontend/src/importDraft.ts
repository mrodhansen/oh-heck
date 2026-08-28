import type { GameDetail, GameNote, RoundDetail, RoundEntry } from './api';
import {
  assignPlacesByTotal,
  computeGameFinishStats,
  cumulativeFieldsForRound,
  derivedBidAggregates,
  derivedEntryOutcome,
  emptyEntryAnalytics,
  firstBidderSeat,
} from './offline/analytics';
import { createGameNote } from './offline/notes';
import {
  bidOrderSeats,
  dealerSeat,
  getHandSize,
  newId,
  scoreRound,
  TOTAL_ROUNDS,
} from './offline/rules';

export const HAND_SIZES = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7] as const;

export type ImportPlayer = {
  id: string;
  name: string;
  seatIndex: number;
};

export type ImportRoundEntry = {
  playerId: string;
  bid: number | null;
  tricksTaken: number | null;
};

export type ImportRound = {
  number: number;
  handSize: number;
  forceBurn: boolean;
  entries: ImportRoundEntry[];
};

export type ImportDraft = {
  name: string | null;
  gameDate: string | null;
  aiImport: boolean;
  notes: GameNote[];
  players: ImportPlayer[];
  rounds: ImportRound[];
};

export type ParsedImportPayload = {
  name: string | null;
  gameDate: string | null;
  aiImport: true;
  notes: { text: string }[];
  players: { name: string; seatIndex: number }[];
  rounds: {
    number: number;
    forceBurn: boolean;
    entries: { seatIndex: number; bid: number; tricksTaken: number }[];
  }[];
};

export function emptyRounds(players: ImportPlayer[]): ImportRound[] {
  return Array.from({ length: TOTAL_ROUNDS }, (_, i) => {
    const number = i + 1;
    return {
      number,
      handSize: getHandSize(number),
      forceBurn: false,
      entries: players.map((p) => ({
        playerId: p.id,
        bid: null,
        tricksTaken: null,
      })),
    };
  });
}

export function draftFromParsed(
  parsed: ParsedImportPayload,
  aiImport: boolean,
): ImportDraft {
  const players: ImportPlayer[] = parsed.players
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((p) => ({
      id: newId(),
      name: p.name.trim(),
      seatIndex: p.seatIndex,
    }));
  const rounds = emptyRounds(players);
  for (const src of parsed.rounds) {
    const round = rounds[src.number - 1];
    if (!round) {
      throw new Error(`Invalid round number ${src.number}`);
    }
    round.forceBurn = src.forceBurn;
    for (const e of src.entries) {
      const player = players.find((p) => p.seatIndex === e.seatIndex);
      if (!player) {
        throw new Error(`Round ${src.number}: unknown seat ${e.seatIndex}`);
      }
      const entry = round.entries.find((x) => x.playerId === player.id);
      if (!entry) {
        throw new Error(`Round ${src.number}: missing ${player.name}`);
      }
      entry.bid = e.bid;
      entry.tricksTaken = e.tricksTaken;
    }
  }
  return {
    name: parsed.name,
    gameDate: parsed.gameDate,
    aiImport,
    notes: parsed.notes
      .map((n) => n.text.trim())
      .filter(Boolean)
      .map((text) => createGameNote(text)),
    players,
    rounds,
  };
}

export function validateImportDraft(draft: ImportDraft): string[] {
  const errors: string[] = [];
  const n = draft.players.length;
  if (n < 2 || n > 7) errors.push('Need 2–7 players');
  const names = new Set<string>();
  const seats = new Set<number>();
  for (const p of draft.players) {
    const name = p.name.trim();
    if (!name) errors.push('Player names cannot be empty');
    const key = name.toLowerCase();
    if (names.has(key)) errors.push('Player names must be unique');
    names.add(key);
    if (p.seatIndex < 0 || p.seatIndex >= n) {
      errors.push(`Seat ${p.seatIndex} is out of range`);
    }
    if (seats.has(p.seatIndex)) errors.push('Player seats must be unique');
    seats.add(p.seatIndex);
  }
  if (draft.rounds.length !== TOTAL_ROUNDS) {
    errors.push(`Import must include all ${TOTAL_ROUNDS} rounds`);
  }
  for (const round of draft.rounds) {
    const handSize = HAND_SIZES[round.number - 1];
    if (handSize === undefined) {
      errors.push(`Invalid round ${round.number}`);
      continue;
    }
    if (round.handSize !== handSize) {
      errors.push(`Round ${round.number}: expected ${handSize} cards`);
    }
    let trickSum = 0;
    let complete = true;
    const seen = new Set<string>();
    for (const e of round.entries) {
      if (seen.has(e.playerId)) {
        errors.push(`Round ${round.number}: duplicate player`);
      }
      seen.add(e.playerId);
      if (e.bid === null || e.tricksTaken === null) {
        complete = false;
        continue;
      }
      if (e.bid < 0 || e.bid > handSize) {
        errors.push(`Round ${round.number}: bid must be 0–${handSize}`);
      }
      if (e.tricksTaken < 0 || e.tricksTaken > handSize) {
        errors.push(`Round ${round.number}: tricks must be 0–${handSize}`);
      }
      trickSum += e.tricksTaken;
    }
    if (seen.size !== n) {
      errors.push(`Round ${round.number} is missing a player`);
    }
    if (complete && trickSum !== handSize) {
      errors.push(
        `Round ${round.number}: tricks must sum to ${handSize} (got ${trickSum})`,
      );
    }
    if (!complete) {
      errors.push(`Round ${round.number} is incomplete`);
    }
  }
  return errors;
}

export type ImportGameBody = {
  name?: string;
  gameDate?: string;
  aiImport: boolean;
  notes: GameNote[];
  players: { name: string; seatIndex: number }[];
  rounds: {
    number: number;
    forceBurn: boolean;
    entries: { seatIndex: number; bid: number; tricksTaken: number }[];
  }[];
};

export function draftToImportBody(draft: ImportDraft): ImportGameBody {
  const errors = validateImportDraft(draft);
  if (errors.length) {
    throw new Error(errors[0]);
  }
  return {
    name: draft.name?.trim() || undefined,
    gameDate: draft.gameDate ?? undefined,
    aiImport: draft.aiImport,
    notes: draft.notes,
    players: draft.players.map((p) => ({
      name: p.name.trim(),
      seatIndex: p.seatIndex,
    })),
    rounds: draft.rounds.map((r) => ({
      number: r.number,
      forceBurn: r.forceBurn,
      entries: r.entries.map((e) => {
        const player = draft.players.find((p) => p.id === e.playerId);
        if (!player) {
          throw new Error(`Round ${r.number}: unknown player`);
        }
        if (e.bid === null || e.tricksTaken === null) {
          throw new Error(`Round ${r.number} is incomplete`);
        }
        return {
          seatIndex: player.seatIndex,
          bid: e.bid,
          tricksTaken: e.tricksTaken,
        };
      }),
    })),
  };
}

export function draftToPreviewGame(draft: ImportDraft): GameDetail {
  const players = draft.players
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((p) => ({
      id: p.id,
      name: p.name.trim() || `Seat ${p.seatIndex + 1}`,
      seatIndex: p.seatIndex,
    }));
  const n = players.length || 2;
  const createdAt = draft.gameDate
    ? `${draft.gameDate}T12:00:00.000Z`
    : new Date().toISOString();

  const rounds: RoundDetail[] = draft.rounds.map((round) => {
    const dSeat = dealerSeat(round.number, n);
    const order = bidOrderSeats(round.number, n);
    const first = firstBidderSeat(dSeat, n);
    const entries: RoundEntry[] = players.map((p) => {
      const src = round.entries.find((e) => e.playerId === p.id);
      const bid = src?.bid ?? null;
      const tricksTaken = src?.tricksTaken ?? null;
      const points =
        bid !== null && tricksTaken !== null
          ? scoreRound(bid, tricksTaken)
          : null;
      const outcome = derivedEntryOutcome(bid, tricksTaken);
      return {
        playerId: p.id,
        playerName: p.name,
        seatIndex: p.seatIndex,
        bid,
        tricksTaken,
        points,
        ...emptyEntryAnalytics(p.seatIndex, dSeat, order),
        made: outcome.made,
        trickDelta: outcome.trickDelta,
        absDelta: outcome.absDelta,
        isNilBid: outcome.isNilBid,
        isNilMade: outcome.isNilMade,
      };
    });
    const complete = entries.every(
      (e) => e.bid !== null && e.tricksTaken !== null && e.points !== null,
    );
    const { bidSum, bidDeficit } = derivedBidAggregates(
      round.handSize,
      entries.map((e) => e.bid),
    );
    return {
      id: `preview-r${round.number}`,
      number: round.number,
      handSize: round.handSize,
      dealerSeat: dSeat,
      firstBidderSeat: first,
      forceBurn: round.forceBurn,
      dealerPlayerId: players.find((p) => p.seatIndex === dSeat)?.id,
      firstBidderPlayerId: players.find((p) => p.seatIndex === first)?.id,
      bidOrderSeats: order,
      bidOrderPlayerIds: order.map(
        (seat) => players.find((p) => p.seatIndex === seat)!.id,
      ),
      bidSum,
      bidDeficit,
      forbiddenLastBid: null,
      bidsCompletedAt: complete ? createdAt : null,
      tricksCompletedAt: complete ? createdAt : null,
      completedAt: complete ? createdAt : null,
      editCount: 0,
      entries,
      complete,
    };
  });

  const allComplete = rounds.every((r) => r.complete);
  const roundsSnap = rounds.map((r) => ({
    number: r.number,
    forceBurn: r.forceBurn,
    entries: r.entries.map((e) => ({
      playerId: e.playerId,
      points: e.points,
    })),
  }));
  const hydratedRounds = rounds.map((round) => {
    if (!round.complete) return round;
    const cum = cumulativeFieldsForRound(
      players,
      roundsSnap,
      round.number,
    );
    return {
      ...round,
      entries: round.entries.map((e) => {
        const standing = cum.get(e.playerId);
        return {
          ...e,
          cumulativeScore: standing?.cumulativeScore ?? null,
          placeAfterRound: standing?.placeAfterRound ?? null,
          scoreBehindLeader: standing?.scoreBehindLeader ?? null,
        };
      }),
    };
  });

  const standings = assignPlacesByTotal(
    players.map((p) => {
      let total = 0;
      let roundsPlayed = 0;
      let bidsMade = 0;
      for (const round of hydratedRounds) {
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
    }),
  ).sort((a, b) => a.seatIndex - b.seatIndex);

  let finish: ReturnType<typeof computeGameFinishStats> | null = null;
  if (allComplete && players.length > 0) {
    finish = computeGameFinishStats(
      players,
      roundsSnap,
      createdAt,
      createdAt,
    );
  }

  return {
    id: 'preview',
    name: draft.name,
    notes: draft.notes,
    status: allComplete ? 'COMPLETED' : 'PLAYING',
    playMode: 'IN_PERSON',
    superScorer: false,
    aiImport: draft.aiImport,
    liveCode: null,
    phase: allComplete ? 'completed' : 'tricks',
    currentRound: allComplete
      ? null
      : hydratedRounds.find((r) => !r.complete)?.number ?? 1,
    createdAt,
    startedAt: createdAt,
    finishedAt: allComplete ? createdAt : null,
    durationMs: finish?.durationMs ?? 0,
    playerCount: players.length,
    firstDealerSeat: dealerSeat(1, n),
    winnerPlayerId: finish?.winnerPlayerId ?? null,
    winnerScore: finish?.winnerScore ?? null,
    runnerUpScore: finish?.runnerUpScore ?? null,
    winMargin: finish?.winMargin ?? null,
    totalForceBurns: hydratedRounds.filter((r) => r.forceBurn).length,
    totalEdits: 0,
    players,
    rounds: hydratedRounds,
    standings,
    events: [],
  };
}
