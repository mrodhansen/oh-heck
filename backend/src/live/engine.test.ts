import { describe, expect, it } from 'vitest';
import { legalPlays, winnerOfTrick } from './cards';
import { dealRound, placeBid, playCard } from './engine';

describe('winnerOfTrick', () => {
  it('highest trump wins over higher lead suit', () => {
    const w = winnerOfTrick(
      [
        { seat: 0, card: { s: 'S', r: 'A' } },
        { seat: 1, card: { s: 'H', r: '2' } },
      ],
      'S',
      'H',
    );
    expect(w).toBe(1);
  });

  it('highest lead suit wins when no trump', () => {
    const w = winnerOfTrick(
      [
        { seat: 0, card: { s: 'S', r: '9' } },
        { seat: 1, card: { s: 'S', r: 'K' } },
        { seat: 2, card: { s: 'D', r: 'A' } },
      ],
      'S',
      'H',
    );
    expect(w).toBe(1);
  });
});

describe('legalPlays', () => {
  const hand = [
    { s: 'H' as const, r: 'A' as const },
    { s: 'S' as const, r: '2' as const },
  ];
  it('must follow suit when holding lead', () => {
    expect(legalPlays(hand, 'S').map((c) => c.s)).toEqual(['S']);
  });
  it('any card when void', () => {
    expect(legalPlays(hand, 'D')).toHaveLength(2);
  });
});

describe('placeBid last restriction', () => {
  it('rejects last bid that equals hand size total', () => {
    let s = dealRound({
      playerCount: 2,
      roundNumber: 1,
      handSize: 3,
      dealerSeat: 1,
      bidOrder: [0, 1],
    });
    s = placeBid(s, 0, 2, false, null);
    expect(() => placeBid(s, 1, 1, false, 1)).toThrow(/Can't bid/);
  });

  it('allows other last bids and starts play', () => {
    let s = dealRound({
      playerCount: 2,
      roundNumber: 1,
      handSize: 3,
      dealerSeat: 1,
      bidOrder: [0, 1],
    });
    s = placeBid(s, 0, 2, false, null);
    s = placeBid(s, 1, 0, false, 1);
    expect(s.phase).toBe('playing');
    expect(s.turnSeat).toBe(0);
  });
});

describe('playCard follow suit', () => {
  it('rejects off-suit when holding lead suit', () => {
    let s = dealRound({
      playerCount: 2,
      roundNumber: 7,
      handSize: 1,
      dealerSeat: 1,
      bidOrder: [0, 1],
    });
    // Force known hands
    s = {
      ...s,
      phase: 'playing',
      bids: [0, 0],
      hands: [
        [{ s: 'H', r: 'A' }],
        [
          { s: 'H', r: 'K' },
          { s: 'S', r: '2' },
        ],
      ],
      handSize: 1,
      currentTrick: { leadSeat: 0, plays: [] },
      turnSeat: 0,
      trumpSuit: 'C',
      trumpCard: { s: 'C', r: '2' },
    };
    // seat 1 has 2 cards but handSize 1 — simplify: seat 0 leads H, seat 1 has H and S
    s = {
      ...s,
      hands: [
        [{ s: 'S', r: 'A' }],
        [
          { s: 'H', r: 'K' },
          { s: 'S', r: '2' },
        ],
      ],
      handSize: 2,
      tricksTaken: [0, 0],
    };
    // Actually for 2 cards hand:
    s = dealRound({
      playerCount: 2,
      roundNumber: 6,
      handSize: 2,
      dealerSeat: 1,
      bidOrder: [0, 1],
    });
    s = {
      ...s,
      phase: 'playing',
      bids: [0, 0],
      hands: [
        [
          { s: 'H', r: 'A' },
          { s: 'D', r: '3' },
        ],
        [
          { s: 'H', r: 'K' },
          { s: 'S', r: '2' },
        ],
      ],
      currentTrick: { leadSeat: 0, plays: [] },
      turnSeat: 0,
      trumpSuit: 'C',
    };
    s = playCard(s, 0, { s: 'H', r: 'A' });
    expect(() => playCard(s, 1, { s: 'S', r: '2' })).toThrow(/follow suit/);
    s = playCard(s, 1, { s: 'H', r: 'K' });
    expect(s.lastTrick?.winnerSeat).toBe(0);
  });
});
