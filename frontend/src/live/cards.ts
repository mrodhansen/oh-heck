import type { Rank } from '../types/cards';
import type { LiveCard } from './types';

const SUIT_GLYPH: Record<LiveCard['suit'], string> = {
  C: '♣',
  D: '♦',
  H: '♥',
  S: '♠',
};

const RANK_LABEL: Partial<Record<Rank, string>> = {
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

export function suitGlyph(suit: LiveCard['suit']): string {
  return SUIT_GLYPH[suit];
}

export function rankLabel(rank: string): string {
  return (isRankKey(rank) ? RANK_LABEL[rank] : undefined) ?? rank;
}

function isRankKey(rank: string): rank is Rank {
  return rank in RANK_LABEL || /^[2-9]$/.test(rank);
}

export function isRed(suit: LiveCard['suit']): boolean {
  return suit === 'H' || suit === 'D';
}

export function trumpLabel(suit: LiveCard['suit'] | null): string {
  if (!suit) return '—';
  return `${SUIT_GLYPH[suit]}`;
}
