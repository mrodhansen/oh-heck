import { describe, expect, it } from 'vitest';
import type { StatsPlayer } from '../api';
import {
  playersForRange,
  playersForWindow,
  playerScore,
  rangeSince,
  rankBestPlayers,
} from './bestPlayers';

function player(over: Partial<StatsPlayer> & { name: string }): StatsPlayer {
  return {
    key: `user:${over.name}`,
    userId: 'u',
    gamesPlayed: over.gamesCompleted ?? 0,
    gamesCompleted: 0,
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
    ...over,
  };
}

const regular = player({
  name: 'Abe',
  gamesCompleted: 38,
  wins: 9,
  seconds: 10,
  thirds: 6,
  podium: 25,
  avgScore: 48.6,
  bidAccuracy: 73,
  winRate: 24,
  perfectGames: 2,
});

const oneShot = player({
  name: 'Zeke',
  gamesCompleted: 1,
  wins: 1,
  seconds: 0,
  thirds: 0,
  podium: 1,
  avgScore: 66,
  bidAccuracy: 92,
  winRate: 100,
  perfectGames: 1,
});

const filler = player({
  name: 'Typical',
  gamesCompleted: 20,
  wins: 3,
  seconds: 3,
  thirds: 2,
  podium: 8,
  avgScore: 44,
  bidAccuracy: 68,
  winRate: 15,
});

describe('rankBestPlayers', () => {
  it('returns empty when no one has finished a game', () => {
    expect(rankBestPlayers([])).toEqual([]);
    expect(rankBestPlayers([player({ name: 'New', gamesCompleted: 0 })])).toEqual(
      [],
    );
  });

  it('does not let a one-game perfect outing beat a long strong record', () => {
    const top = rankBestPlayers([oneShot, regular, filler], 3);
    expect(top[0]?.player.name).toBe('Abe');
    expect(top[0]!.rating).toBeGreaterThan(
      top.find((r) => r.player.name === 'Zeke')?.rating ?? -1,
    );
  });

  it('does not treat firsts as extra 2nd/3rd credit', () => {
    const winsOnly = player({
      name: 'WinsOnly',
      gamesCompleted: 20,
      wins: 5,
      seconds: 0,
      thirds: 0,
      podium: 5,
      avgScore: 46,
      bidAccuracy: 70,
      winRate: 25,
    });
    const withSeconds = player({
      name: 'WithSeconds',
      gamesCompleted: 20,
      wins: 5,
      seconds: 8,
      thirds: 0,
      podium: 13,
      avgScore: 46,
      bidAccuracy: 70,
      winRate: 25,
    });
    const top = rankBestPlayers([winsOnly, withSeconds, filler], 2);
    expect(top[0]?.player.name).toBe('WithSeconds');
    expect(top[0]!.rating).toBeGreaterThan(top[1]!.rating);
  });

  it('ranks a higher win rate above equal bidding and scoring', () => {
    const lowWins = player({
      name: 'LowWins',
      gamesCompleted: 20,
      wins: 2,
      seconds: 3,
      thirds: 2,
      avgScore: 46,
      bidAccuracy: 70,
      winRate: 10,
    });
    const highWins = player({
      name: 'HighWins',
      gamesCompleted: 20,
      wins: 8,
      seconds: 3,
      thirds: 2,
      avgScore: 46,
      bidAccuracy: 70,
      winRate: 40,
    });
    const top = rankBestPlayers([lowWins, highWins, filler], 2);
    expect(top[0]?.player.name).toBe('HighWins');
    expect(top[0]!.rating).toBeGreaterThan(top[1]!.rating);
  });

  it('caps at three', () => {
    const extra = player({
      name: 'Milly',
      gamesCompleted: 33,
      wins: 7,
      seconds: 8,
      thirds: 3,
      podium: 18,
      avgScore: 48,
      bidAccuracy: 74,
      winRate: 21,
    });
    expect(rankBestPlayers([regular, extra, filler, oneShot], 3)).toHaveLength(3);
  });
});

