/** Commit the open player and fill skipped seats with 0. Never overwrite an existing value. */

export function fillSkippedZeros(
  order: string[],
  locked: Record<string, number>,
  currentId: string,
): Record<string, number> {
  const currentIdx = order.indexOf(currentId);
  if (currentIdx < 0) {
    throw new Error('Current player is not in order');
  }
  const next: Record<string, number> = { ...locked };
  for (let i = 0; i < currentIdx; i++) {
    const pid = order[i];
    if (next[pid] === undefined) {
      next[pid] = 0;
    }
  }
  return next;
}

export function applyTurnContinue(
  order: string[],
  locked: Record<string, number>,
  currentId: string,
  currentValue: number,
): { locked: Record<string, number>; nextId: string | null } {
  if (!Number.isInteger(currentValue) || currentValue < 0) {
    throw new Error('Value must be a non-negative integer');
  }
  const next = fillSkippedZeros(order, locked, currentId);
  next[currentId] = currentValue;
  const nextId = order.find((id) => next[id] === undefined) ?? null;
  return { locked: next, nextId };
}

export function allLocked(
  order: string[],
  locked: Record<string, number>,
): boolean {
  return order.every((id) => locked[id] !== undefined);
}

export function requireLockedValue(
  locked: Record<string, number>,
  playerId: string,
): number {
  const value = locked[playerId];
  if (value === undefined) {
    throw new Error(`Missing value for player ${playerId}`);
  }
  return value;
}

export function lastBidBlocked(
  order: string[],
  locked: Record<string, number>,
  handSize: number,
  forbiddenFn: (prior: number, hand: number) => number | null,
): string | null {
  if (order.length === 0) {
    throw new Error('No players');
  }
  if (!allLocked(order, locked)) {
    throw new Error('Not every player has a bid');
  }
  let prior = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const pid = order[i];
    if (pid === undefined) {
      throw new Error('Missing player in bid order');
    }
    prior += requireLockedValue(locked, pid);
  }
  const lastId = order[order.length - 1];
  if (lastId === undefined) {
    throw new Error('Missing last bidder');
  }
  const last = requireLockedValue(locked, lastId);
  const forbidden = forbiddenFn(prior, handSize);
  if (forbidden !== null && last === forbidden) {
    return `Last bid can't be ${forbidden}. Bids aren't allowed to add up to ${handSize}.`;
  }
  return null;
}

export function trickSumBlocked(
  order: string[],
  locked: Record<string, number>,
  handSize: number,
): string | null {
  if (order.length === 0) {
    throw new Error('No players');
  }
  if (!allLocked(order, locked)) {
    throw new Error('Not every player has tricks entered');
  }
  const sum = order.reduce((a, id) => a + requireLockedValue(locked, id), 0);
  if (sum === handSize) return null;
  const delta = Math.abs(handSize - sum);
  if (sum < handSize) {
    return delta === 1
      ? `1 trick still needs to be assigned. This round has ${handSize}.`
      : `${delta} tricks still need to be assigned. This round has ${handSize}.`;
  }
  return delta === 1
    ? `1 extra trick is assigned. This round only has ${handSize}.`
    : `${delta} extra tricks are assigned. This round only has ${handSize}.`;
}
