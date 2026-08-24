import { describe, expect, it } from 'vitest';
import { paginate } from './statsPaginate';

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5];

  it('returns the requested page', () => {
    expect(paginate(items, 2, 2)).toEqual({
      page: 2,
      pages: 3,
      items: [3, 4],
      from: 3,
      to: 4,
      total: 5,
    });
  });

  it('clamps a page past the end', () => {
    expect(paginate(items, 9, 2).page).toBe(3);
    expect(paginate(items, 9, 2).items).toEqual([5]);
  });

  it('clamps a page below 1', () => {
    expect(paginate(items, 0, 2).page).toBe(1);
    expect(paginate(items, 0, 2).items).toEqual([1, 2]);
  });

  it('handles an empty list', () => {
    expect(paginate([], 1, 10)).toEqual({
      page: 1,
      pages: 1,
      items: [],
      from: 0,
      to: 0,
      total: 0,
    });
  });

  it('throws on a bad page size', () => {
    expect(() => paginate(items, 1, 0)).toThrow(/positive integer/);
  });
});
