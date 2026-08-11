import { describe, expect, it } from 'vitest';

/** Mirror of backend balanceTableSizes for regression coverage. */
function balanceTableSizes(
  n: number,
  preferredSize = 7,
  minSize = 2,
  maxSize = 7,
): number[] {
  if (n < minSize) throw new Error('too few');
  if (n <= maxSize) return [n];
  const minTables = Math.ceil(n / maxSize);
  const maxTables = Math.floor(n / minSize);
  let best: number[] | null = null;
  let bestScore = -Infinity;
  for (let t = minTables; t <= maxTables; t++) {
    const base = Math.floor(n / t);
    const rem = n % t;
    const hi = base + (rem > 0 ? 1 : 0);
    if (base < minSize || hi > maxSize) continue;
    const sizes = Array.from({ length: t }, (_, i) => base + (i < rem ? 1 : 0));
    sizes.sort((a, b) => b - a);
    const min = sizes[sizes.length - 1]!;
    const max = sizes[0]!;
    const range = max - min;
    const avgDist =
      sizes.reduce((s, x) => s + Math.abs(x - preferredSize), 0) / t;
    const score = min * 1000 - range * 100 - avgDist * 10 - t;
    if (score > bestScore) {
      bestScore = score;
      best = sizes;
    }
  }
  if (!best) throw new Error('no seat');
  return best;
}

describe('balanceTableSizes', () => {
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
});
