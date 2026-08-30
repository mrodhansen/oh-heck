import { rankLabel, suitGlyph } from '../live/cards';
import { RANKS, SUITS, cardKey } from '../offline/superPlay';
import type { Rank, Suit } from '../types/cards';
import { cn } from '../ui';

type Props = {
  selectedSuit: Suit | null;
  selectedRank: Rank | null;
  usedKeys: ReadonlySet<string>;
  disabled?: boolean;
  onSelectSuit: (suit: Suit) => void;
  onSelectRank: (rank: Rank) => void;
};

const pickerBtn =
  'flex-1 min-h-11 min-w-0 cursor-pointer rounded-btn border font-display disabled:cursor-not-allowed disabled:opacity-35';

export function CardPicker({
  selectedSuit,
  selectedRank,
  usedKeys,
  disabled,
  onSelectSuit,
  onSelectRank,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" role="radiogroup" aria-label="Suit">
        {SUITS.map((suit) => {
          const red = suit === 'H' || suit === 'D';
          return (
            <button
              key={suit}
              type="button"
              role="radio"
              aria-checked={selectedSuit === suit}
              className={cn(
                pickerBtn,
                'text-2xl',
                red ? 'text-danger' : 'text-grey-900',
                selectedSuit === suit
                  ? 'border-grey-800 bg-sand-100 shadow-inset-sel'
                  : 'border-line-strong bg-surface',
              )}
              disabled={disabled}
              onClick={() => onSelectSuit(suit)}
            >
              {suitGlyph(suit)}
            </button>
          );
        })}
      </div>
      <div
        className="flex flex-nowrap gap-1.5 portrait:grid portrait:grid-cols-7"
        role="radiogroup"
        aria-label="Rank"
      >
        {RANKS.map((rank) => {
          const key = selectedSuit ? cardKey({ s: selectedSuit, r: rank }) : '';
          const used = selectedSuit != null && usedKeys.has(key);
          const red = selectedSuit === 'H' || selectedSuit === 'D';
          return (
            <button
              key={rank}
              type="button"
              role="radio"
              aria-checked={selectedRank === rank}
              disabled={disabled || !selectedSuit || used}
              className={cn(
                pickerBtn,
                'flex flex-col items-center justify-center py-1 text-btn-sm font-bold leading-tight portrait:text-btn',
                red ? 'text-danger' : 'text-grey-900',
                selectedRank === rank
                  ? 'border-grey-800 bg-sand-100 shadow-inset-sel'
                  : 'border-line-strong bg-surface',
              )}
              onClick={() => onSelectRank(rank)}
            >
              <span>{rankLabel(rank)}</span>
              {selectedSuit ? (
                <span className="text-meta font-medium">
                  {suitGlyph(selectedSuit)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
