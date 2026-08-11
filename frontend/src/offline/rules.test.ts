import { describe, expect, it } from 'vitest';
import {
  bidOrderSeats,
  dealerSeat,
  forbiddenLastBid,
  getHandSize,
  scoreRound,
} from './rules';

describe('scoreRound', () => {
  it.each([
    [0, 0, 5],
    [2, 2, 7],
    [7, 7, 12],
    [1, 2, -1],
    [0, 2, -2],
    [3, 1, -2],
    [5, 0, -5],
    [0, 1, -1],
  ] as const)('bid %i tricks %i → %i', (bid, tricks, pts) => {
    expect(scoreRound(bid, tricks)).toBe(pts);
  });
});

describe('forbiddenLastBid', () => {
  it.each([
    [6, 7, 1],
    [0, 7, 7],
    [7, 7, 0],
    [8, 7, null],
    [3, 1, null],
    [0, 1, 1],
    [2, 2, 0],
  ] as const)('prior %i hand %i → %s', (prior, hand, expected) => {
    expect(forbiddenLastBid(prior, hand)).toBe(expected);
  });
});

describe('hand sizes', () => {
  it('is 7→1→7 over 13 rounds', () => {
    const sizes = Array.from({ length: 13 }, (_, i) => getHandSize(i + 1));
    expect(sizes).toEqual([7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('throws on out-of-range round', () => {
    expect(() => getHandSize(0)).toThrow(/Invalid round/);
    expect(() => getHandSize(14)).toThrow(/Invalid round/);
  });
});

describe('dealerSeat / bidOrderSeats', () => {
  it('round 1 dealer is last seat; bids left-of-dealer first', () => {
    expect(dealerSeat(1, 4)).toBe(3);
    expect(bidOrderSeats(1, 4)).toEqual([0, 1, 2, 3]);
  });

  it('rotates dealer forward', () => {
    expect(dealerSeat(2, 4)).toBe(0);
    expect(bidOrderSeats(2, 4)).toEqual([1, 2, 3, 0]);
    expect(dealerSeat(3, 4)).toBe(1);
    expect(bidOrderSeats(3, 4)).toEqual([2, 3, 0, 1]);
  });

  it('two players', () => {
    expect(dealerSeat(1, 2)).toBe(1);
    expect(bidOrderSeats(1, 2)).toEqual([0, 1]);
    expect(dealerSeat(2, 2)).toBe(0);
    expect(bidOrderSeats(2, 2)).toEqual([1, 0]);
  });
});
