import type { Card, Suit } from '../live/cards';
import { cardKey, winnerOfTrick } from '../live/cards';

export type SuperPlayCard = { playerId: string; s: Card['s']; r: Card['r'] };

export type SuperPlayCurrent = {
  leadSeat: number;
  plays: {
    playOrder: number;
    seatIndex: number;
    playerId: string;
    s: Card['s'];
    r: Card['r'];
    key: string;
    followedSuit: boolean;
    playedTrump: boolean;
  }[];
};

export type SuperPlayHistoryEntry = {
  trickIndex: number;
  leadSeat: number;
  leadSuit: Suit;
  winnerSeat: number;
  winnerPlayerId: string;
  plays: {
    playOrder: number;
    seatIndex: number;
    playerId: string;
    card: { s: Card['s']; r: Card['r']; key: string };
    followedSuit: boolean;
    playedTrump: boolean;
  }[];
};

export type SuperPlayView = {
  trumpCard: Card | null;
  usedKeys: string[];
  completed: SuperPlayHistoryEntry[];
  current: SuperPlayCurrent | null;
  turnSeat: number | null;
  turnPlayerId: string | null;
  tricksTakenByPlayerId: { [playerId: string]: number };
  tricksTakenBySeat: number[];
  roundComplete: boolean;
};

const SUITS: Card['s'][] = ['C', 'D', 'H', 'S'];
const RANKS: Card['r'][] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
];

function isSuit(v: string): v is Card['s'] {
  return (SUITS as string[]).includes(v);
}

function isRank(v: string): v is Card['r'] {
  return (RANKS as string[]).includes(v);
}

export function hasTrumpCard(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const c = value as { s?: unknown; r?: unknown };
  return isSuit(String(c.s ?? '')) && isRank(String(c.r ?? ''));
}

export function parseCard(s: unknown, r: unknown): Card {
  if (typeof s !== 'string' || typeof r !== 'string' || !isSuit(s) || !isRank(r)) {
    throw new Error('Invalid card');
  }
  return { s, r };
}

export function playOrderSeats(leadSeat: number, playerCount: number): number[] {
  const order: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    order.push((leadSeat + i) % playerCount);
  }
  return order;
}

function playerAtSeat(
  players: { id: string; seatIndex: number }[],
  seat: number,
): { id: string; seatIndex: number } {
  const p = players.find((x) => x.seatIndex === seat);
  if (!p) {
    throw new Error(`No player at seat ${seat}`);
  }
  return p;
}

