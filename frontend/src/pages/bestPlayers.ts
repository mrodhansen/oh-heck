import type { StatsGame, StatsPlayer } from '../api';

/** Average-play games mixed in so a hot streak shrinks toward the field. */
const SHRINK = 10;

/** Placement first (1sts heaviest), then made-bid %, then score. */
const W_WIN = 0.32;
const W_SECOND_THIRD = 0.18;
const W_BID = 0.28;
const W_AVG = 0.18;
/** Small subtract — a regular burn already hits made-bid % harder. */
const W_FORCE_BURN = 0.04;

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;
/** Each year multiplies a game's weight by this (1y → 80%, 2y → 64%). */
export const RECENCY_PER_YEAR = 0.8;
/** High-table games count this much vs a regular game (on top of recency). */
export const HIGH_TABLE_WEIGHT = 1.25;

/** 1 today, ×0.8 per year of age. */
export function recencyWeight(gameMs: number, t0Ms: number): number {
  const ageMs = Math.max(0, t0Ms - gameMs);
  return RECENCY_PER_YEAR ** (ageMs / YEAR_MS);
}

/** Recency × 1.25 when the game is a high table. */
export function gameWeight(g: StatsGame, t0Ms: number): number {
  const recency = recencyWeight(gameTime(g), t0Ms);
  return recency * (g.isHighTable ? HIGH_TABLE_WEIGHT : 1);
}

/** n/(n+k) hits 90% of the score at 20 games. */
const SCORE_SHRINK = 20 / 9;

export type RankedPlayer = {
  player: StatsPlayer;
  rating: number;
};

export type TopRange = 'all' | '5y' | '1y' | '6m' | '1m';

export function rangeSince(range: TopRange, now = new Date()): Date | null {
  if (range === 'all') return null;
  const d = new Date(now.getTime());
  if (range === '5y') d.setFullYear(d.getFullYear() - 5);
  else if (range === '1y') d.setFullYear(d.getFullYear() - 1);
  else if (range === '6m') d.setMonth(d.getMonth() - 6);
  else d.setMonth(d.getMonth() - 1);
  return d;
}

function gameTime(g: StatsGame): number {
  return new Date(g.finishedAt ?? g.createdAt).getTime();
}

export function dayStartMs(ymd: string): number {
  return new Date(`${ymd}T00:00:00`).getTime();
}

export function dayEndMs(ymd: string): number {
  return new Date(`${ymd}T23:59:59.999`).getTime();
}

/**
 * Standings inside [fromMs, toMs] (unbounded = all games).
 * Win rate, 2nd/3rd rate, and avg score are recency-weighted so newer
 * games count more; high tables get a 1.25× bump. Game counts stay raw.
 */
export function playersForWindow(
  players: StatsPlayer[],
  games: StatsGame[],
  fromMs: number | null,
  toMs: number | null,
  now = new Date(),
): StatsPlayer[] {
  const t0 = toMs ?? now.getTime();
  const unbounded = fromMs == null && toMs == null;
  const windowed = games.filter((g) => {
    const t = gameTime(g);
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t > toMs) return false;
    return true;
  });
  const out: StatsPlayer[] = [];
  for (const p of players) {
    let n = 0;
    let wins = 0;
    let seconds = 0;
    let thirds = 0;
    let total = 0;
    let wSum = 0;
    let wWins = 0;
    let wSeconds = 0;
    let wThirds = 0;
    let wTotal = 0;
    for (const g of windowed) {
      const row = g.standings.find((s) => s.name === p.name);
      if (!row) continue;
      const w = gameWeight(g, t0);
      n += 1;
      total += row.total;
      wSum += w;
      wTotal += w * row.total;
      if (row.place === 1) {
        wins += 1;
        wWins += w;
      } else if (row.place === 2) {
        seconds += 1;
        wSeconds += w;
      } else if (row.place === 3) {
        thirds += 1;
        wThirds += w;
      }
    }
    if (n === 0 || wSum <= 0) continue;
    out.push({
      ...p,
      gamesPlayed: n,
      gamesCompleted: n,
      wins,
      // Scaled so (seconds+thirds)/n is the recency-weighted 2nd/3rd rate.
      seconds: (wSeconds / wSum) * n,
      thirds: (wThirds / wSum) * n,
      podium: wins + seconds + thirds,
      totalScore: total,
      avgScore: Math.round((wTotal / wSum) * 100) / 100,
      winRate: Math.round((wWins / wSum) * 10000) / 100,
      bidAccuracy: unbounded ? p.bidAccuracy : null,
      forceBurns: unbounded ? p.forceBurns : 0,
      roundsPlayed: unbounded ? p.roundsPlayed : 0,
    });
  }
  return out;
}

