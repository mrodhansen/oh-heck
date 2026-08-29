import { describe, expect, it } from 'vitest';
import type { StatsGame } from '../api';
import { filterStatsGames, gameListDateKey } from './statsGamesFilter';

function game(partial: Partial<StatsGame> & Pick<StatsGame, 'id'>): StatsGame {
  return {
    name: 'Friday kitchen table',
    status: 'COMPLETED',
    createdAt: '2026-08-12T21:00:00.000Z',
    finishedAt: '2026-08-12T22:00:00.000Z',
    playerCount: 2,
    players: ['demo', 'Mom'],
    winner: 'demo',
    winnerScore: 55,
    highScore: 55,
    lowScore: 47,
    avgScore: 51,
    roundsCompleted: 13,
    forceBurns: 0,
    isHighTable: false,
    standings: [],
    ...partial,
  };
}

describe('gameListDateKey', () => {
  it('formats a valid timestamp as a local calendar day', () => {
    const key = gameListDateKey('2026-08-12T22:00:00.000Z');
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns empty for invalid dates', () => {
    expect(gameListDateKey('not-a-date')).toBe('');
  });
});

describe('filterStatsGames', () => {
  const games = [
    game({
      id: 'a',
      name: 'Friday kitchen table',
      players: ['demo', 'Mom'],
      winner: 'demo',
      finishedAt: '2026-08-12T22:00:00.000Z',
    }),
    game({
      id: 'b',
      name: 'Sunday night',
      players: ['Jordan', 'Casey'],
      winner: 'Morgan',
      finishedAt: '2026-08-01T18:00:00.000Z',
    }),
    game({
      id: 'c',
      name: 'Tuesday trio',
      players: ['Alex', 'Sam', 'Pat'],
      winner: 'Sam',
      finishedAt: '2026-07-20T18:00:00.000Z',
    }),
  ];

  it('matches game title, player, or winner (case-insensitive)', () => {
    expect(filterStatsGames(games, { name: 'kitchen', from: '', to: '' }).map((g) => g.id)).toEqual([
      'a',
    ]);
    expect(filterStatsGames(games, { name: 'MOM', from: '', to: '' }).map((g) => g.id)).toEqual([
      'a',
    ]);
    expect(filterStatsGames(games, { name: 'sam', from: '', to: '' }).map((g) => g.id)).toEqual([
      'c',
    ]);
  });

  it('filters by local from/to date inclusive', () => {
    const mid = gameListDateKey('2026-08-01T18:00:00.000Z');
    const late = gameListDateKey('2026-08-12T22:00:00.000Z');
    expect(filterStatsGames(games, { name: '', from: mid, to: late }).map((g) => g.id)).toEqual([
      'a',
      'b',
    ]);
    expect(filterStatsGames(games, { name: '', from: late, to: '' }).map((g) => g.id)).toEqual([
      'a',
    ]);
    expect(filterStatsGames(games, { name: '', from: '', to: mid }).map((g) => g.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('applies name and date together', () => {
    const late = gameListDateKey('2026-08-12T22:00:00.000Z');
    expect(
      filterStatsGames(games, { name: 'demo', from: late, to: late }).map((g) => g.id),
    ).toEqual(['a']);
    expect(
      filterStatsGames(games, { name: 'demo', from: '', to: '2026-07-31' }).map((g) => g.id),
    ).toEqual([]);
  });
});
