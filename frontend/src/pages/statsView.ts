import type { StatsResponse } from '../api';

/** Users bundle by default; all player identities when the switch is on. */
export function statsView(
  stats: StatsResponse,
  showAllPlayers: boolean,
): StatsResponse {
  if (!showAllPlayers || !stats.allPlayers) return stats;
  return {
    overview: stats.allPlayers.overview,
    games: stats.allPlayers.games,
    players: stats.allPlayers.players,
    allPlayers: stats.allPlayers,
  };
}
