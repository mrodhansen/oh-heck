import { rankLabel, suitGlyph } from '../live/cards';
import { RANKS, SUITS, cardKey } from '../offline/superPlay';
import type { Rank, Suit } from '../types/cards';

type Props = {
  selectedSuit: Suit | null;
  selectedRank: Rank | null;
  usedKeys: ReadonlySet<string>;
  onSelectSuit: (suit: Suit) => void;
  onSelectRank: (rank: Rank) => void;
};

export function CardPicker({
  selectedSuit,
  selectedRank,
  usedKeys,
  onSelectSuit,
  onSelectRank,
}: Props) {
  return (
    <div className="card-picker">
      <div className="card-picker-suits" role="radiogroup" aria-label="Suit">
        {SUITS.map((suit) => {
          const red = suit === 'H' || suit === 'D';
          return (
            <button
              key={suit}
              type="button"
              role="radio"
              aria-checked={selectedSuit === suit}
              className={`card-picker-suit ${red ? 'red' : 'black'} ${
                selectedSuit === suit ? 'selected' : ''
              }`}
              onClick={() => onSelectSuit(suit)}
            >
              {suitGlyph(suit)}
            </button>
          );
        })}
      </div>
      <div className="card-picker-ranks" role="radiogroup" aria-label="Rank">
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
              disabled={!selectedSuit || used}
              className={`card-picker-rank ${red ? 'red' : 'black'} ${
                selectedRank === rank ? 'selected' : ''
              }`}
              onClick={() => onSelectRank(rank)}
            >
              <span>{rankLabel(rank)}</span>
              {selectedSuit ? (
                <span className="card-picker-rank-suit">{suitGlyph(selectedSuit)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
