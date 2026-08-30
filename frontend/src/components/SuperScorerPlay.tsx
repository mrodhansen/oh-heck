import { useMemo, useState } from 'react';
import type { GameDetail, RoundDetail } from '../api';
import { PlayingCard } from './PlayingCard';
import { CardPicker } from './CardPicker';
import { rankLabel, suitGlyph } from '../live/cards';
import {
  buildSuperPlay,
  cardKey,
  playsFromRound,
} from '../offline/superPlay';
import type { CardJson, Rank, Suit } from '../types/cards';
import {
  actionBar,
  btnClass,
  cn,
  hint,
  phaseDot,
  playMiddle,
} from '../ui';

type Props = {
  game: GameDetail;
  current: RoundDetail;
  saving: boolean;
  onSave: (body: {
    trumpCard: CardJson | null;
    plays: { playerId: string; card: CardJson }[];
  }) => Promise<void>;
};

export function SuperScorerPlay({ game, current, saving, onSave }: Props) {
  const [suit, setSuit] = useState<Suit | null>(null);
  const [rank, setRank] = useState<Rank | null>(null);

  const storedPlays = useMemo(() => playsFromRound(current), [current]);
  const view = useMemo(
    () =>
      buildSuperPlay({
        playerCount: game.players.length,
        firstLeadSeat: current.firstBidderSeat,
        handSize: current.handSize,
        players: game.players.map((p) => ({
          id: p.id,
          seatIndex: p.seatIndex,
        })),
        trumpCard: current.trumpCard ?? null,
        plays: storedPlays,
      }),
    [game.players, current, storedPlays],
  );

  const usedKeys = useMemo(() => new Set(view.usedKeys), [view.usedKeys]);
  const needTrump = view.trumpCard == null;
  const turnPlayer = game.players.find((p) => p.id === view.turnPlayerId);
  const lastCompleted = view.completed[view.completed.length - 1];
  const lastWinner = lastCompleted
    ? game.players.find((p) => p.id === lastCompleted.winnerPlayerId)
    : null;

  function pickSuit(next: Suit) {
    setSuit(next);
    setRank(null);
  }

  async function playCard(card: CardJson) {
    if (saving || usedKeys.has(cardKey(card))) return;
    if (needTrump) {
      await onSave({ trumpCard: card, plays: [] });
    } else {
      if (!view.turnPlayerId) return;
      await onSave({
        trumpCard: view.trumpCard,
        plays: [
          ...storedPlays.map((p) => ({
            playerId: p.playerId,
            card: { s: p.s, r: p.r },
          })),
          { playerId: view.turnPlayerId, card },
        ],
      });
    }
    setSuit(null);
    setRank(null);
  }

  function pickRank(next: Rank) {
    if (!suit) return;
    const card = { s: suit, r: next };
    if (usedKeys.has(cardKey(card))) return;
    setRank(next);
    void playCard(card);
  }

  async function undo() {
    if (storedPlays.length === 0) return;
    const nextPlays = storedPlays.slice(0, -1).map((p) => ({
      playerId: p.playerId,
      card: { s: p.s, r: p.r },
    }));
    await onSave({ trumpCard: view.trumpCard, plays: nextPlays });
    setSuit(null);
    setRank(null);
  }

  const canUndo = storedPlays.length > 0;

  return (
    <>
      <div className={playMiddle}>
        <div className="flex min-h-0 flex-col gap-2.5 overflow-auto px-0.5 pb-2">
          {view.trumpCard && (
            <p className="m-0 text-center font-650 text-grey-800">
              Trump {suitGlyph(view.trumpCard.s)} {rankLabel(view.trumpCard.r)}
              <span className={phaseDot}>·</span>
              Trick {Math.min(view.completed.length + 1, current.handSize)}/
              {current.handSize}
            </p>
          )}

          <div className="flex flex-col gap-1">
            {current.bidOrderPlayerIds.map((pid) => {
              const e = current.entries.find((x) => x.playerId === pid);
              if (!e) return null;
              const taken = view.tricksTakenByPlayerId[pid] ?? 0;
              const isTurn = pid === view.turnPlayerId && !needTrump;
              return (
                <div
                  key={pid}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-btn border px-2.5 py-1.5 text-btn',
                    isTurn
                      ? 'border-grey-700 bg-sand-100 font-650'
                      : 'border-line bg-surface',
                  )}
                >
                  <span className="truncate">{e.playerName}</span>
                  <strong>
                    {taken}
                    <span>/{e.bid}</span>
                  </strong>
                </div>
              );
            })}
          </div>

          {!needTrump && view.current && view.current.plays.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {view.current.plays.map((p) => {
                const name =
                  game.players.find((x) => x.id === p.playerId)?.name ?? '';
                return (
                  <div
                    key={`${p.playerId}-${p.playOrder}`}
                    className="flex min-w-0 flex-col items-center gap-1 text-kicker text-muted"
                  >
                    <PlayingCard
                      card={{
                        key: p.key,
                        suit: p.s,
                        rank: p.r,
                      }}
                      compact
                    />
                    <span className="truncate">{name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!needTrump &&
            view.current &&
            view.current.plays.length === 0 &&
            lastWinner && (
              <p className={cn(hint, 'm-0 text-center')}>
                {lastWinner.name} took it — leads
              </p>
            )}

          <p className="mt-1 mb-0 text-center font-display text-2xl font-650">
            {needTrump
              ? 'Flip card — trump'
              : turnPlayer
                ? turnPlayer.name
                : '—'}
          </p>

          <CardPicker
            selectedSuit={suit}
            selectedRank={rank}
            usedKeys={usedKeys}
            disabled={saving}
            onSelectSuit={pickSuit}
            onSelectRank={pickRank}
          />
        </div>
      </div>

      {canUndo && (
        <div className={actionBar}>
          <button
            type="button"
            className={btnClass({ kind: 'ghost', block: true })}
            disabled={saving}
            onClick={() => void undo()}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
