import { cardKey, type Card, type Rank, type Suit } from '../live/cards';
import { SUITS, RANKS } from '../live/cards';

export type PlayJson = {
  playOrder: number;
  seatIndex: number;
  playerId: string;
  s: Suit;
  r: Rank;
  key: string;
  followedSuit: boolean;
  playedTrump: boolean;
};

export type CurrentTrickJson = {
  leadSeat: number;
  plays: PlayJson[];
};

export type TrickHistoryPlay = {
  playOrder: number;
  seatIndex: number;
  playerId: string;
  card: { s: Suit; r: Rank; key: string };
  followedSuit: boolean;
  playedTrump: boolean;
};

export type TrickHistoryEntry = {
  trickIndex: number;
  leadSeat: number;
  leadSuit: Suit;
  winnerSeat: number;
  winnerPlayerId: string | null;
  plays: TrickHistoryPlay[];
};

function isSuit(v: unknown): v is Suit {
  return typeof v === 'string' && (SUITS as readonly string[]).includes(v);
}

function isRank(v: unknown): v is Rank {
  return typeof v === 'string' && (RANKS as readonly string[]).includes(v);
}

export function parseCardJson(value: unknown): Card | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as { readonly [key: string]: unknown };
  const nested =
    rec.card && typeof rec.card === 'object'
      ? (rec.card as { readonly [key: string]: unknown })
      : rec;
  const s = nested.s;
  const r = nested.r;
  if (!isSuit(s) || !isRank(r)) return null;
  return { s, r };
}

export function parseCardList(value: unknown): Card[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const out: Card[] = [];
  for (const item of value) {
    const card = parseCardJson(item);
    if (!card) return null;
    out.push(card);
  }
  return out;
}

function parsePlay(value: unknown, index: number): PlayJson | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as { readonly [key: string]: unknown };
  const card = parseCardJson(rec);
  if (!card) return null;
  const seat =
    typeof rec.seatIndex === 'number' && Number.isInteger(rec.seatIndex)
      ? rec.seatIndex
      : typeof rec.seat === 'number' && Number.isInteger(rec.seat)
        ? rec.seat
        : null;
  if (seat == null) return null;
  const playOrder =
    typeof rec.playOrder === 'number' && Number.isInteger(rec.playOrder)
      ? rec.playOrder
      : index;
  const playerId = typeof rec.playerId === 'string' ? rec.playerId : '';
  return {
    playOrder,
    seatIndex: seat,
    playerId,
    s: card.s,
    r: card.r,
    key: cardKey(card),
    followedSuit: rec.followedSuit !== false,
    playedTrump: rec.playedTrump === true,
  };
}

export function parseCurrentTrick(value: unknown): CurrentTrickJson | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object') return null;
  const rec = value as { readonly [key: string]: unknown };
  if (typeof rec.leadSeat !== 'number' || !Number.isInteger(rec.leadSeat)) {
    return null;
  }
  if (!Array.isArray(rec.plays)) return null;
  const plays: PlayJson[] = [];
  for (let i = 0; i < rec.plays.length; i++) {
    const play = parsePlay(rec.plays[i], i);
    if (!play) return null;
    plays.push(play);
  }
  return { leadSeat: rec.leadSeat, plays };
}

export function toCurrentTrickJson(args: {
  leadSeat: number;
  plays: { seat: number; card: Card; playerId: string }[];
  trumpSuit: Suit | null;
}): CurrentTrickJson {
  const leadSuit = args.plays[0]?.card.s ?? null;
  return {
    leadSeat: args.leadSeat,
    plays: args.plays.map((p, playOrder) => ({
      playOrder,
      seatIndex: p.seat,
      playerId: p.playerId,
      s: p.card.s,
      r: p.card.r,
      key: cardKey(p.card),
      followedSuit: playOrder === 0 || (leadSuit != null && p.card.s === leadSuit),
      playedTrump: args.trumpSuit != null && p.card.s === args.trumpSuit,
    })),
  };
}

export function enginePlays(
  trick: CurrentTrickJson,
): { seat: number; card: Card }[] {
  return trick.plays.map((p) => ({
    seat: p.seatIndex,
    card: { s: p.s, r: p.r },
  }));
}

export function dealtHandsFromEntries(
  players: { id: string; seatIndex: number }[],
  entries: { playerId: string; dealtHand: unknown }[],
): { bySeat: Card[][]; byPlayerId: { [playerId: string]: Card[] } } | null {
  if (!entries.some((e) => e.dealtHand != null)) return null;
  const bySeat: Card[][] = [];
  const byPlayerId: { [playerId: string]: Card[] } = {};
  for (const p of players) {
    const entry = entries.find((e) => e.playerId === p.id);
    const hand = parseCardList(entry?.dealtHand) ?? [];
    bySeat[p.seatIndex] = hand;
    byPlayerId[p.id] = hand;
  }
  return { bySeat, byPlayerId };
}

export function trickHistoryFromTricks(
  tricks: {
    trickIndex: number;
    leadSeat: number;
    leadSuit: string;
    winnerSeat: number;
    winnerPlayerId: string | null;
    plays: {
      playOrder: number;
      seatIndex: number;
      playerId: string;
      cardSuit: string;
      cardRank: string;
      cardKey: string;
      followedSuit: boolean;
      playedTrump: boolean;
    }[];
  }[],
): TrickHistoryEntry[] {
  return tricks.map((t) => ({
    trickIndex: t.trickIndex,
    leadSeat: t.leadSeat,
    leadSuit: t.leadSuit as Suit,
    winnerSeat: t.winnerSeat,
    winnerPlayerId: t.winnerPlayerId,
    plays: t.plays.map((p) => ({
      playOrder: p.playOrder,
      seatIndex: p.seatIndex,
      playerId: p.playerId,
      card: { s: p.cardSuit as Suit, r: p.cardRank as Rank, key: p.cardKey },
      followedSuit: p.followedSuit,
      playedTrump: p.playedTrump,
    })),
  }));
}

export function cardsPlayedFromTricks(
  playerId: string,
  tricks: {
    trickIndex: number;
    plays: {
      playOrder: number;
      playerId: string;
      cardSuit: string;
      cardRank: string;
      cardKey: string;
    }[];
  }[],
  current: CurrentTrickJson | null,
): {
  trickIndex: number;
  playOrder: number;
  s: Suit;
  r: Rank;
  key: string;
}[] {
  const out: {
    trickIndex: number;
    playOrder: number;
    s: Suit;
    r: Rank;
    key: string;
  }[] = [];
  for (const t of tricks) {
    for (const p of t.plays) {
      if (p.playerId !== playerId) continue;
      out.push({
        trickIndex: t.trickIndex,
        playOrder: p.playOrder,
        s: p.cardSuit as Suit,
        r: p.cardRank as Rank,
        key: p.cardKey,
      });
    }
  }
  if (current) {
    for (const p of current.plays) {
      if (p.playerId !== playerId) continue;
      out.push({
        trickIndex: tricks.length,
        playOrder: p.playOrder,
        s: p.s,
        r: p.r,
        key: p.key,
      });
    }
  }
  return out;
}
