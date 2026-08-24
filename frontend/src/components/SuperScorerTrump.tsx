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

  function pickSuit(next: Suit) {
    setSuit(next);
    setRank(null);
  }

  function pickRank(next: Rank) {
    if (!suit || saving) return;
    const card = { s: suit, r: next };
    setRank(next);
    void onSave(card).then(() => {
      setSuit(null);
      setRank(null);
    });
  }

  return (
    <div className="play-middle">
      <div className="super-play">
        <p className="super-play-who">Choose trump</p>
        <CardPicker
          selectedSuit={suit}
          selectedRank={rank}
          usedKeys={new Set()}
          disabled={saving}
          onSelectSuit={pickSuit}
          onSelectRank={pickRank}
        />
      </div>
    </div>
  );
}