export function buildSuperPlay(input: {
  playerCount: number;
  firstLeadSeat: number;
  handSize: number;
  players: { id: string; seatIndex: number }[];
  trumpCard: Card | null;
  plays: SuperPlayCard[];
}): SuperPlayView {
  const { playerCount, firstLeadSeat, handSize, players, trumpCard, plays } =
    input;
  if (playerCount < 2 || playerCount > 7) {
    throw new Error('Need 2–7 players');
  }
  if (players.length !== playerCount) {
    throw new Error('Player list does not match playerCount');
  }
  if (handSize < 1 || handSize > 7) {
    throw new Error('Invalid hand size');
  }
  if (firstLeadSeat < 0 || firstLeadSeat >= playerCount) {
    throw new Error('Invalid lead seat');
  }

  const maxPlays = handSize * playerCount;
  if (plays.length > maxPlays) {
    throw new Error('Too many plays for this round');
  }

  const used = new Set<string>();
  if (trumpCard) {
    used.add(cardKey(trumpCard));
  }

  const tricksTakenBySeat = Array.from({ length: playerCount }, () => 0);
  const completed: SuperPlayHistoryEntry[] = [];
  let leadSeat = firstLeadSeat;
  let idx = 0;

  while (idx + playerCount <= plays.length) {
    if (!trumpCard) {
      throw new Error('Trump must be set before cards are played');
    }
    const chunk = plays.slice(idx, idx + playerCount);
    const order = playOrderSeats(leadSeat, playerCount);
    const trickPlays: SuperPlayHistoryEntry['plays'] = [];
    const enginePlays: { seat: number; card: Card }[] = [];
    let leadSuit: Suit | null = null;

    for (let i = 0; i < playerCount; i++) {
      const expected = playerAtSeat(players, order[i]!);
      const raw = chunk[i]!;
      if (raw.playerId !== expected.id) {
        throw new Error('Play is out of turn');
      }
      const card = parseCard(raw.s, raw.r);
      const key = cardKey(card);
      if (used.has(key)) {
        throw new Error(`${key} was already used this round`);
      }
      used.add(key);
      if (i === 0) leadSuit = card.s;
      trickPlays.push({
        playOrder: i,
        seatIndex: expected.seatIndex,
        playerId: expected.id,
        card: { s: card.s, r: card.r, key },
        followedSuit: card.s === leadSuit,
        playedTrump: card.s === trumpCard.s,
      });
      enginePlays.push({ seat: expected.seatIndex, card });
    }

    if (leadSuit == null) {
      throw new Error('Trick missing lead suit');
    }
    const winnerSeat = winnerOfTrick(enginePlays, leadSuit, trumpCard.s);
    const winner = playerAtSeat(players, winnerSeat);
    tricksTakenBySeat[winnerSeat] += 1;
    completed.push({
      trickIndex: completed.length,
      leadSeat,
      leadSuit,
      winnerSeat,
      winnerPlayerId: winner.id,
      plays: trickPlays,
    });
    leadSeat = winnerSeat;
    idx += playerCount;
  }

  const remainder = plays.slice(idx);
  let current: SuperPlayCurrent | null = null;
  let turnSeat: number | null = null;

  if (remainder.length > 0) {
    if (!trumpCard) {
      throw new Error('Trump must be set before cards are played');
    }
    if (completed.length >= handSize) {
      throw new Error('Round already has all tricks');
    }
    const order = playOrderSeats(leadSeat, playerCount);
    const curPlays: SuperPlayCurrent['plays'] = [];
    let leadSuit: Suit | null = null;
    for (let i = 0; i < remainder.length; i++) {
      const expected = playerAtSeat(players, order[i]!);
      const raw = remainder[i]!;
      if (raw.playerId !== expected.id) {
        throw new Error('Play is out of turn');
      }
      const card = parseCard(raw.s, raw.r);
      const key = cardKey(card);
      if (used.has(key)) {
        throw new Error(`${key} was already used this round`);
      }
      used.add(key);
      if (i === 0) leadSuit = card.s;
      curPlays.push({
        playOrder: i,
        seatIndex: expected.seatIndex,
        playerId: expected.id,
        s: card.s,
        r: card.r,
        key,
        followedSuit: leadSuit != null && card.s === leadSuit,
        playedTrump: card.s === trumpCard.s,
      });
    }
    current = { leadSeat, plays: curPlays };
    turnSeat = order[remainder.length] ?? null;
  } else if (completed.length < handSize && trumpCard) {
    current = { leadSeat, plays: [] };
    turnSeat = leadSeat;
  } else if (!trumpCard) {
    turnSeat = null;
    current = null;
  }

  const roundComplete = completed.length === handSize && remainder.length === 0;
  if (roundComplete) {
    current = null;
    turnSeat = null;
  }

  const tricksTakenByPlayerId: { [playerId: string]: number } = {};
  for (const p of players) {
    tricksTakenByPlayerId[p.id] = tricksTakenBySeat[p.seatIndex] ?? 0;
  }

  return {
    trumpCard,
    usedKeys: [...used],
    completed,
    current,
    turnSeat,
    turnPlayerId: turnSeat == null ? null : playerAtSeat(players, turnSeat).id,
    tricksTakenByPlayerId,
    tricksTakenBySeat,
    roundComplete,
  };
}

export function playsFromRoundState(args: {
  trickHistory: SuperPlayHistoryEntry[] | null | undefined;
  current: SuperPlayCurrent | null | undefined;
}): SuperPlayCard[] {
  const plays: SuperPlayCard[] = [];
  for (const trick of args.trickHistory ?? []) {
    for (const p of trick.plays) {
      plays.push({ playerId: p.playerId, s: p.card.s, r: p.card.r });
    }
  }
  for (const p of args.current?.plays ?? []) {
    plays.push({ playerId: p.playerId, s: p.s, r: p.r });
  }
  return plays;
}
