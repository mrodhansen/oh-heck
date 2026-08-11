const HAND_SIZES = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7] as const;
export const TOTAL_ROUNDS = 13;

export function getHandSize(roundNumber: number): number {
  return HAND_SIZES[roundNumber - 1];
}

export function dealerSeat(roundNumber: number, playerCount: number): number {
  return (playerCount - 1 + roundNumber - 1) % playerCount;
}

export function bidOrderSeats(
  roundNumber: number,
  playerCount: number,
): number[] {
  const dealer = dealerSeat(roundNumber, playerCount);
  const order: number[] = [];
  for (let i = 1; i <= playerCount; i++) {
    order.push((dealer + i) % playerCount);
  }
  return order;
}

export function forbiddenLastBid(
  priorBidsSum: number,
  handSize: number,
): number | null {
  const forbidden = handSize - priorBidsSum;
  if (forbidden < 0 || forbidden > handSize) return null;
  return forbidden;
}

export function scoreRound(bid: number, tricksTaken: number): number {
  if (bid === tricksTaken) return 5 + tricksTaken;
  return -Math.abs(bid - tricksTaken);
}

export function newId(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback for older mobile browsers / non-secure contexts (HTTP LAN)
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