describe('time range', () => {
  it('counts only games inside the window', () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    const since = rangeSince('1y', now);
    expect(since?.toISOString().startsWith('2025-08-01')).toBe(true);
    const games = [
      {
        id: 'old',
        name: 'Old',
        status: 'COMPLETED' as const,
        createdAt: '2014-01-01T00:00:00.000Z',
        finishedAt: '2014-01-01T00:00:00.000Z',
        playerCount: 2,
        players: ['Abe'],
        winner: 'Abe',
        winnerScore: 40,
        highScore: 40,
        lowScore: 10,
        avgScore: 25,
        roundsCompleted: 13,
        forceBurns: 0,
        standings: [
          { name: 'Abe', total: 40, place: 1 },
          { name: 'Typical', total: 10, place: 2 },
        ],
      },
      {
        id: 'new',
        name: 'New',
        status: 'COMPLETED' as const,
        createdAt: '2026-06-01T00:00:00.000Z',
        finishedAt: '2026-06-01T00:00:00.000Z',
        playerCount: 1,
        players: ['Abe'],
        winner: 'Abe',
        winnerScore: 50,
        highScore: 50,
        lowScore: 50,
        avgScore: 50,
        roundsCompleted: 13,
        forceBurns: 0,
        standings: [{ name: 'Abe', total: 50, place: 1 }],
      },
    ];
    const windowed = playersForRange([regular, filler], games, '1y', now);
    expect(windowed).toHaveLength(1);
    expect(windowed[0]?.name).toBe('Abe');
    expect(windowed[0]?.gamesCompleted).toBe(1);
    expect(windowed[0]?.wins).toBe(1);
  });

  it('playersForWindow respects an end date', () => {
    const games = [
      {
        id: 'a',
        name: 'A',
        status: 'COMPLETED' as const,
        createdAt: '2020-01-01T12:00:00.000Z',
        finishedAt: '2020-01-01T12:00:00.000Z',
        playerCount: 1,
        players: ['Abe'],
        winner: 'Abe',
        winnerScore: 10,
        highScore: 10,
        lowScore: 10,
        avgScore: 10,
        roundsCompleted: 13,
        forceBurns: 0,
        standings: [{ name: 'Abe', total: 10, place: 1 }],
      },
      {
        id: 'b',
        name: 'B',
        status: 'COMPLETED' as const,
        createdAt: '2024-01-01T12:00:00.000Z',
        finishedAt: '2024-01-01T12:00:00.000Z',
        playerCount: 1,
        players: ['Abe'],
        winner: 'Abe',
        winnerScore: 20,
        highScore: 20,
        lowScore: 20,
        avgScore: 20,
        roundsCompleted: 13,
        forceBurns: 0,
        standings: [{ name: 'Abe', total: 20, place: 1 }],
      },
    ];
    const windowed = playersForWindow(
      [regular],
      games,
      Date.parse('2019-01-01T00:00:00.000Z'),
      Date.parse('2021-01-01T00:00:00.000Z'),
    );
    expect(windowed[0]?.gamesCompleted).toBe(1);
    expect(windowed[0]?.avgScore).toBe(10);
  });
});

describe('playerScore', () => {
  it('weights placement, made bids, and score, minus a small force-burn hit', () => {
    expect(
      playerScore({
        n: 10,
        winRate: 20,
        avgScore: 40,
        bidAccuracy: 80,
        secondThirdRate: 20,
        forceBurnRate: 10,
      }),
    ).toBe(196);
  });

  it('lowers the score slightly when force-burn rate is higher', () => {
    const base = {
      n: 20,
      winRate: 20,
      avgScore: 40,
      bidAccuracy: 70,
      secondThirdRate: 20,
    };
    expect(
      playerScore({ ...base, forceBurnRate: 0 }),
    ).toBeGreaterThan(playerScore({ ...base, forceBurnRate: 20 }));
  });
});
