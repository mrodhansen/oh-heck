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
