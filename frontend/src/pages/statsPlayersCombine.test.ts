import { describe, expect, it } from 'vitest';
import type { StatsPlayer } from '../api';
import { combinePlayersByName } from './statsPlayersCombine';

function player(
  partial: Partial<StatsPlayer> & Pick<StatsPlayer, 'name'>,
): StatsPlayer {
  return {
    key: `player:${partial.name}`,
    gamesPlayed: 1,
    gamesCompleted: 1,
    wins: 0,
    seconds: 0,
    thirds: 0,
    podium: 0,
    totalScore: 40,
    avgScore: 40,
    bestScore: 40,
    worstScore: 40,
    roundsPlayed: 13,
    bidsMade: 10,
    bidAccuracy: 76.92,
    nilBids: 0,
    nilsMade: 0,
    nilSuccessRate: null,
    forceBurns: 0,
    overtricks: 0,
    undertricks: 0,
    biggestRound: 10,
    smallestRound: 0,
    perfectGames: 0,
    winRate: 0,
    ...partial,
  };
}

describe('combinePlayersByName', () => {
  it('merges Jeremiah rows and keeps Jere separate', () => {
    const out = combinePlayersByName([
      player({
        name: 'Jeremiah',
        gamesCompleted: 53,
        gamesPlayed: 53,
        wins: 7,
        totalScore: 2500,
        roundsPlayed: 689,
        bidsMade: 689,
        bidAccuracy: 100,
      }),
      player({
        name: 'Jeremiah',
        gamesCompleted: 1,
        gamesPlayed: 1,
        wins: 0,
        totalScore: 40,
        roundsPlayed: 13,
        bidsMade: 0,
        bidAccuracy: 0,
      }),
      player({ name: 'Jere', gamesCompleted: 2, gamesPlayed: 2, wins: 1 }),
    ]);
    expect(out.map((p) => p.name).sort()).toEqual(['Jere', 'Jeremiah']);
    const jeremiah = out.find((p) => p.name === 'Jeremiah');
    expect(jeremiah?.key).toBe('name:jeremiah');
    expect(jeremiah?.gamesCompleted).toBe(54);
    expect(jeremiah?.wins).toBe(7);
    expect(jeremiah?.bidAccuracy).toBe(98.15);
    const jere = out.find((p) => p.name === 'Jere');
    expect(jere?.key).toBe('name:jere');
    expect(jere?.gamesCompleted).toBe(2);
  });

  it('treats names as case-insensitive', () => {
    const out = combinePlayersByName([
      player({ name: 'Charlie', gamesCompleted: 2, gamesPlayed: 2 }),
      player({ name: 'CHARLIE', gamesCompleted: 1, gamesPlayed: 1 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe('Charlie');
    expect(out[0]?.gamesCompleted).toBe(3);
  });
});
