import { Link } from 'react-router-dom';
import {
  matchingClaimablePlayers,
  type ClaimableGame,
} from '../auth';

export function ClaimableGameCard({
  game,
  user,
  selected,
  onToggle,
}: {
  game: ClaimableGame;
  user: { username: string; firstName: string; lastName: string };
  selected?: boolean;
  onToggle?: (gameId: string) => void;
}) {
  const matchNames = matchingClaimablePlayers(game, user).map((p) => p.name);
  const status = formatGameStatus(game.status);
  const when = formatDate(game.finishedAt ?? game.createdAt);
  const body = (
    <>
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
      {onToggle ? (
        <span
          className={`claim-check${selected ? ' is-on' : ''}`}
          aria-hidden
        >
          {selected ? '✓' : ''}
        </span>
      ) : (
        <span className="list-item-chevron" aria-hidden>
          ›
        </span>
      )}
    </>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        className={`list-item list-item-btn${selected ? ' list-item-selected' : ''}`}
        aria-pressed={selected === true}
        onClick={() => onToggle(game.id)}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      to={`/games/${game.id}`}
      state={{ from: 'account' }}
      className="list-item"
    >
      {body}
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
