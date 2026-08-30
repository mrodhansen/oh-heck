import type { StatsPlayer } from '../api';

export function statsNameKey(name: string): string {
  const n = name.trim().toLowerCase();
  if (!n) {
    throw new Error('Player name cannot be empty');
  }
  return n;
}

export function combinePlayersByName(players: StatsPlayer[]): StatsPlayer[] {
  const by = new Map<string, StatsPlayer>();
  for (const p of players) {
    const k = statsNameKey(p.name);
    const prev = by.get(k);
    by.set(k, prev ? mergeStatsPlayers(prev, p, k) : withNameKey(p, k));
  }
  return [...by.values()];
}

function withNameKey(p: StatsPlayer, nameKey: string): StatsPlayer {
  return { ...p, key: `name:${nameKey}` };
}

function mergeStatsPlayers(
  a: StatsPlayer,
  b: StatsPlayer,
  nameKey: string,
): StatsPlayer {
  const primary = a.gamesCompleted >= b.gamesCompleted ? a : b;
  const gamesCompleted = a.gamesCompleted + b.gamesCompleted;
  const gamesPlayed = a.gamesPlayed + b.gamesPlayed;
  const roundsPlayed = a.roundsPlayed + b.roundsPlayed;
  const bidsMade = a.bidsMade + b.bidsMade;
  const totalScore = a.totalScore + b.totalScore;
  const wins = a.wins + b.wins;
  const seconds = a.seconds + b.seconds;
  const thirds = a.thirds + b.thirds;
  const nilBids = a.nilBids + b.nilBids;
  const nilsMade = a.nilsMade + b.nilsMade;
  return {
    ...primary,
    key: `name:${nameKey}`,
    userId: primary.userId ?? a.userId ?? b.userId ?? null,
    playerId: primary.playerId ?? a.playerId ?? b.playerId ?? null,
    gamesPlayed,
    gamesCompleted,
    wins,
    seconds,
    thirds,
    podium: a.podium + b.podium,
    totalScore,
    avgScore: gamesCompleted > 0 ? round2(totalScore / gamesCompleted) : null,
    bestScore: mergeMax(a.bestScore, b.bestScore),
    worstScore: mergeMin(a.worstScore, b.worstScore),
    roundsPlayed,
    bidsMade,
    bidAccuracy:
      roundsPlayed > 0 ? round2((bidsMade / roundsPlayed) * 100) : null,
    nilBids,
    nilsMade,
    nilSuccessRate: nilBids > 0 ? round2((nilsMade / nilBids) * 100) : null,
    forceBurns: a.forceBurns + b.forceBurns,
    overtricks: a.overtricks + b.overtricks,
    undertricks: a.undertricks + b.undertricks,
    biggestRound: mergeMax(a.biggestRound, b.biggestRound),
    smallestRound: mergeMin(a.smallestRound, b.smallestRound),
    perfectGames: a.perfectGames + b.perfectGames,
    winRate: gamesCompleted > 0 ? round2((wins / gamesCompleted) * 100) : null,
  };
}

function mergeMax(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function mergeMin(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
