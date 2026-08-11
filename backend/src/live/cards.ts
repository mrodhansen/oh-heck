export type Suit = 'C' | 'D' | 'H' | 'S';
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'T'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

export type Card = { s: Suit; r: Rank };

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

export function rankValue(r: Rank): number {
  return RANK_VALUE[r];
}

export function cardKey(c: Card): string {
  return `${c.r}${c.s}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.s === b.s && a.r === b.r;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ s, r });
    }
  }
  return deck;
}

/** Fisher–Yates shuffle (mutates and returns). */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { C: 0, D: 1, H: 2, S: 3 };
  return [...hand].sort((a, b) => {
    if (a.s !== b.s) return suitOrder[a.s] - suitOrder[b.s];
    return rankValue(a.r) - rankValue(b.r);
  });
}

/**
 * Highest trump wins; else highest of lead suit.
 * Off-suit non-trump cannot win.
 */
export function winnerOfTrick(
  plays: { seat: number; card: Card }[],
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

function beats(a: Card, b: Card, leadSuit: Suit, trump: Suit): boolean {
  const aTrump = a.s === trump;
  const bTrump = b.s === trump;
  if (aTrump && !bTrump) return true;
  if (!aTrump && bTrump) return false;
  if (aTrump && bTrump) return rankValue(a.r) > rankValue(b.r);
  // Neither trump
  const aLead = a.s === leadSuit;
  const bLead = b.s === leadSuit;
  if (aLead && !bLead) return true;
  if (!aLead && bLead) return false;
  if (aLead && bLead) return rankValue(a.r) > rankValue(b.r);
  return false;
}

export function hasSuit(hand: Card[], suit: Suit): boolean {
  return hand.some((c) => c.s === suit);
}

export function legalPlays(
  hand: Card[],
  leadSuit: Suit | null,
): Card[] {
  if (leadSuit == null) return [...hand];
  if (!hasSuit(hand, leadSuit)) return [...hand];
  return hand.filter((c) => c.s === leadSuit);
}

export function removeCard(hand: Card[], card: Card): Card[] {
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx < 0) {
    throw new Error('Card not in hand');
  }
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}
