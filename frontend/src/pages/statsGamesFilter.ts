import type { StatsGame } from '../api';

/** Local calendar day (YYYY-MM-DD) for the date shown in the games list. */
export function gameListDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function filterStatsGames(
  games: StatsGame[],
  opts: { name: string; from: string; to: string },
): StatsGame[] {
  const q = opts.name.trim().toLowerCase();
  const from = opts.from.trim();
  const to = opts.to.trim();

  return games.filter((g) => {
    if (q) {
      const hay = [g.name ?? '', g.winner ?? '', ...g.players]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const key = gameListDateKey(g.finishedAt ?? g.createdAt);
    if (from && (!key || key < from)) return false;
    if (to && (!key || key > to)) return false;
    return true;
  });
}
