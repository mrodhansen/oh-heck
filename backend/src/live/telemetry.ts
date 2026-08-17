import { GameEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cardKey, Card, Suit } from './cards';
import { EngineState } from './engine';
import { eventCreate } from '../games/analytics';
import { toInputJson, type JsonObject } from '../common/json';
import { toCurrentTrickJson } from '../games/play-json';
import { NotFoundException } from '@nestjs/common';

type SeatPlayer = { id: string; name: string; seatIndex: number };

export async function logEvent(
  prisma: PrismaService,
  args: {
    sessionId?: string | null;
    gameId?: string | null;
    type: GameEventType;
    playerId?: string | null;
    roundNumber?: number | null;
    payload?: JsonObject;
  },
) {
  await prisma.gameEvent.create({
    data: eventCreate({
      sessionId: args.sessionId,
      gameId: args.gameId,
      type: args.type,
      playerId: args.playerId,
      roundNumber: args.roundNumber,
      payload: args.payload ?? {},
    }),
  });
}

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

  const byPlayerId: { [playerId: string]: { s: Card['s']; r: Card['r'] }[] } = {};
  for (const p of players) {
    byPlayerId[p.id] = (state.hands[p.seatIndex] ?? []).map((c) => ({
      s: c.s,
      r: c.r,
    }));
  }
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
        dealtAt: now,
        currentTrick: Prisma.JsonNull,
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
          bidPlacedAt: null,
        },
      });
    }

    await tx.gameEvent.create({
      data: eventCreate({
        gameId,
        sessionId,
        type: GameEventType.ROUND_DEALT,
        payload: {
          roundNumber,
          handSize: state.handSize,
          dealerSeat: state.dealerSeat,
          bidOrderSeats: state.bidOrder,
          trumpSuit: state.trumpSuit,
          trumpCard,
          seats: players.map((p) => ({
            playerId: p.id,
            name: p.name,
            seatIndex: p.seatIndex,
          })),
        },
        roundNumber,
      }),
    });
  });
}

export async function persistCurrentTrick(
  prisma: PrismaService,
  args: {
    gameId: string;
    roundNumber: number;
    state: EngineState;
    players: SeatPlayer[];
  },
) {
  const round = await prisma.round.findUnique({
    where: {
      gameId_number: { gameId: args.gameId, number: args.roundNumber },
    },
  });
  if (!round) {
    throw new NotFoundException(`Round ${args.roundNumber} not found`);
  }
  const bySeat = new Map(args.players.map((p) => [p.seatIndex, p]));
  const json = args.state.currentTrick
    ? toCurrentTrickJson({
        leadSeat: args.state.currentTrick.leadSeat,
        plays: args.state.currentTrick.plays.map((p) => {
          const player = bySeat.get(p.seat);
          if (!player) {
            throw new NotFoundException(`No player at seat ${p.seat}`);
          }
          return { seat: p.seat, card: p.card, playerId: player.id };
        }),
        trumpSuit: args.state.trumpSuit,
      })
    : null;
  await prisma.round.update({
    where: { id: round.id },
    data: {
      currentTrick: json == null ? Prisma.JsonNull : toInputJson(json),
    },
  });
}

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

  await prisma.gameEvent.create({
    data: eventCreate({
      gameId: args.gameId,
      sessionId: args.sessionId,
      playerId: args.playerId,
      type: GameEventType.CARD_PLAYED,
      payload,
      roundNumber: args.roundNumber,
    }),
  });
}

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

    await tx.gameEvent.create({
      data: eventCreate({
        gameId,
        sessionId,
        playerId: winner?.id ?? null,
        type: GameEventType.TRICK_COMPLETED,
        payload: historyEntry,
        roundNumber,
      }),
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
    isDealer: boolean;
    isFirstBidder: boolean;
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
      data: {
        bid: args.bid,
        bidPlacedAt: now,
        bidPosition: args.bidPosition,
        runningBidBefore: args.runningBidBefore,
        isLastBidder: args.isLast,
        isDealer: args.isDealer,
        isFirstBidder: args.isFirstBidder,
      },
    });

    await tx.gameEvent.create({
      data: eventCreate({
        gameId: args.gameId,
        sessionId: args.sessionId,
        playerId: args.playerId,
        type: GameEventType.BID_PLACED,
        payload,
        roundNumber: args.roundNumber,
      }),
    });
  });
}
