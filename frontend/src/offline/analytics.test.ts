import { describe, expect, it } from 'vitest';
import {
  computeBidAnalytics,
  computeGameFinishStats,
  computeOutcome,
  cumulativeFieldsForRound,
  entryRoles,
  firstBidderSeat,
  hydrateRoundOrder,
} from './analytics';
import { forbiddenLastBid, scoreRound } from './rules';
import {
  createLocalGame,
  localSetBids,
  localSetTricks,
  localUpdateRound,
} from './localEngine';

const players = [
  { id: 'p0', seatIndex: 0 },
  { id: 'p1', seatIndex: 1 },
  { id: 'p2', seatIndex: 2 },
  { id: 'p3', seatIndex: 3 },
];

describe('computeBidAnalytics', () => {
  it('computes sum, deficit, forbidden, roles, running bids', () => {
    // dealer seat 3 → order 0,1,2,3
    const bids = [
      { playerId: 'p0', bid: 2 },
      { playerId: 'p1', bid: 2 },
      { playerId: 'p2', bid: 2 },
      { playerId: 'p3', bid: 0 },
    ];
    const a = computeBidAnalytics(
      players,
      3,
      7,
      bids,
      forbiddenLastBid,
    );
    expect(a.bidSum).toBe(6);
    expect(a.bidDeficit).toBe(1);
    expect(a.forbiddenLastBid).toBe(1);
    expect(a.order).toEqual([0, 1, 2, 3]);
    expect(a.perPlayer.get('p0')).toMatchObject({
      bidPosition: 0,
      isFirstBidder: true,
      isLastBidder: false,
      isDealer: false,
      runningBidBefore: 0,
      bid: 2,
    });
    expect(a.perPlayer.get('p3')).toMatchObject({
      bidPosition: 3,
      isFirstBidder: false,
      isLastBidder: true,
      isDealer: true,
      runningBidBefore: 6,
      bid: 0,
    });
  });

  it('throws when bid missing', () => {
    expect(() =>
      computeBidAnalytics(
        players,
        3,
        7,
        [{ playerId: 'p0', bid: 1 }],
        forbiddenLastBid,
      ),
    ).toThrow(/Missing bid/);
  });
});

describe('computeOutcome', () => {
  it('scores made and missed bids', () => {
    expect(computeOutcome(2, 2, scoreRound)).toMatchObject({
      made: true,
      trickDelta: 0,
      points: 7,
      isNilBid: false,
      isNilMade: false,
    });
    expect(computeOutcome(0, 0, scoreRound)).toMatchObject({
      made: true,
      points: 5,
      isNilBid: true,
      isNilMade: true,
    });
    expect(computeOutcome(0, 2, scoreRound)).toMatchObject({
      made: false,
      trickDelta: 2,
      absDelta: 2,
      points: -2,
      isNilBid: true,
      isNilMade: false,
    });
  });
});

describe('cumulativeFieldsForRound', () => {
  it('uses competition ranking and leader gap', () => {
    const rounds = [
      {
        number: 1,
        entries: [
          { playerId: 'p0', points: 10 },
          { playerId: 'p1', points: 10 },
          { playerId: 'p2', points: 5 },
          { playerId: 'p3', points: 0 },
        ],
      },
    ];
    const cum = cumulativeFieldsForRound(players, rounds, 1);
    expect(cum.get('p0')).toMatchObject({
      cumulativeScore: 10,
      placeAfterRound: 1,
      scoreBehindLeader: 0,
    });
    expect(cum.get('p1')?.placeAfterRound).toBe(1);
    expect(cum.get('p2')).toMatchObject({
      placeAfterRound: 3,
      scoreBehindLeader: 5,
    });
    expect(cum.get('p3')?.placeAfterRound).toBe(4);
  });
});

describe('computeGameFinishStats', () => {
  it('picks winner by total then seatIndex; null margin for sole player', () => {
    const one = [{ id: 'p0', seatIndex: 0 }];
    const finish = computeGameFinishStats(
      one,
      [{ forceBurn: true, entries: [{ playerId: 'p0', points: 12 }] }],
      '2020-01-01T00:00:00.000Z',
      '2020-01-01T00:01:00.000Z',
    );
    expect(finish.winnerPlayerId).toBe('p0');
    expect(finish.winnerScore).toBe(12);
    expect(finish.runnerUpScore).toBeNull();
    expect(finish.winMargin).toBeNull();
    expect(finish.durationMs).toBe(60_000);
    expect(finish.totalForceBurns).toBe(1);
  });

  it('throws when points missing', () => {
    expect(() =>
      computeGameFinishStats(
        players,
        [{ forceBurn: false, entries: [{ playerId: 'p0', points: 1 }] }],
        '2020-01-01T00:00:00.000Z',
        '2020-01-01T00:01:00.000Z',
      ),
    ).toThrow(/missing points/);
  });

  it('tie-breaks winner by lower seatIndex', () => {
    const finish = computeGameFinishStats(
      players.slice(0, 2),
      [
        {
          forceBurn: false,
          entries: [
            { playerId: 'p0', points: 10 },
            { playerId: 'p1', points: 10 },
          ],
        },
      ],
      '2020-01-01T00:00:00.000Z',
      '2020-01-01T00:00:10.000Z',
    );
    expect(finish.winnerPlayerId).toBe('p0');
    expect(finish.winMargin).toBe(0);
  });
});

