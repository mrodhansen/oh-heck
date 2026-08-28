import { describe, expect, it } from 'vitest';
import type { StatsResponse } from '../api';
import { statsView } from './statsView';

const emptyLeaders: StatsResponse['overview']['leaders'] = {
  mostWins: null,
  highestAvg: null,
  bestSingleGame: null,
  worstSingleGame: null,
  bestBidAccuracy: null,
  mostNils: null,
  biggestRound: null,
  mostPodiums: null,
  mostForceBurns: null,
  perfectGames: null,
  biggestMargin: null,
};

function bundle(
  uniquePlayers: number,
  names: string[],
): Pick<StatsResponse, 'overview' | 'games' | 'players'> {
  return {
    overview: {
      totalGames: 1,
      completedGames: 1,
      uniquePlayers,
      totalForceBurns: 0,
      totalRoundsPlayed: 0,
      leaders: emptyLeaders,
    },
    games: [],
    players: names.map((name) => ({
      key: name,
      name,
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
    })),
  };
}

const stats: StatsResponse = {
  ...bundle(2, ['Abraham Hansen']),
  allPlayers: bundle(5, ['Abe', 'Charlie']),
};

describe('statsView', () => {
  it('keeps user aggregations off', () => {
    const view = statsView(stats, false);
    expect(view.overview.uniquePlayers).toBe(2);
    expect(view.players.map((p) => p.name)).toEqual(['Abraham Hansen']);
  });

  it('swaps to all-player aggregations on', () => {
    const view = statsView(stats, true);
    expect(view.overview.uniquePlayers).toBe(5);
    expect(view.players.map((p) => p.name)).toEqual(['Abe', 'Charlie']);
  });

  it('stays on users when allPlayers is missing', () => {
    const legacy: StatsResponse = {
      overview: stats.overview,
      games: stats.games,
      players: stats.players,
    };
    const view = statsView(legacy, true);
    expect(view.overview.uniquePlayers).toBe(2);
  });
});
