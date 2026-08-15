import { describe, expect, it } from 'vitest';
import type { StatsPlayer } from '../api';
import { filterStatsPlayers } from './statsPlayersFilter';

function player(partial: Partial<StatsPlayer> & Pick<StatsPlayer, 'name'>): StatsPlayer {
  return {
    gamesPlayed: 1,
    gamesCompleted: 1,
    wins: 0,
    seconds: 0,
    thirds: 0,
    podium: 0,
    totalScore: 0,
    avgScore: null,
    bestScore: null,
    worstScore: null,
    roundsPlayed: 0,
    bidsMade: 0,
    bidAccuracy: null,
    nilBids: 0,
    nilsMade: 0,
    nilSuccessRate: null,
    forceBurns: 0,
    overtricks: 0,
    undertricks: 0,
    biggestRound: null,
    smallestRound: null,
    perfectGames: 0,
    winRate: null,
    ...partial,
  };
}

describe('filterStatsPlayers', () => {
  const players = [
    player({ name: 'Abraham Hansen' }),
    player({ name: 'Martin Hansen' }),
    player({ name: 'demo' }),
  ];

  it('returns all players when the query is empty', () => {
    expect(filterStatsPlayers(players, '').map((p) => p.name)).toEqual([
      'Abraham Hansen',
      'Martin Hansen',
      'demo',
    ]);
    expect(filterStatsPlayers(players, '   ').map((p) => p.name)).toEqual([
      'Abraham Hansen',
      'Martin Hansen',
      'demo',
    ]);
  });

  it('matches player name case-insensitively', () => {
    expect(filterStatsPlayers(players, 'hansen').map((p) => p.name)).toEqual([
      'Abraham Hansen',
      'Martin Hansen',
    ]);
    expect(filterStatsPlayers(players, 'DEMO').map((p) => p.name)).toEqual(['demo']);
  });

  it('returns none when nothing matches', () => {
    expect(filterStatsPlayers(players, 'quinn')).toEqual([]);
  });
});
