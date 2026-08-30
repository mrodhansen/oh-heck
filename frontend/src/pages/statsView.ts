import type { StatsResponse } from '../api';
import { combinePlayersByName } from './statsPlayersCombine';

/** Claimed users by default; all table names (merged by name) when the switch is on. */
export function statsView(
  stats: StatsResponse,
  showAllPlayers: boolean,
): StatsResponse {
  if (!showAllPlayers || !stats.allPlayers) return stats;
  const players = combinePlayersByName(stats.allPlayers.players);
  return {
    overview: {
      ...stats.allPlayers.overview,
      uniquePlayers: players.length,
    },
    games: stats.allPlayers.games,
    players,
    allPlayers: stats.allPlayers,
  };
}
