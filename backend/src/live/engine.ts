import { BadRequestException } from '@nestjs/common';
import {
  enginePlays,
  parseCardJson,
  parseCardList,
  parseCurrentTrick,
} from '../games/play-json';
import {
  Card,
  Suit,
  legalPlays,
  makeDeck,
  removeCard,
  shuffle,
  sortHand,
  winnerOfTrick,
  cardsEqual,
  cardKey,
} from './cards';

type LivePhase =
  | 'lobby'
  | 'bidding'
  | 'playing'
  | 'trick_reveal'
  | 'complete';

export type EngineState = {
  phase: LivePhase;
  roundNumber: number;
  handSize: number;
  dealerSeat: number;
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  /** hands[seat] = cards */
  hands: Card[][];
  bids: (number | null)[];
  bidOrder: number[];
  /** index into bidOrder */
  bidIndex: number;
  forceBurn: boolean;
  tricksTaken: number[];
  currentTrick: {
    leadSeat: number;
    plays: { seat: number; card: Card }[];
  } | null;
  /** seat to play next (when phase === playing) */
  turnSeat: number | null;
  tricksPlayed: number;
  lastTrick: {
    plays: { seat: number; card: Card }[];
    winnerSeat: number;
    leadSuit: Suit;
  } | null;
  playerCount: number;
};

export function emptyLobbyState(): EngineState {
  return {
    phase: 'lobby',
    roundNumber: 0,
    handSize: 0,
    dealerSeat: 0,
    trumpSuit: null,
    trumpCard: null,
    hands: [],
    bids: [],
    bidOrder: [],
    bidIndex: 0,
    forceBurn: false,
    tricksTaken: [],
    currentTrick: null,
    turnSeat: null,
    tricksPlayed: 0,
    lastTrick: null,
    playerCount: 0,
  };
}

export function dealRound(args: {
  playerCount: number;
  roundNumber: number;
  handSize: number;
  dealerSeat: number;
  bidOrder: number[];
}): EngineState {
  const { playerCount, roundNumber, handSize, dealerSeat, bidOrder } = args;
  const deck = shuffle(makeDeck());
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let cursor = 0;
  for (let c = 0; c < handSize; c++) {
    for (let s = 0; s < playerCount; s++) {
      const seat = (dealerSeat + 1 + s) % playerCount;
      hands[seat]!.push(deck[cursor++]!);
    }
  }
  for (let s = 0; s < playerCount; s++) {
    hands[s] = sortHand(hands[s]!);
  }
  const trumpCard = deck[cursor] ?? null;
  const trumpSuit = trumpCard?.s ?? null;

  return {
    phase: 'bidding',
    roundNumber,
    handSize,
    dealerSeat,
    trumpSuit,
    trumpCard,
    hands,
    bids: Array.from({ length: playerCount }, () => null),
    bidOrder: [...bidOrder],
    bidIndex: 0,
    forceBurn: false,
    tricksTaken: Array.from({ length: playerCount }, () => 0),
    currentTrick: null,
    turnSeat: null,
    tricksPlayed: 0,
    lastTrick: null,
    playerCount,
  };
}

export function currentBidderSeat(state: EngineState): number | null {
  if (state.phase !== 'bidding') return null;
  return state.bidOrder[state.bidIndex] ?? null;
}

export function placeBid(
  state: EngineState,
  seat: number,
  bid: number,
  forceBurn: boolean,
  forbiddenLast: number | null,
): EngineState {
  if (state.phase !== 'bidding') {
    throw new Error('Not in bidding phase');
  }
  const expected = currentBidderSeat(state);
  if (expected !== seat) {
    throw new Error('Not your turn to bid');
  }
  if (!Number.isInteger(bid) || bid < 0 || bid > state.handSize) {
    throw new Error(`Bid must be 0–${state.handSize}`);
  }
  const isLast = state.bidIndex === state.bidOrder.length - 1;
  if (isLast && forbiddenLast !== null && bid === forbiddenLast) {
    throw new Error(
      `Can't bid ${forbiddenLast} — total would equal hand size`,
    );
  }

  const bids = [...state.bids];
  bids[seat] = bid;
  const nextIndex = state.bidIndex + 1;
  const done = nextIndex >= state.bidOrder.length;

  if (!done) {
    return {
      ...state,
      bids,
      bidIndex: nextIndex,
      forceBurn: state.forceBurn,
    };
  }

  // All bids in — start first trick, lead left of dealer
  const leadSeat = (state.dealerSeat + 1) % state.playerCount;
  return {
    ...state,
    phase: 'playing',
    bids,
    bidIndex: nextIndex,
    forceBurn: forceBurn && forbiddenLast !== null,
    currentTrick: { leadSeat, plays: [] },
    turnSeat: leadSeat,
    lastTrick: null,
  };
}

