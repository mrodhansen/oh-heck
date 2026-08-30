import type { GameDetail } from '../api';

export function tvGameStatus(game: GameDetail): string {
  if (game.phase === 'completed' || game.status === 'COMPLETED') {
    return 'Final';
  }
  if (game.currentRound == null) {
    return 'Oh Heck';
  }
  const round = game.rounds.find((r) => r.number === game.currentRound);
  if (!round) {
    throw new Error(`Missing round ${game.currentRound}`);
  }
  const phase = game.phase === 'bidding' ? 'Bidding' : 'Scoring';
  return `Round ${round.number} · ${round.handSize} cards · ${phase}`;
}

export function tvBoardFingerprint(game: GameDetail): string {
  const standings = [...game.standings]
    .sort((a, b) => a.place - b.place)
    .map((s) => `${s.playerId}:${s.total}:${s.place}`)
    .join(';');
  const rounds = game.rounds
    .map((r) => {
      const entries = r.entries
        .map((e) => `${e.playerId}:${e.bid}:${e.tricksTaken}:${e.points}`)
        .join(',');
      return `${r.number}:${r.complete}:${r.forceBurn}:${entries}`;
    })
    .join('|');
  return `${game.phase}:${game.status}:${game.currentRound}:${standings}:${rounds}`;
}
