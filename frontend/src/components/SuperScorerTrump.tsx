import { useState } from 'react';
import { CardPicker } from './CardPicker';
import type { CardJson, Rank, Suit } from '../types/cards';
import { playMiddle } from '../ui';

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
    <div className={playMiddle}>
      <div className="flex min-h-0 flex-col gap-2.5 overflow-auto px-0.5 pb-2">
        <p className="mt-1 mb-0 text-center font-display text-2xl font-650">
          Choose trump
        </p>
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