export function playCard(
  state: EngineState,
  seat: number,
  card: Card,
): EngineState {
  if (state.phase !== 'playing') {
    throw new Error('Not in playing phase');
  }
  if (state.turnSeat !== seat) {
    throw new Error('Not your turn');
  }
  if (!state.currentTrick || !state.trumpSuit) {
    throw new Error('No active trick');
  }

  const hand = state.hands[seat] ?? [];
  if (!hand.some((c) => cardsEqual(c, card))) {
    throw new Error('Card not in hand');
  }

  const leadSuit =
    state.currentTrick.plays.length === 0
      ? null
      : state.currentTrick.plays[0]!.card.s;
  const legal = legalPlays(hand, leadSuit);
  if (!legal.some((c) => cardsEqual(c, card))) {
    throw new Error('Must follow suit');
  }

  const hands = state.hands.map((h, i) =>
    i === seat ? removeCard(h, card) : h,
  );
  const plays = [...state.currentTrick.plays, { seat, card }];
  const n = state.playerCount;

  if (plays.length < n) {
    const nextSeat = (seat + 1) % n;
    return {
      ...state,
      hands,
      currentTrick: { leadSeat: state.currentTrick.leadSeat, plays },
      turnSeat: nextSeat,
      lastTrick: null,
    };
  }

  // Trick complete
  const resolvedLead = plays[0]!.card.s;
  const winnerSeat = winnerOfTrick(plays, resolvedLead, state.trumpSuit);
  const tricksTaken = [...state.tricksTaken];
  tricksTaken[winnerSeat] = (tricksTaken[winnerSeat] ?? 0) + 1;
  const tricksPlayed = state.tricksPlayed + 1;

  if (tricksPlayed >= state.handSize) {
    return {
      ...state,
      hands,
      tricksTaken,
      tricksPlayed,
      currentTrick: null,
      turnSeat: null,
      lastTrick: {
        plays,
        winnerSeat,
        leadSuit: resolvedLead,
      },
      phase: 'trick_reveal', // service will finalize round immediately after
    };
  }

  return {
    ...state,
    hands,
    tricksTaken,
    tricksPlayed,
    currentTrick: { leadSeat: winnerSeat, plays: [] },
    turnSeat: winnerSeat,
    lastTrick: {
      plays,
      winnerSeat,
      leadSuit: resolvedLead,
    },
  };
}

/** Public cards currently on the table (current trick or last completed). */
export function tablePlays(state: EngineState): {
  plays: { seat: number; card: Card }[];
  leadSuit: Suit | null;
  winnerSeat: number | null;
  complete: boolean;
} {
  if (state.currentTrick && state.currentTrick.plays.length > 0) {
    return {
      plays: state.currentTrick.plays,
      leadSuit: state.currentTrick.plays[0]!.card.s,
      winnerSeat: null,
      complete: false,
    };
  }
  if (state.lastTrick) {
    return {
      plays: state.lastTrick.plays,
      leadSuit: state.lastTrick.leadSuit,
      winnerSeat: state.lastTrick.winnerSeat,
      complete: true,
    };
  }
  return { plays: [], leadSuit: null, winnerSeat: null, complete: false };
}

export type ScorecardSeat = { id: string; seatIndex: number };

export type ScorecardTrickPlay = {
  playOrder: number;
  seatIndex: number;
  cardSuit: string;
  cardRank: string;
};

export type ScorecardTrick = {
  trickIndex: number;
  leadSeat: number;
  leadSuit: string;
  winnerSeat: number;
  plays: ScorecardTrickPlay[];
};

export type ScorecardEntry = {
  playerId: string;
  bid: number | null;
  dealtHand: unknown;
};

export type ScorecardRound = {
  number: number;
  handSize: number;
  dealerSeat: number;
  forceBurn: boolean;
  trumpSuit: string | null;
  trumpCard: unknown;
  currentTrick: unknown;
  bidOrderSeats: unknown;
  completedAt: Date | null;
  dealtAt: Date | null;
  entries: ScorecardEntry[];
  tricks: ScorecardTrick[];
};

export function roundHasDeal(round: ScorecardRound): boolean {
  if (round.dealtAt) return true;
  return round.entries.some((e) => {
    const hand = parseCardList(e.dealtHand);
    return hand != null && hand.length > 0;
  });
}