export function playersForRange(
  players: StatsPlayer[],
  games: StatsGame[],
  range: TopRange,
  now = new Date(),
): StatsPlayer[] {
  const since = rangeSince(range, now);
  return playersForWindow(
    players,
    games,
    since ? since.getTime() : null,
    null,
    now,
  );
}

type League = {
  winRate: number;
  avgScore: number;
  bidAccuracy: number;
  secondThirdRate: number;
  forceBurnRate: number;
};

type MetricParts = {
  n: number;
  winRate: number;
  avgScore: number;
  bidAccuracy: number;
  secondThirdRate: number;
  forceBurnRate: number;
};

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** 2nd + 3rd only. Firsts are already in win rate. */
function secondThirdRate(p: StatsPlayer): number | null {
  if (p.gamesCompleted <= 0) return null;
  return ((p.seconds + p.thirds) / p.gamesCompleted) * 100;
}

/** Dealer force-burn rounds as a % of rounds played. */
function forceBurnRate(p: StatsPlayer): number | null {
  if (p.roundsPlayed <= 0) return null;
  return (p.forceBurns / p.roundsPlayed) * 100;
}

function shrink(observed: number | null, games: number, league: number): number {
  if (observed === null) return league;
  return (games * observed + SHRINK * league) / (games + SHRINK);
}

export function leagueMeans(players: StatsPlayer[]): League {
  return {
    winRate: mean(
      players.map((p) => p.winRate).filter((n): n is number => n != null),
    ),
    avgScore: mean(
      players.map((p) => p.avgScore).filter((n): n is number => n != null),
    ),
    bidAccuracy: mean(
      players.map((p) => p.bidAccuracy).filter((n): n is number => n != null),
    ),
    secondThirdRate: mean(
      players.map(secondThirdRate).filter((n): n is number => n != null),
    ),
    forceBurnRate: mean(
      players.map(forceBurnRate).filter((n): n is number => n != null),
    ),
  };
}

export function metricParts(
  player: StatsPlayer,
  league: League,
): MetricParts | null {
  const n = player.gamesCompleted;
  if (n <= 0) return null;
  return {
    n,
    winRate: shrink(player.winRate, n, league.winRate),
    avgScore: shrink(player.avgScore, n, league.avgScore),
    bidAccuracy: shrink(player.bidAccuracy, n, league.bidAccuracy),
    secondThirdRate: shrink(
      secondThirdRate(player),
      n,
      league.secondThirdRate,
    ),
    forceBurnRate: shrink(
      forceBurnRate(player),
      n,
      league.forceBurnRate,
    ),
  };
}

/**
 * Placement (1sts + 2nd/3rd) first, then made-bid %, then avg score.
 * Force-burn rate subtracts a little — a normal miss already hits made-bid %.
 * Then × games/(games+20/9) — 90% of the score is in by 20 games.
 */
export function playerScore(parts: MetricParts): number {
  const weighted =
    W_WIN * parts.winRate +
    W_SECOND_THIRD * parts.secondThirdRate +
    W_BID * parts.bidAccuracy +
    W_AVG * parts.avgScore -
    W_FORCE_BURN * parts.forceBurnRate;
  return Math.round(weighted * (parts.n / (parts.n + SCORE_SHRINK)) * 10);
}

export function rankBestPlayers(
  players: StatsPlayer[],
  limit?: number,
): RankedPlayer[] {
  if (players.length === 0) return [];
  const league = leagueMeans(players);
  const scored = players
    .map((player) => {
      const parts = metricParts(player, league);
      if (!parts) return null;
      return { player, rating: playerScore(parts) };
    })
    .filter((r): r is RankedPlayer => r != null);
  scored.sort(
    (a, b) =>
      b.rating - a.rating ||
      b.player.gamesCompleted - a.player.gamesCompleted,
  );
  return limit == null ? scored : scored.slice(0, limit);
}
