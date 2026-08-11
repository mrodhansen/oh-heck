import type { LiveCard } from './types';

const SUIT_GLYPH: Record<LiveCard['suit'], string> = {
  C: '♣',
  D: '♦',
  H: '♥',
  S: '♠',
};

const RANK_LABEL: Record<string, string> = {
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
  return RANK_LABEL[rank] ?? rank;
}

export function isRed(suit: LiveCard['suit']): boolean {
  return suit === 'H' || suit === 'D';
}

export function trumpLabel(suit: LiveCard['suit'] | null): string {
  if (!suit) return '—';
  return `${SUIT_GLYPH[suit]}`;
}
