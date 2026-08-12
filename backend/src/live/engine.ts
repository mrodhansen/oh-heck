import { BadRequestException } from '@nestjs/common';
import type { JsonObject } from '../common/json';
import {
  Card,
  RANKS,
  SUITS,
  Suit,
  Rank,
  legalPlays,
  makeDeck,
  removeCard,
  shuffle,
  sortHand,
  winnerOfTrick,
  cardsEqual,
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

const PHASES: readonly LivePhase[] = [
  'lobby',
  'bidding',
  'playing',
  'trick_reveal',
  'complete',
];

function isLivePhase(value: unknown): value is LivePhase {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value);
}

function isSuit(value: unknown): value is Suit {
  return typeof value === 'string' && (SUITS as readonly string[]).includes(value);
}

function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && (RANKS as readonly string[]).includes(value);
}

function parseCardValue(value: unknown): Card | null {
  if (!value || typeof value !== 'object') return null;
  if (!('s' in value) || !('r' in value)) return null;
  if (!isSuit(value.s) || !isRank(value.r)) return null;
  return { s: value.s, r: value.r };
}

function parseCardList(value: unknown): Card[] | null {
  if (!Array.isArray(value)) return null;
  const out: Card[] = [];
  for (const item of value) {
    const card = parseCardValue(item);
    if (!card) return null;
    out.push(card);
  }
  return out;
}

function parseHands(value: unknown): Card[][] | null {
  if (!Array.isArray(value)) return null;
  const out: Card[][] = [];
  for (const hand of value) {
    const cards = parseCardList(hand);
    if (!cards) return null;
    out.push(cards);
  }
  return out;
}

function parseIntList(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isInteger(item)) return null;
    out.push(item);
  }
  return out;
}

function parseNullableIntList(value: unknown): (number | null)[] | null {
  if (!Array.isArray(value)) return null;
  const out: (number | null)[] = [];
  for (const item of value) {
    if (item === null) {
      out.push(null);
      continue;
    }
    if (typeof item !== 'number' || !Number.isInteger(item)) return null;
    out.push(item);
  }
  return out;
}

function parseTrickPlays(
  value: unknown,
): { seat: number; card: Card }[] | null {
  if (!Array.isArray(value)) return null;
  const out: { seat: number; card: Card }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    if (!('seat' in item) || !('card' in item)) return null;
    if (typeof item.seat !== 'number' || !Number.isInteger(item.seat)) return null;
    const card = parseCardValue(item.card);
    if (!card) return null;
    out.push({ seat: item.seat, card });
  }
  return out;
}

export function engineStateToJson(state: EngineState): JsonObject {
  const card = (c: Card): JsonObject => ({ s: c.s, r: c.r });
  const play = (p: { seat: number; card: Card }): JsonObject => ({
    seat: p.seat,
    card: card(p.card),
  });
  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    handSize: state.handSize,
    dealerSeat: state.dealerSeat,
    trumpSuit: state.trumpSuit,
    trumpCard: state.trumpCard ? card(state.trumpCard) : null,
    hands: state.hands.map((hand) => hand.map(card)),
    bids: state.bids,
    bidOrder: state.bidOrder,
    bidIndex: state.bidIndex,
    forceBurn: state.forceBurn,
    tricksTaken: state.tricksTaken,
    currentTrick: state.currentTrick
      ? {
          leadSeat: state.currentTrick.leadSeat,
          plays: state.currentTrick.plays.map(play),
        }
      : null,
    turnSeat: state.turnSeat,
    tricksPlayed: state.tricksPlayed,
    lastTrick: state.lastTrick
      ? {
          plays: state.lastTrick.plays.map(play),
          winnerSeat: state.lastTrick.winnerSeat,
          leadSuit: state.lastTrick.leadSuit,
        }
      : null,
    playerCount: state.playerCount,
  };
}

