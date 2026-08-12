import { GameEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cardKey, Card, Suit } from './cards';
import { EngineState } from './engine';
import { eventCreate } from '../games/analytics';
import { toInputJson, type JsonArray, type JsonObject } from '../common/json';
import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

function jsonArray(value: Prisma.JsonValue | null): JsonArray {
  if (!Array.isArray(value)) return [];
  return JSON.parse(JSON.stringify(value)) as JsonArray;
}

type SeatPlayer = { id: string; name: string; seatIndex: number };

export async function logLiveEvent(
  prisma: PrismaService,
  args: {
    sessionId?: string | null;
    gameId?: string | null;
    type: string;
    playerId?: string | null;
    roundNumber?: number | null;
    payload?: JsonObject;
  },
) {
  await prisma.liveEvent.create({
    data: {
      sessionId: args.sessionId ?? null,
      gameId: args.gameId ?? null,
      type: args.type,
      playerId: args.playerId ?? null,
      roundNumber: args.roundNumber ?? null,
      payload: toInputJson(args.payload ?? {}),
    },
  });
}

/** Persist deal snapshot onto Round + entries + events. */
export async function persistDeal(
  prisma: PrismaService,
  args: {
    gameId: string;
    sessionId: string;
    roundNumber: number;
    state: EngineState;
    players: SeatPlayer[];
  },
) {
  const { gameId, sessionId, roundNumber, state, players } = args;
  const round = await prisma.round.findUnique({
    where: { gameId_number: { gameId, number: roundNumber } },
    include: { entries: true },
  });
  if (!round) {
    throw new NotFoundException(`Round ${roundNumber} not found`);
  }

  const bySeat = state.hands.map((hand) =>
    hand.map((c) => ({ s: c.s, r: c.r })),
  );
  const byPlayerId: { [playerId: string]: { s: Card['s']; r: Card['r'] }[] } = {};
  for (const p of players) {
    byPlayerId[p.id] = bySeat[p.seatIndex] ?? [];
  }
  const dealtHands = { bySeat, byPlayerId };
  const trumpCard = state.trumpCard
    ? { s: state.trumpCard.s, r: state.trumpCard.r }
    : null;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.round.update({
      where: { id: round.id },
      data: {
        trumpSuit: state.trumpSuit,
        trumpCard: trumpCard ? toInputJson(trumpCard) : undefined,
        dealtHands: toInputJson(dealtHands),
        dealtAt: now,
        trickHistory: toInputJson([]),
      },
    });

    for (const p of players) {
      const entry = round.entries.find((e) => e.playerId === p.id);
      if (!entry) {
        throw new NotFoundException(`Round entry missing for player ${p.id}`);
      }
      await tx.roundEntry.update({
        where: { id: entry.id },
        data: {
          dealtHand: toInputJson(byPlayerId[p.id] ?? []),
          cardsPlayed: toInputJson([]),
          bidPlacedAt: null,
        },
      });
    }

    await tx.gameEvent.create({
      data: eventCreate(
        gameId,
        GameEventType.ROUND_DEALT,
        {
          roundNumber,
          handSize: state.handSize,
          dealerSeat: state.dealerSeat,
          bidOrderSeats: state.bidOrder,
          trumpSuit: state.trumpSuit,
          trumpCard,
          dealtHands,
          seats: players.map((p) => ({
            playerId: p.id,
            name: p.name,
            seatIndex: p.seatIndex,
          })),
        },
        roundNumber,
      ),
    });

    await tx.liveEvent.create({
      data: {
        sessionId,
        gameId,
        type: 'ROUND_DEALT',
        roundNumber,
        payload: toInputJson({
          handSize: state.handSize,
          dealerSeat: state.dealerSeat,
          trumpSuit: state.trumpSuit,
          trumpCard,
          handCounts: players.map((p) => ({
            playerId: p.id,
            seatIndex: p.seatIndex,
            cards: (byPlayerId[p.id] ?? []).length,
          })),
        }),
      },
    });
  });
}

/** Record a single card play (partial trick) as events. */
export async function persistCardPlay(
  prisma: PrismaService,
  args: {
    gameId: string;
    sessionId: string;
    roundNumber: number;
    trickIndex: number;
    playOrder: number;
    seatIndex: number;
    playerId: string;
    card: Card;
    leadSuit: Suit | null;
    trumpSuit: Suit;
  },
) {
  const followedSuit =
    args.leadSuit == null || args.card.s === args.leadSuit;
  const playedTrump = args.card.s === args.trumpSuit;
  const key = cardKey(args.card);
  const payload = {
    roundNumber: args.roundNumber,
    trickIndex: args.trickIndex,
    playOrder: args.playOrder,
    seatIndex: args.seatIndex,
    playerId: args.playerId,
    card: { s: args.card.s, r: args.card.r, key },
    leadSuit: args.leadSuit,
    trumpSuit: args.trumpSuit,
    followedSuit,
    playedTrump,
  };

  await prisma.$transaction(async (tx) => {
    await tx.gameEvent.create({
      data: eventCreate(
        args.gameId,
        GameEventType.CARD_PLAYED,
        payload,
        args.roundNumber,
      ),
    });
    await tx.liveEvent.create({
      data: {
        sessionId: args.sessionId,
        gameId: args.gameId,
        type: 'CARD_PLAYED',
        playerId: args.playerId,
        roundNumber: args.roundNumber,
        payload: toInputJson(payload),
      },
    });

    // Append to RoundEntry.cardsPlayed
    const round = await tx.round.findUnique({
      where: {
        gameId_number: { gameId: args.gameId, number: args.roundNumber },
      },
      include: { entries: true },
    });
    if (!round) {
      throw new NotFoundException(`Round ${args.roundNumber} not found`);
    }
    const entry = round.entries.find((e) => e.playerId === args.playerId);
    if (!entry) {
      throw new NotFoundException(`Round entry missing for player ${args.playerId}`);
    }
    const prev = jsonArray(entry.cardsPlayed);
    await tx.roundEntry.update({
      where: { id: entry.id },
      data: {
        cardsPlayed: toInputJson([
          ...prev,
          {
            trickIndex: args.trickIndex,
            playOrder: args.playOrder,
            s: args.card.s,
            r: args.card.r,
            key,
          },
        ]),
      },
    });
  });
}

