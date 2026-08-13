import { describe, expect, it } from 'vitest';
import { createLocalGame, localSetBids, localSetSuperPlay } from './localEngine';

describe('localSetSuperPlay', () => {
  it('records trump then cards and auto-scores the round', () => {
    const game = createLocalGame(['Ann', 'Bob'], 'Test', {
      gameId: '11111111-1111-4111-8111-111111111111',
      playerIds: [
        '21111111-1111-4111-8111-111111111111',
        '31111111-1111-4111-8111-111111111111',
      ],
      superScorer: true,
    });
    expect(game.superScorer).toBe(true);
    const a = game.players[0]!.id;
    const b = game.players[1]!.id;
    const afterTrump = localSetSuperPlay(game, 1, { s: 'H', r: '2' }, []);
    expect(afterTrump.rounds[0]!.trumpSuit).toBe('H');
    expect(afterTrump.phase).toBe('bidding');

    const afterBids = localSetBids(afterTrump, 1, [
      { playerId: a, bid: 0 },
      { playerId: b, bid: 2 },
    ]);
    expect(afterBids.rounds[0]!.trumpSuit).toBe('H');
    expect(afterBids.phase).toBe('tricks');

    const afterRound = localSetSuperPlay(afterBids, 1, { s: 'H', r: '2' }, [
      { playerId: a, card: { s: 'S', r: 'A' } },
      { playerId: b, card: { s: 'S', r: '9' } },
      { playerId: a, card: { s: 'D', r: '3' } },
      { playerId: b, card: { s: 'D', r: 'K' } },
      { playerId: b, card: { s: 'C', r: 'A' } },
      { playerId: a, card: { s: 'C', r: '4' } },
      { playerId: b, card: { s: 'S', r: 'K' } },
      { playerId: a, card: { s: 'H', r: '3' } },
      { playerId: a, card: { s: 'C', r: '5' } },
      { playerId: b, card: { s: 'C', r: '6' } },
      { playerId: b, card: { s: 'D', r: 'A' } },
      { playerId: a, card: { s: 'S', r: '2' } },
      { playerId: b, card: { s: 'H', r: '4' } },
      { playerId: a, card: { s: 'C', r: '7' } },
    ]);

    const r1 = afterRound.rounds[0]!;
    expect(r1.complete).toBe(true);
    expect(r1.entries.find((e) => e.playerId === a)?.tricksTaken).toBe(2);
    expect(r1.entries.find((e) => e.playerId === b)?.tricksTaken).toBe(5);
    expect(r1.entries.find((e) => e.playerId === a)?.points).toBe(-2);
    expect(r1.entries.find((e) => e.playerId === b)?.points).toBe(-3);
    expect(afterRound.phase).toBe('bidding');
    expect(afterRound.currentRound).toBe(2);
    expect(afterRound.rounds[1]!.trumpCard ?? null).toBeNull();
    expect(() =>
      localSetBids(afterRound, 2, [
        { playerId: a, bid: 0 },
        { playerId: b, bid: 1 },
      ]),
    ).toThrow(/Trump must be set before bidding/);

    const r2Trump = localSetSuperPlay(afterRound, 2, { s: 'S', r: 'A' }, []);
    expect(r2Trump.rounds[1]!.trumpSuit).toBe('S');
    expect(r2Trump.phase).toBe('bidding');
  });

  it('rejects play on a non-super-scorer game', () => {
    const game = createLocalGame(['Ann', 'Bob']);
    expect(() =>
      localSetSuperPlay(game, 1, { s: 'H', r: '2' }, []),
    ).toThrow(/not in super scorer/);
  });
});
