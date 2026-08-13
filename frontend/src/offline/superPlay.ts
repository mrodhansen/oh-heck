import type { CardJson, Rank, Suit, TrickHistoryEntry } from '../types/cards';

export const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
export const RANKS: Rank[] = [
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

const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export type SuperPlayCard = { playerId: string; s: Suit; r: Rank };

export type SuperPlayCurrent = {
  leadSeat: number;
  plays: {
    playOrder: number;
    seatIndex: number;
    playerId: string;
    s: Suit;
    r: Rank;
    key: string;
    followedSuit: boolean;
    playedTrump: boolean;
  }[];
};

export type SuperPlayView = {
  trumpCard: CardJson | null;
  usedKeys: string[];
  completed: TrickHistoryEntry[];
  current: SuperPlayCurrent | null;
  turnSeat: number | null;
  turnPlayerId: string | null;
  tricksTakenByPlayerId: { [playerId: string]: number };
  tricksTakenBySeat: number[];
  roundComplete: boolean;
};

export function cardKey(c: { s: Suit; r: Rank }): string {
  return `${c.r}${c.s}`;
}

export function hasTrumpCard(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const c = value as { s?: unknown; r?: unknown };
  return isSuit(String(c.s ?? '')) && isRank(String(c.r ?? ''));
}

export function isSuit(v: string): v is Suit {
  return v === 'C' || v === 'D' || v === 'H' || v === 'S';
}

export function isRank(v: string): v is Rank {
  return (RANKS as string[]).includes(v);
}

export function parseCard(s: unknown, r: unknown): CardJson {
  if (typeof s !== 'string' || typeof r !== 'string' || !isSuit(s) || !isRank(r)) {
    throw new Error('Invalid card');
  }
  return { s, r };
}

function rankValue(r: Rank): number {
  return RANK_VALUE[r];
}

function beats(a: CardJson, b: CardJson, leadSuit: Suit, trump: Suit): boolean {
  const aTrump = a.s === trump;
  const bTrump = b.s === trump;
  if (aTrump && !bTrump) return true;
  if (!aTrump && bTrump) return false;
  if (aTrump && bTrump) return rankValue(a.r) > rankValue(b.r);
  const aLead = a.s === leadSuit;
  const bLead = b.s === leadSuit;
  if (aLead && !bLead) return true;
  if (!aLead && bLead) return false;
  if (aLead && bLead) return rankValue(a.r) > rankValue(b.r);
  return false;
}

export function winnerOfTrick(
  plays: { seat: number; card: CardJson }[],
  leadSuit: Suit,
  trump: Suit,
): number {
  if (plays.length === 0) {
    throw new Error('Empty trick');
  }
  let best = plays[0]!;
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]!;
    if (beats(p.card, best.card, leadSuit, trump)) {
      best = p;
    }
  }
  return best.seat;
}

export function nextSeat(seat: number, playerCount: number): number {
  if (playerCount < 2) {
    throw new Error('Need at least 2 players');
  }
  return (seat + 1) % playerCount;
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

/**
 * Replay recorded plays. Throws if order, uniqueness, or card identity is wrong.
 * Does not enforce follow-suit (hands are unknown in scorekeeper mode).
 */
export function buildSuperPlay(input: {
  playerCount: number;
  firstLeadSeat: number;
  handSize: number;
  players: { id: string; seatIndex: number }[];
  trumpCard: CardJson | null;
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
  const completed: TrickHistoryEntry[] = [];
  let leadSeat = firstLeadSeat;
  let idx = 0;

  while (idx + playerCount <= plays.length) {
    if (!trumpCard) {
      throw new Error('Trump must be set before cards are played');
    }
    const chunk = plays.slice(idx, idx + playerCount);
    const order = playOrderSeats(leadSeat, playerCount);
    const trickPlays: {
      playOrder: number;
      seatIndex: number;
      playerId: string;
      card: { s: Suit; r: Rank; key: string };
      followedSuit: boolean;
      playedTrump: boolean;
    }[] = [];
    const enginePlays: { seat: number; card: CardJson }[] = [];
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
      const followedSuit = card.s === leadSuit;
      trickPlays.push({
        playOrder: i,
        seatIndex: expected.seatIndex,
        playerId: expected.id,
        card: { s: card.s, r: card.r, key },
        followedSuit,
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

export function appendPlay(
  input: Parameters<typeof buildSuperPlay>[0],
  play: SuperPlayCard,
): SuperPlayView {
  return buildSuperPlay({ ...input, plays: [...input.plays, play] });
}

export function playsFromRound(round: {
  trickHistory?: TrickHistoryEntry[] | null;
  currentTrick?: SuperPlayCurrent | null;
}): SuperPlayCard[] {
  const plays: SuperPlayCard[] = [];
  for (const trick of round.trickHistory ?? []) {
    for (const p of trick.plays) {
      plays.push({ playerId: p.playerId, s: p.card.s, r: p.card.r });
    }
  }
  for (const p of round.currentTrick?.plays ?? []) {
    plays.push({ playerId: p.playerId, s: p.s, r: p.r });
  }
  return plays;
}

export function popPlay(
  input: Parameters<typeof buildSuperPlay>[0],
): { next: SuperPlayView; popped: SuperPlayCard | null; trumpCleared: boolean } {
  if (input.plays.length > 0) {
    const plays = input.plays.slice(0, -1);
    return {
      next: buildSuperPlay({ ...input, plays }),
      popped: input.plays[input.plays.length - 1] ?? null,
      trumpCleared: false,
    };
  }
  if (input.trumpCard) {
    return {
      next: buildSuperPlay({ ...input, trumpCard: null, plays: [] }),
      popped: null,
      trumpCleared: true,
    };
  }
  throw new Error('Nothing to undo');
}
