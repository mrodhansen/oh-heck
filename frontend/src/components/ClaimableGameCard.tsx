import { Link } from 'react-router-dom';
import {
  matchingClaimablePlayers,
  type ClaimableGame,
} from '../auth';
import {
  cn,
  listItem,
  listItemChevron,
  listItemMeta,
  listItemStatus,
  listItemTitle,
} from '../ui';

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
        <p className={cn(listItemTitle, 'truncate', selected && 'font-bold')}>
          {game.name ?? 'Game'}
        </p>
        <p className={cn(listItemMeta, 'truncate')}>
          {game.players.map((p) => p.name).join(', ')}
        </p>
        <p className={listItemStatus}>
          {status}
          {when ? ` · ${when}` : ''}
          {matchNames.length > 0
            ? ` · Unclaimed seat ${matchNames.join(', ')}`
            : ''}
        </p>
      </div>
      {onToggle ? (
        <span
          className={cn(
            'mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-md border-2 border-line-strong text-meta font-bold leading-none text-surface',
            selected && 'border-ok bg-ok',
          )}
          aria-hidden
        >
          {selected ? '✓' : ''}
        </span>
      ) : (
        <span className={listItemChevron} aria-hidden>
          ›
        </span>
      )}
    </>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        className={cn(
          listItem,
          'w-full cursor-pointer border-0 bg-transparent px-0 text-left',
          selected && 'bg-sand-100',
        )}
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
      className={cn(listItem, 'bg-transparent px-0')}
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