export function parseEngineState(
  raw: unknown,
  status?: 'LOBBY' | 'PLAYING' | 'COMPLETED',
): EngineState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    if (status && status !== 'LOBBY') {
      throw new BadRequestException('Corrupt live game state');
    }
    return emptyLobbyState();
  }

  const rec = raw as { readonly [key: string]: unknown };
  if (!isLivePhase(rec.phase)) {
    if (status && status !== 'LOBBY') {
      throw new BadRequestException('Corrupt live game state');
    }
    return emptyLobbyState();
  }
  if (status === 'PLAYING' && (rec.phase === 'lobby' || !Array.isArray(rec.hands))) {
    throw new BadRequestException('Corrupt live game state');
  }

  const parsedHands = parseHands(rec.hands);
  const parsedBids = parseNullableIntList(rec.bids);
  const parsedBidOrder = parseIntList(rec.bidOrder);
  const parsedTricksTaken = parseIntList(rec.tricksTaken);
  if (!parsedHands || !parsedBids || !parsedBidOrder || !parsedTricksTaken) {
    if (rec.phase === 'lobby') return emptyLobbyState();
    throw new BadRequestException('Corrupt live game state');
  }

  const trumpCard = rec.trumpCard == null ? null : parseCardValue(rec.trumpCard);
  if (rec.trumpCard != null && !trumpCard) {
    throw new BadRequestException('Corrupt live game state');
  }

  const trumpSuit =
    rec.trumpSuit == null ? null : isSuit(rec.trumpSuit) ? rec.trumpSuit : null;
  if (rec.trumpSuit != null && !trumpSuit) {
    throw new BadRequestException('Corrupt live game state');
  }

  let currentTrick: EngineState['currentTrick'] = null;
  if (rec.currentTrick != null) {
    if (!rec.currentTrick || typeof rec.currentTrick !== 'object') {
      throw new BadRequestException('Corrupt live game state');
    }
    const trick = rec.currentTrick as { readonly [key: string]: unknown };
    const leadSeat = trick.leadSeat;
    const plays = parseTrickPlays(trick.plays);
    if (typeof leadSeat !== 'number' || !Number.isInteger(leadSeat) || !plays) {
      throw new BadRequestException('Corrupt live game state');
    }
    currentTrick = { leadSeat, plays };
  }

  let lastTrick: EngineState['lastTrick'] = null;
  if (rec.lastTrick != null) {
    if (!rec.lastTrick || typeof rec.lastTrick !== 'object') {
      throw new BadRequestException('Corrupt live game state');
    }
    const trick = rec.lastTrick as { readonly [key: string]: unknown };
    const plays = parseTrickPlays(trick.plays);
    const winnerSeat = trick.winnerSeat;
    const leadSuit = trick.leadSuit;
    if (!plays || typeof winnerSeat !== 'number' || !isSuit(leadSuit)) {
      throw new BadRequestException('Corrupt live game state');
    }
    lastTrick = { plays, winnerSeat, leadSuit };
  }

  const roundNumber = rec.roundNumber;
  const handSize = rec.handSize;
  const dealerSeat = rec.dealerSeat;
  const bidIndex = rec.bidIndex;
  const forceBurn = rec.forceBurn;
  const tricksPlayed = rec.tricksPlayed;
  const playerCount = rec.playerCount;
  if (
    typeof roundNumber !== 'number' ||
    typeof handSize !== 'number' ||
    typeof dealerSeat !== 'number' ||
    typeof bidIndex !== 'number' ||
    typeof forceBurn !== 'boolean' ||
    typeof tricksPlayed !== 'number' ||
    typeof playerCount !== 'number'
  ) {
    if (rec.phase === 'lobby') return emptyLobbyState();
    throw new BadRequestException('Corrupt live game state');
  }

  let turnSeat: number | null = null;
  if (rec.turnSeat != null) {
    if (typeof rec.turnSeat !== 'number' || !Number.isInteger(rec.turnSeat)) {
      throw new BadRequestException('Corrupt live game state');
    }
    turnSeat = rec.turnSeat;
  }

  return {
    phase: rec.phase,
    roundNumber,
    handSize,
    dealerSeat,
    trumpSuit,
    trumpCard,
    hands: parsedHands,
    bids: parsedBids,
    bidOrder: parsedBidOrder,
    bidIndex,
    forceBurn,
    tricksTaken: parsedTricksTaken,
    currentTrick,
    turnSeat,
    tricksPlayed,
    lastTrick,
    playerCount,
  };
}