describe('firstBidderSeat', () => {
  it('is left of dealer', () => {
    expect(firstBidderSeat(3, 4)).toBe(0);
    expect(firstBidderSeat(0, 4)).toBe(1);
  });
});

describe('entryRoles / hydrateRoundOrder', () => {
  it('throws when seat not in order', () => {
    expect(() => entryRoles(9, 0, [0, 1, 2])).toThrow(/not in bid order/);
  });

  it('throws when dealer seat missing from roster', () => {
    expect(() =>
      hydrateRoundOrder(
        [
          { id: 'a', name: 'A', seatIndex: 0 },
          { id: 'b', name: 'B', seatIndex: 1 },
        ],
        5,
      ),
    ).toThrow(/dealer seat/);
  });

  it('hydrates bid order and roles for legacy cache shape', () => {
    const roster = [
      { id: 'a', name: 'A', seatIndex: 0 },
      { id: 'b', name: 'B', seatIndex: 1 },
      { id: 'c', name: 'C', seatIndex: 2 },
    ];
    const h = hydrateRoundOrder(roster, 2);
    expect(h.bidOrderSeats).toEqual([0, 1, 2]);
    expect(h.bidOrderPlayerIds).toEqual(['a', 'b', 'c']);
    expect(h.dealerPlayerId).toBe('c');
    expect(h.firstBidderPlayerId).toBe('a');
    expect(h.entryRolesByPlayerId.get('c')?.isDealer).toBe(true);
    expect(h.entryRolesByPlayerId.get('a')?.isFirstBidder).toBe(true);
  });
});

describe('multi-round cumulatives', () => {
  it('sums only through the requested round', () => {
    const rounds = [
      {
        number: 1,
        entries: [
          { playerId: 'p0', points: 5 },
          { playerId: 'p1', points: 1 },
          { playerId: 'p2', points: 0 },
          { playerId: 'p3', points: 0 },
        ],
      },
      {
        number: 2,
        entries: [
          { playerId: 'p0', points: 5 },
          { playerId: 'p1', points: 10 },
          { playerId: 'p2', points: 0 },
          { playerId: 'p3', points: 0 },
        ],
      },
    ];
    const after1 = cumulativeFieldsForRound(players, rounds, 1);
    expect(after1.get('p0')?.cumulativeScore).toBe(5);
    expect(after1.get('p0')?.placeAfterRound).toBe(1);
    const after2 = cumulativeFieldsForRound(players, rounds, 2);
    expect(after2.get('p0')?.cumulativeScore).toBe(10);
    expect(after2.get('p1')?.cumulativeScore).toBe(11);
    expect(after2.get('p1')?.placeAfterRound).toBe(1);
    expect(after2.get('p0')?.placeAfterRound).toBe(2);
  });
});

