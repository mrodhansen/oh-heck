import { useState } from 'react';
import { CardPicker } from './CardPicker';
import type { CardJson, Rank, Suit } from '../types/cards';

type Props = {
  saving: boolean;
  onSave: (trumpCard: CardJson) => Promise<void>;
};

export function SuperScorerTrump({ saving, onSave }: Props) {
  const [suit, setSuit] = useState<Suit | null>(null);
  const [rank, setRank] = useState<Rank | null>(null);

  const selectedCard: CardJson | null =
    suit && rank ? { s: suit, r: rank } : null;

  async function confirm() {
    if (!selectedCard) return;
    await onSave(selectedCard);
    setSuit(null);
    setRank(null);
  }

  return (
    <>
      <div className="play-middle">
        <div className="super-play">
          <p className="super-play-who">Choose trump</p>
          <CardPicker
            selectedSuit={suit}
            selectedRank={rank}
            usedKeys={new Set()}
            onSelectSuit={setSuit}
            onSelectRank={setRank}
          />
        </div>
      </div>
      <div className="action-bar">
        <button
          type="button"
          className="btn primary block"
          disabled={!selectedCard || saving}
          onClick={() => void confirm()}
        >
          {saving ? '…' : 'Confirm trump'}
        </button>
      </div>
    </>
  );
}
