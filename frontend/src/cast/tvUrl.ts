export function tvScoreboardPath(gameId: string): string {
  if (!gameId) {
    throw new Error('Missing game id');
  }
  return `/games/${gameId}/tv`;
}

export function tvScoreboardHref(
  gameId: string,
  origin: string,
  baseUrl: string,
): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${origin}${base}${tvScoreboardPath(gameId)}`;
}

export function currentTvScoreboardHref(gameId: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return tvScoreboardHref(gameId, window.location.origin, base);
}
