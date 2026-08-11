import { describe, expect, it } from 'vitest';
import {
  balanceTableSizes,
  rotateDealerLast,
} from '../../backend/src/tournaments/table-balance';

describe('balanceTableSizes (shared BE source)', () => {
  it('single table when n <= 7', () => {
    expect(balanceTableSizes(5)).toEqual([5]);
  });

  it('does not leave a tiny leftover table', () => {
    const sizes = balanceTableSizes(23);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(23);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(5);
  });

  it('balances 26 near sevens', () => {
    expect(balanceTableSizes(26)).toEqual([7, 7, 6, 6]);
  });

  it('throws when too few players', () => {
    expect(() => balanceTableSizes(1)).toThrow(/at least/);
  });

  it('throws when seating is impossible for bounds', () => {
    expect(() => balanceTableSizes(10, 7, 6, 7)).toThrow(/Cannot seat/);
  });

  it('sums to n for several sizes', () => {
    for (const n of [2, 8, 14, 21, 35, 49]) {
      const sizes = balanceTableSizes(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(7);
    }
  });
});

describe('rotateDealerLast', () => {
  it('puts dealer last', () => {
    expect(rotateDealerLast(['a', 'b', 'c', 'd'], 1)).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
  });

  it('empty safe', () => {
    expect(rotateDealerLast([], 0)).toEqual([]);
  });
});
