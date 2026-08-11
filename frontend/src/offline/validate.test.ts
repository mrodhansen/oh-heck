import { describe, expect, it } from 'vitest';
import { createLocalGame, localSetBids, localSetTricks } from './localEngine';
import { assertBids, assertTricks } from './validate';

function fixture() {
  return createLocalGame(['A', 'B', 'C', 'D']);
}

describe('assertBids', () => {
  it('rejects forbidden last bid', () => {
    const g = fixture();
    const order = g.rounds[0].bidOrderPlayerIds;
    const bids = order.map((playerId, i) => ({
      playerId,
      bid: i < 3 ? 2 : 1, // 2+2+2+1 = 7 forbidden last
    }));
    // adjust priors to sum 6
    bids[0].bid = 2;
    bids[1].bid = 2;
    bids[2].bid = 2;
    bids[3].bid = 1;
    expect(() => assertBids(g, 1, bids)).toThrow(/Last bidder cannot bid 1/);
  });

  it('allows last bid when not forbidden', () => {
    const g = fixture();
    const order = g.rounds[0].bidOrderPlayerIds;
    const bids = order.map((playerId, i) => ({
      playerId,
      bid: i === 3 ? 0 : 2,
    }));
    expect(() => assertBids(g, 1, bids)).not.toThrow();
  });

  it('rejects out of range bid', () => {
    const g = fixture();
    const order = g.rounds[0].bidOrderPlayerIds;
    const bids = order.map((playerId) => ({ playerId, bid: 0 }));
    bids[0].bid = 8;
    expect(() => assertBids(g, 1, bids)).toThrow(/Bid must be/);
  });
});

describe('assertTricks', () => {
  it('rejects wrong sum', () => {
    const g = fixture();
    const order = g.rounds[0].bidOrderPlayerIds;
    const bids = order.map((playerId) => ({ playerId, bid: 1 }));
    const withBids = localSetBids(g, 1, bids);
    const tricks = order.map((playerId) => ({ playerId, tricksTaken: 1 }));
    expect(() => assertTricks(withBids, 1, tricks)).toThrow(/sum to 7/);
  });

  it('accepts sum equal hand size', () => {
    const g = fixture();
    const order = g.rounds[0].bidOrderPlayerIds;
    const bids = order.map((playerId) => ({ playerId, bid: 1 }));
    const withBids = localSetBids(g, 1, bids);
    const tricks = [
      { playerId: order[0], tricksTaken: 2 },
      { playerId: order[1], tricksTaken: 2 },
      { playerId: order[2], tricksTaken: 2 },
      { playerId: order[3], tricksTaken: 1 },
    ];
    expect(() => assertTricks(withBids, 1, tricks)).not.toThrow();
  });

  it('localSetTricks requires bids first', () => {
    const g = fixture();
    const order = g.rounds[0].bidOrderPlayerIds;
    const tricks = order.map((playerId) => ({ playerId, tricksTaken: 0 }));
    tricks[0].tricksTaken = 7;
    expect(() => localSetTricks(g, 1, tricks)).toThrow(/bids must be set/);
  });
});
