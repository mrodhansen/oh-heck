/**
 * Split n players into table sizes in [minSize, maxSize], preferring sizes
 * near preferredSize without greedy leftovers (no 7-7-7-2).
 */
export function balanceTableSizes(
  n: number,
  preferredSize = 7,
  minSize = 2,
  maxSize = 7,
): number[] {
  if (n < minSize) {
    throw new Error(`Need at least ${minSize} players to form tables`);
  }
  if (n <= maxSize) {
    return [n];
  }

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
    // Prefer: higher minimum size, lower spread, closer to preferred, fewer tables
    const score = min * 1000 - range * 100 - avgDist * 10 - t;

    if (score > bestScore) {
      bestScore = score;
      best = sizes;
    }
  }

  if (!best) {
    throw new Error(
      `Cannot seat ${n} players into tables of ${minSize}–${maxSize}`,
    );
  }
  return best;
}

export function shuffleInPlace<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Rotate so dealerIndex becomes last seat (round-1 dealer convention). */
export function rotateDealerLast<T>(items: T[], dealerIndex: number): T[] {
  if (items.length === 0) return [];
  const d = ((dealerIndex % items.length) + items.length) % items.length;
  return [...items.slice(d + 1), ...items.slice(0, d + 1)];
}
