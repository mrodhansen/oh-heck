import type { StatsPlayer } from '../api';

export function filterStatsPlayers(
  players: StatsPlayer[],
  name: string,
): StatsPlayer[] {
  const q = name.trim().toLowerCase();
  if (!q) return players;
  return players.filter((p) => p.name.toLowerCase().includes(q));
}