describe('localEngine enrichment', () => {
  it('seeds roles and GAME_CREATED; enriches bids/tricks', () => {
    const game = createLocalGame(['A', 'B', 'C', 'D']);
    expect(game.events[0]?.type).toBe('GAME_CREATED');
    expect(game.playerCount).toBe(4);
    const r1 = game.rounds[0];
    expect(r1.bidOrderSeats).toHaveLength(4);
    expect(r1.entries.filter((e) => e.isDealer)).toHaveLength(1);
    expect(r1.entries.filter((e) => e.isFirstBidder)).toHaveLength(1);

    const order = r1.bidOrderPlayerIds;
    const bids = game.players.map((p) => ({
      playerId: p.id,
      bid: order.indexOf(p.id) === order.length - 1 ? 0 : 1,
    }));
    // ensure legal last bid
    const withBids = localSetBids(game, 1, bids, false);
    const round = withBids.rounds[0];
    expect(round.bidSum).not.toBeNull();
    expect(round.bidsCompletedAt).not.toBeNull();
    expect(round.entries.every((e) => e.bid !== null)).toBe(true);
    expect(round.entries.every((e) => e.points === null)).toBe(true);
    expect(withBids.startedAt).not.toBeNull();
    expect(withBids.events.some((e) => e.type === 'BIDS_SET')).toBe(true);

    const hand = round.handSize;
    let left = hand;
    const trickPayload = order.map((id, i) => {
      const take = i === order.length - 1 ? left : Math.min(1, left);
      left -= take;
      return { playerId: id, tricksTaken: take };
    });
    expect(trickPayload.reduce((s, t) => s + t.tricksTaken, 0)).toBe(hand);

    const withTricks = localSetTricks(withBids, 1, trickPayload);
    const done = withTricks.rounds[0];
    expect(done.complete).toBe(true);
    expect(done.entries.every((e) => e.points !== null)).toBe(true);
    expect(done.entries.every((e) => e.cumulativeScore !== null)).toBe(true);
    expect(withTricks.events.some((e) => e.type === 'TRICKS_SET')).toBe(true);
  });

  it('localUpdateRound reshuffles later cumulatives and bumps edits', () => {
    let g = createLocalGame(['A', 'B']);
    const playRound = (game: typeof g, n: number, aTricks: number) => {
      const round = game.rounds.find((r) => r.number === n)!;
      const bids = round.bidOrderPlayerIds.map((playerId) => ({
        playerId,
        bid: 0,
      }));
      let next = localSetBids(game, n, bids, false);
      const byName = (name: string, taken: number) => {
        const id = next.players.find((p) => p.name === name)!.id;
        return { playerId: id, tricksTaken: taken };
      };
      const hand = round.handSize;
      const tA = Math.min(aTricks, hand);
      const tB = hand - tA;
      next = localSetTricks(next, n, [byName('A', tA), byName('B', tB)]);
      return next;
    };

    g = playRound(g, 1, 1); // A takes 1 (miss nil → -1), B rest
    g = playRound(g, 2, 0); // A makes nil (+5)
    const aId = g.players.find((p) => p.name === 'A')!.id;
    const bId = g.players.find((p) => p.name === 'B')!.id;
    const r2Before = g.rounds[1].entries.find((e) => e.playerId === aId)!;
    // R1 A: bid0 got1 → -1; R2 A: bid0 got0 → +5; cum = 4
    expect(r2Before.cumulativeScore).toBe(4);

    const r1 = g.rounds[0];
    const hand = r1.handSize;
    const edited = localUpdateRound(
      g,
      1,
      [
        { playerId: aId, bid: 0 },
        { playerId: bId, bid: 0 },
      ],
      [
        { playerId: aId, tricksTaken: 0 },
        { playerId: bId, tricksTaken: hand },
      ],
      false,
    );
    expect(edited.totalEdits).toBe(1);
    expect(edited.rounds[0].editCount).toBe(1);
    const r1A = edited.rounds[0].entries.find((e) => e.playerId === aId)!;
    expect(r1A.points).toBe(5); // made nil
    const r2After = edited.rounds[1].entries.find((e) => e.playerId === aId)!;
    // R1 +5 + R2 +5 = 10 — proves later-round cascade
    expect(r2After.cumulativeScore).toBe(10);
    expect(r2After.cumulativeScore).not.toBe(r2Before.cumulativeScore);
  });

  it('rejects tricks on completed game and wires finish stats', () => {
    let g = createLocalGame(['A', 'B']);
    for (let n = 1; n <= 13; n++) {
      const round = g.rounds.find((r) => r.number === n)!;
      const order = round.bidOrderPlayerIds;
      const bids = order.map((id) => ({ playerId: id, bid: 0 }));
      g = localSetBids(g, n, bids, n === 1);
      let left = round.handSize;
      const tricks = order.map((id, i) => {
        const take = i === order.length - 1 ? left : 0;
        left -= take;
        return { playerId: id, tricksTaken: take };
      });
      g = localSetTricks(g, n, tricks);
    }
    expect(g.phase).toBe('completed');
    expect(g.winnerPlayerId).not.toBeNull();
    expect(g.winnerScore).not.toBeNull();
    expect(g.runnerUpScore).not.toBeNull();
    expect(g.winMargin).not.toBeNull();
    expect(g.durationMs).not.toBeNull();
    expect(g.durationMs!).toBeGreaterThanOrEqual(0);
    expect(g.finishedAt).not.toBeNull();
    expect(g.totalForceBurns).toBe(1);
    expect(() =>
      localSetTricks(g, 1, g.players.map((p) => ({ playerId: p.id, tricksTaken: 0 }))),
    ).toThrow(/completed/i);
  });
});
