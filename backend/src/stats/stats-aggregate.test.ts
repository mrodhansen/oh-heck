import { GameStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildStats, type StatsGameSnap } from './stats-aggregate';

function snap(args: {
  id: string;
  seats: Array<{
    id: string;
    name: string;
    userId?: string;
    first?: string;
    last?: string;
    points: number;
  }>;
}): StatsGameSnap {
  return {
    id: args.id,
    name: args.id,
    status: GameStatus.COMPLETED,
    createdAt: new Date('2026-01-01'),
    finishedAt: new Date('2026-01-01'),
    isHighTable: false,
    seats: args.seats.map((s, i) => ({
      seatIndex: i,
      player: {
        id: s.id,
        name: s.name,
        userId: s.userId ?? null,
        user: s.userId
          ? {
              firstName: s.first ?? 'A',
              lastName: s.last ?? 'B',
            }
          : null,
      },
    })),
    rounds: [
      {
        forceBurn: false,
        dealerSeat: 0,
        entries: args.seats.map((s) => ({
          playerId: s.id,
          bid: 1,
          tricksTaken: 1,
          points: s.points,
        })),
      },
    ],
  };
}

const mixedGame = snap({
  id: 'g1',
  seats: [
    {
      id: 'p-abe',
      name: 'Abe',
      userId: 'u-abe',
      first: 'Abraham',
      last: 'Hansen',
      points: 40,
    },
    {
      id: 'p-mart',
      name: 'Martin',
      userId: 'u-mart',
      first: 'Martin',
      last: 'Hansen',
      points: 30,
    },
    { id: 'p-guest', name: 'Charlie', points: 50 },
  ],
});

describe('buildStats users mode', () => {
  it('aggregates claimed accounts only, by user id and display name', () => {
    const stats = buildStats([mixedGame], 'users');
    expect(stats.overview.uniquePlayers).toBe(2);
    expect(stats.players.map((p) => p.name)).toEqual([
      'Abraham Hansen',
      'Martin Hansen',
    ]);
    expect(stats.players.map((p) => p.key)).toEqual([
      'user:u-abe',
      'user:u-mart',
    ]);
    expect(stats.games[0]?.winner).toBe('Charlie');
    expect(stats.overview.leaders.bestSingleGame).toEqual({
      name: 'Abraham Hansen',
      value: 40,
    });
  });

  it('merges the same user across games', () => {
    const g2 = snap({
      id: 'g2',
      seats: [
        {
          id: 'p-abe-other',
          name: 'Abe',
          userId: 'u-abe',
          first: 'Abraham',
          last: 'Hansen',
          points: 20,
        },
        { id: 'p-guest-2', name: 'Dana', points: 10 },
      ],
    });
    const stats = buildStats([mixedGame, g2], 'users');
    const abe = stats.players.find((p) => p.userId === 'u-abe');
    expect(abe?.gamesCompleted).toBe(2);
    expect(abe?.wins).toBe(1);
    expect(stats.overview.uniquePlayers).toBe(2);
  });
});

describe('buildStats players mode', () => {
  it('includes guests and keys by player id with table names', () => {
    const stats = buildStats([mixedGame], 'players');
    expect(stats.overview.uniquePlayers).toBe(3);
    expect(stats.players.map((p) => p.name)).toEqual([
      'Charlie',
      'Abe',
      'Martin',
    ]);
    expect(stats.players.map((p) => p.key)).toEqual([
      'player:p-guest',
      'player:p-abe',
      'player:p-mart',
    ]);
    expect(stats.games[0]?.winner).toBe('Charlie');
    expect(stats.overview.leaders.bestSingleGame).toEqual({
      name: 'Charlie',
      value: 50,
    });
    expect(stats.overview.leaders.mostWins).toEqual({
      name: 'Charlie',
      value: '1',
    });
  });

  it('does not merge two guest rows that share a name', () => {
    const g2 = snap({
      id: 'g2',
      seats: [
        { id: 'p-other-charlie', name: 'Charlie', points: 12 },
        { id: 'p-dana', name: 'Dana', points: 8 },
      ],
    });
    const stats = buildStats([mixedGame, g2], 'players');
    const charlies = stats.players.filter((p) => p.name === 'Charlie');
    expect(charlies).toHaveLength(2);
    expect(charlies.map((p) => p.playerId).sort()).toEqual([
      'p-guest',
      'p-other-charlie',
    ]);
  });
});

describe('isHighTable on game rows', () => {
  const seats = [
    { id: 'p1', name: 'Abe', points: 40 },
    { id: 'p2', name: 'Martin', points: 30 },
  ];

  it('is false by default', () => {
    const stats = buildStats([snap({ id: 'g1', seats })], 'players');
    expect(stats.games[0]?.isHighTable).toBe(false);
  });

  it('is true when the game flag is set', () => {
    const g = snap({ id: 'g1', seats });
    g.isHighTable = true;
    const stats = buildStats([g], 'players');
    expect(stats.games[0]?.isHighTable).toBe(true);
  });

  it('is true when the linked tournament table is a high table', () => {
    const g = snap({ id: 'g1', seats });
    g.tournamentTable = { isHighTable: true };
    const stats = buildStats([g], 'players');
    expect(stats.games[0]?.isHighTable).toBe(true);
  });

  it('is true for Hawaii 2026 high-table titles', () => {
    const g = snap({ id: 'g1', seats });
    g.name = 'Game 4 · Jun 23, 2026';
    const stats = buildStats([g], 'players');
    expect(stats.games[0]?.isHighTable).toBe(true);
  });
});