/** Persist a completed trick (normalized + round.trickHistory + events). */
export async function persistCompletedTrick(
  prisma: PrismaService,
  args: {
    gameId: string;
    sessionId: string;
    roundNumber: number;
    trickIndex: number;
    leadSeat: number;
    leadSuit: Suit;
    winnerSeat: number;
    trumpSuit: Suit;
    plays: { seat: number; card: Card }[];
    players: SeatPlayer[];
  },
) {
  const {
    gameId,
    sessionId,
    roundNumber,
    trickIndex,
    leadSeat,
    leadSuit,
    winnerSeat,
    trumpSuit,
    plays,
    players,
  } = args;

  const seatToPlayer = new Map(players.map((p) => [p.seatIndex, p]));
  const winner = seatToPlayer.get(winnerSeat);
  const playRows = plays.map((p, playOrder) => {
    const player = seatToPlayer.get(p.seat);
    if (!player) {
      throw new NotFoundException(`No player at seat ${p.seat}`);
    }
    const followedSuit = playOrder === 0 || p.card.s === leadSuit;
    return {
      playOrder,
      seatIndex: p.seat,
      playerId: player.id,
      cardSuit: p.card.s,
      cardRank: p.card.r,
      cardKey: cardKey(p.card),
      followedSuit,
      playedTrump: p.card.s === trumpSuit,
    };
  });

  const historyEntry = {
    trickIndex,
    leadSeat,
    leadSuit,
    winnerSeat,
    winnerPlayerId: winner?.id ?? null,
    plays: playRows.map((p) => ({
      playOrder: p.playOrder,
      seatIndex: p.seatIndex,
      playerId: p.playerId,
      card: { s: p.cardSuit, r: p.cardRank, key: p.cardKey },
      followedSuit: p.followedSuit,
      playedTrump: p.playedTrump,
    })),
  };

  await prisma.$transaction(async (tx) => {
    const round = await tx.round.findUniqueOrThrow({
      where: { gameId_number: { gameId, number: roundNumber } },
    });

    await tx.trick.create({
      data: {
        gameId,
        roundId: round.id,
        trickIndex,
        leadSeat,
        leadSuit,
        winnerSeat,
        winnerPlayerId: winner?.id ?? null,
        plays: { create: playRows },
      },
    });

    const prevHist = jsonArray(round.trickHistory);
    await tx.round.update({
      where: { id: round.id },
      data: {
        trickHistory: toInputJson([...prevHist, historyEntry]),
      },
    });

    await tx.gameEvent.create({
      data: eventCreate(
        gameId,
        GameEventType.TRICK_COMPLETED,
        historyEntry,
        roundNumber,
      ),
    });

    await tx.liveEvent.create({
      data: {
        sessionId,
        gameId,
        type: 'TRICK_COMPLETED',
        playerId: winner?.id ?? null,
        roundNumber,
        payload: toInputJson(historyEntry),
      },
    });
  });
}

export async function persistBidPlaced(
  prisma: PrismaService,
  args: {
    gameId: string;
    sessionId: string;
    roundNumber: number;
    playerId: string;
    seatIndex: number;
    bid: number;
    bidPosition: number;
    runningBidBefore: number;
    isLast: boolean;
    forceBurn: boolean;
    forbiddenLastBid: number | null;
  },
) {
  const now = new Date();
  const payload = {
    roundNumber: args.roundNumber,
    playerId: args.playerId,
    seatIndex: args.seatIndex,
    bid: args.bid,
    bidPosition: args.bidPosition,
    runningBidBefore: args.runningBidBefore,
    isLast: args.isLast,
    forceBurn: args.forceBurn,
    forbiddenLastBid: args.forbiddenLastBid,
  };

  await prisma.$transaction(async (tx) => {
    const round = await tx.round.findUnique({
      where: {
        gameId_number: { gameId: args.gameId, number: args.roundNumber },
      },
      include: { entries: true },
    });
    if (!round) {
      throw new NotFoundException(`Round ${args.roundNumber} not found`);
    }
    const entry = round.entries.find((e) => e.playerId === args.playerId);
    if (!entry) {
      throw new NotFoundException(`Round entry missing for player ${args.playerId}`);
    }
    await tx.roundEntry.update({
      where: { id: entry.id },
      data: { bidPlacedAt: now },
    });

    await tx.gameEvent.create({
      data: eventCreate(
        args.gameId,
        GameEventType.BID_PLACED,
        payload,
        args.roundNumber,
      ),
    });
    await tx.liveEvent.create({
      data: {
        sessionId: args.sessionId,
        gameId: args.gameId,
        type: 'BID_PLACED',
        playerId: args.playerId,
        roundNumber: args.roundNumber,
        payload: toInputJson(payload),
      },
    });
  });
}