export function engineFromScorecard(args: {
  sessionStatus: 'LOBBY' | 'PLAYING' | 'COMPLETED';
  players: ScorecardSeat[];
  rounds: ScorecardRound[];
}): EngineState {
  const { sessionStatus, players, rounds } = args;
  const playerCount = players.length;
  if (sessionStatus === 'LOBBY' || playerCount === 0) {
    return emptyLobbyState();
  }

  const current =
    sessionStatus === 'COMPLETED'
      ? [...rounds].reverse().find(roundHasDeal) ?? rounds[rounds.length - 1]
      : rounds.find((r) => r.completedAt == null);

  if (!current || !roundHasDeal(current)) {
    if (sessionStatus === 'COMPLETED') {
      return { ...emptyLobbyState(), phase: 'complete', playerCount };
    }
    return emptyLobbyState();
  }

  const bidOrder = seatOrder(current.bidOrderSeats);
  if (bidOrder.length !== playerCount) {
    throw new BadRequestException('Corrupt live bid order');
  }

  const seatByPlayer = new Map(players.map((p) => [p.id, p.seatIndex] as const));
  const bySeat = new Map(
    current.entries.map((e) => {
      const seat = seatByPlayer.get(e.playerId);
      if (seat == null) {
        throw new BadRequestException('Round entry missing seat');
      }
      return [seat, e] as const;
    }),
  );
  const bids: (number | null)[] = Array.from({ length: playerCount }, (_, seat) => {
    return bySeat.get(seat)?.bid ?? null;
  });
  const openBid = bidOrder.findIndex((seat) => bids[seat] == null);
  const allBidsIn = openBid < 0;

  const played = new Set<string>();
  const sortedTricks = [...current.tricks].sort(
    (a, b) => a.trickIndex - b.trickIndex,
  );
  for (const trick of sortedTricks) {
    for (const p of trick.plays) {
      played.add(`${p.cardRank}${p.cardSuit}`);
    }
  }
  const parsedCurrent = parseCurrentTrick(current.currentTrick);
  if (parsedCurrent) {
    for (const p of parsedCurrent.plays) {
      played.add(cardKey({ s: p.s, r: p.r }));
    }
  }

  const hands: Card[][] = Array.from({ length: playerCount }, (_, seat) => {
    const dealt = parseCardList(bySeat.get(seat)?.dealtHand);
    if (!dealt) {
      throw new BadRequestException('Corrupt dealt hand');
    }
    return dealt.filter((c) => !played.has(cardKey(c)));
  });

  const tricksTaken = Array.from({ length: playerCount }, () => 0);
  for (const trick of sortedTricks) {
    const prev = tricksTaken[trick.winnerSeat];
    if (prev == null) {
      throw new BadRequestException('Corrupt trick winner seat');
    }
    tricksTaken[trick.winnerSeat] = prev + 1;
  }

  const lastRow = sortedTricks[sortedTricks.length - 1];
  const lastTrick: EngineState['lastTrick'] = lastRow
    ? {
        plays: [...lastRow.plays]
          .sort((a, b) => a.playOrder - b.playOrder)
          .map((p) => {
            const card = parseCardJson({ s: p.cardSuit, r: p.cardRank });
            if (!card) {
              throw new BadRequestException('Corrupt trick play');
            }
            return { seat: p.seatIndex, card };
          }),
        winnerSeat: lastRow.winnerSeat,
        leadSuit: lastRow.leadSuit as Suit,
      }
    : null;

  const trumpCard =
    current.trumpCard == null ? null : parseCardJson(current.trumpCard);
  if (current.trumpCard != null && !trumpCard) {
    throw new BadRequestException('Corrupt trump card');
  }
  const trumpSuit = (current.trumpSuit as Suit | null) ?? trumpCard?.s ?? null;

  if (sessionStatus === 'COMPLETED') {
    return {
      phase: 'complete',
      roundNumber: current.number,
      handSize: current.handSize,
      dealerSeat: current.dealerSeat,
      trumpSuit,
      trumpCard,
      hands,
      bids,
      bidOrder,
      bidIndex: bidOrder.length,
      forceBurn: current.forceBurn,
      tricksTaken,
      currentTrick: null,
      turnSeat: null,
      tricksPlayed: sortedTricks.length,
      lastTrick,
      playerCount,
    };
  }

  if (!allBidsIn) {
    return {
      phase: 'bidding',
      roundNumber: current.number,
      handSize: current.handSize,
      dealerSeat: current.dealerSeat,
      trumpSuit,
      trumpCard,
      hands,
      bids,
      bidOrder,
      bidIndex: openBid,
      forceBurn: current.forceBurn,
      tricksTaken,
      currentTrick: null,
      turnSeat: null,
      tricksPlayed: 0,
      lastTrick: null,
      playerCount,
    };
  }

  let currentTrick: EngineState['currentTrick'];
  let turnSeat: number | null;
  if (parsedCurrent && parsedCurrent.plays.length > 0) {
    currentTrick = {
      leadSeat: parsedCurrent.leadSeat,
      plays: enginePlays(parsedCurrent),
    };
    const last = currentTrick.plays[currentTrick.plays.length - 1]!;
    turnSeat = (last.seat + 1) % playerCount;
  } else if (parsedCurrent) {
    currentTrick = { leadSeat: parsedCurrent.leadSeat, plays: [] };
    turnSeat = parsedCurrent.leadSeat;
  } else if (lastTrick) {
    currentTrick = { leadSeat: lastTrick.winnerSeat, plays: [] };
    turnSeat = lastTrick.winnerSeat;
  } else {
    const leadSeat = bidOrder[0]!;
    currentTrick = { leadSeat, plays: [] };
    turnSeat = leadSeat;
  }

  return {
    phase: 'playing',
    roundNumber: current.number,
    handSize: current.handSize,
    dealerSeat: current.dealerSeat,
    trumpSuit,
    trumpCard,
    hands,
    bids,
    bidOrder,
    bidIndex: bidOrder.length,
    forceBurn: current.forceBurn,
    tricksTaken,
    currentTrick,
    turnSeat,
    tricksPlayed: sortedTricks.length,
    lastTrick,
    playerCount,
  };
}

function seatOrder(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === 'number' && Number.isInteger(item)) out.push(item);
  }
  return out;
}
