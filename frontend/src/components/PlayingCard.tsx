import { isRed, rankLabel, suitGlyph } from '../live/cards';
import type { LiveCard } from '../live/types';

type Props = {
  card: LiveCard;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
};

export function PlayingCard({
  card,
  disabled,
  compact,
  onClick,
}: Props) {
  const red = isRed(card.suit);
  const className = `playing-card ${red ? 'red' : 'black'} ${disabled ? 'disabled' : ''} ${compact ? 'compact' : ''}`;
  const label = `${rankLabel(card.rank)} of ${card.suit}`;
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <span className="playing-card-rank">{rankLabel(card.rank)}</span>
        <span className="playing-card-suit">{suitGlyph(card.suit)}</span>
      </button>
    );
  }
  return (
    <div className={className} aria-label={label}>
      <span className="playing-card-rank">{rankLabel(card.rank)}</span>
      <span className="playing-card-suit">{suitGlyph(card.suit)}</span>
    </div>
  );
}
