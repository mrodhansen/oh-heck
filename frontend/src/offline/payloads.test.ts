import { describe, expect, it } from 'vitest';
import { buildBidPayload, buildTrickPayload } from './payloads';

const players = [
  { id: 'a', name: 'Ann' },
  { id: 'b', name: 'Bob' },
];

describe('buildBidPayload', () => {
  it('maps full locked map', () => {
    expect(buildBidPayload(players, { a: 1, b: 2 })).toEqual([
      { playerId: 'a', bid: 1 },
      { playerId: 'b', bid: 2 },
    ]);
  });

  it('throws when a player is missing (no silent 0)', () => {
    expect(() => buildBidPayload(players, { a: 1 })).toThrow(/Missing bid for Bob/);
  });

  it('allows bid 0 (not treated as missing)', () => {
    expect(buildBidPayload(players, { a: 0, b: 0 })).toEqual([
      { playerId: 'a', bid: 0 },
      { playerId: 'b', bid: 0 },
    ]);
  });
});

describe('buildTrickPayload', () => {
  it('maps full locked map', () => {
    expect(buildTrickPayload(['a', 'b'], { a: 0, b: 3 })).toEqual([
      { playerId: 'a', tricksTaken: 0 },
      { playerId: 'b', tricksTaken: 3 },
    ]);
  });

  it('throws when a player is missing', () => {
    expect(() => buildTrickPayload(['a', 'b'], { a: 1 })).toThrow(/Missing tricks/);
  });
});
