import { Link } from 'react-router-dom';
import { accountNameNeedles, type ClaimableGame } from '../auth';

export function ClaimableGameCard({
  game,
  user,
}: {
  game: ClaimableGame;
  user: { username: string; firstName: string; lastName: string };
}) {
  const needles = accountNameNeedles(user);
  const matchNames = game.players
    .filter(
      (p) => p.claimable && needles.includes(p.name.trim().toLowerCase()),
    )
    .map((p) => p.name);
  const status = formatGameStatus(game.status);
  const when = formatDate(game.finishedAt ?? game.createdAt);

  return (
    <Link
      to={`/games/${game.id}`}
      state={{ from: 'account' }}
      className="list-item"
    >
      <div className="min-w-0">
        <p className="list-item-title truncate">{game.name ?? 'Game'}</p>
        <p className="list-item-meta truncate">
          {game.players.map((p) => p.name).join(', ')}
        </p>
        <p className="list-item-status">
          {status}
          {when ? ` · ${when}` : ''}
          {matchNames.length > 0
            ? ` · Unclaimed seat ${matchNames.join(', ')}`
            : ''}
        </p>
      </div>
      <span className="list-item-chevron" aria-hidden>
        ›
      </span>
    </Link>
  );
}

function formatGameStatus(status: ClaimableGame['status']): string {
  switch (status) {
    case 'COMPLETED':
      return 'Completed';
    case 'PLAYING':
      return 'Playing';
    case 'BIDDING':
      return 'Bidding';
    case 'SETUP':
      return 'Setup';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
