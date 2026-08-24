import { describe, expect, it } from 'vitest';
import { forbiddenLastBid } from './rules';
import {
  allLocked,
  applyTurnContinue,
  fillSkippedZeros,
  lastBidBlocked,
  trickSumBlocked,
} from './turnContinue';

const order = ['a', 'b', 'c', 'd'];

describe('fillSkippedZeros', () => {
  it('fills null seats before current with 0', () => {
    expect(fillSkippedZeros(order, {}, 'd')).toEqual({
      a: 0,
      b: 0,
      c: 0,
    });
  });

  it('does not overwrite an existing value, including 0', () => {
    expect(fillSkippedZeros(order, { a: 3, b: 0 }, 'd')).toEqual({
      a: 3,
      b: 0,
      c: 0,
    });
  });

  it('does not fill seats after current', () => {
    expect(fillSkippedZeros(order, {}, 'b')).toEqual({ a: 0 });
  });

  it('is a no-op when current is first', () => {
    expect(fillSkippedZeros(order, { a: 2 }, 'a')).toEqual({ a: 2 });
  });

  it('throws when current is not in order', () => {
    expect(() => fillSkippedZeros(order, {}, 'z')).toThrow(
      /Current player is not in order/,
    );
  });
});

describe('applyTurnContinue', () => {
  it('saves current and skip-fills earlier nulls', () => {
    expect(applyTurnContinue(order, { a: 2 }, 'c', 1)).toEqual({
      locked: { a: 2, b: 0, c: 1 },
      nextId: 'd',
    });
  });

  it('does not override an earlier entered score when skipping', () => {
    expect(applyTurnContinue(order, { a: 3, b: 1 }, 'd', 0)).toEqual({
      locked: { a: 3, b: 1, c: 0, d: 0 },
      nextId: null,
    });
  });

  it('writes current 0 and treats that as complete for a solo remaining seat', () => {
    expect(applyTurnContinue(['a'], {}, 'a', 0)).toEqual({
      locked: { a: 0 },
      nextId: null,
    });
  });

  it('throws on a non-integer value', () => {
    expect(() => applyTurnContinue(order, {}, 'a', 1.5)).toThrow(
      /non-negative integer/,
    );
  });
});

describe('allLocked', () => {
  it('requires every seat, including explicit 0', () => {
    expect(allLocked(['a', 'b'], { a: 0 })).toBe(false);
    expect(allLocked(['a', 'b'], { a: 0, b: 0 })).toBe(true);
  });
});

describe('lastBidBlocked', () => {
  it('returns a message when the last bid is forbidden', () => {
    expect(
      lastBidBlocked(['a', 'b'], { a: 3, b: 2 }, 5, forbiddenLastBid),
    ).toBe("Last bid can't be 2. Bids aren't allowed to add up to 5.");
  });

  it('returns null when the last bid is legal', () => {
    expect(
      lastBidBlocked(['a', 'b'], { a: 3, b: 1 }, 5, forbiddenLastBid),
    ).toBeNull();
  });

  it('throws when a bid is missing', () => {
    expect(() =>
      lastBidBlocked(['a', 'b'], { a: 3 }, 5, forbiddenLastBid),
    ).toThrow(/Not every player has a bid/);
  });
});

describe('trickSumBlocked', () => {
  it('explains a short total', () => {
    expect(trickSumBlocked(['a', 'b'], { a: 1, b: 1 }, 5)).toBe(
      '3 tricks still need to be assigned. This round has 5.',
    );
  });

  it('explains an over total', () => {
    expect(trickSumBlocked(['a', 'b'], { a: 3, b: 3 }, 5)).toBe(
      '1 extra trick is assigned. This round only has 5.',
    );
  });

  it('returns null when the sum matches', () => {
    expect(trickSumBlocked(['a', 'b'], { a: 2, b: 3 }, 5)).toBeNull();
  });

  it('throws when a seat is missing', () => {
    expect(() => trickSumBlocked(['a', 'b'], { a: 2 }, 5)).toThrow(
      /Not every player has tricks entered/,
    );
  });
});
