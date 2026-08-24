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
      <div className="play-middle">
        <div className="super-play">
          {view.trumpCard && (
            <p className="super-play-trump">
              Trump {suitGlyph(view.trumpCard.s)} {rankLabel(view.trumpCard.r)}
              <span className="phase-dot">·</span>
              Trick {Math.min(view.completed.length + 1, current.handSize)}/
              {current.handSize}
            </p>
          )}

          <div className="super-play-standings">
            {current.bidOrderPlayerIds.map((pid) => {
              const e = current.entries.find((x) => x.playerId === pid);
              if (!e) return null;
              const taken = view.tricksTakenByPlayerId[pid] ?? 0;
              const isTurn = pid === view.turnPlayerId && !needTrump;
              return (
                <div
                  key={pid}
                  className={`super-play-seat ${isTurn ? 'turn' : ''}`}
                >
                  <span className="truncate">{e.playerName}</span>
                  <strong>
                    {taken}
                    <span className="value-of">/{e.bid}</span>
                  </strong>
                </div>
              );
            })}
          </div>

          {!needTrump && view.current && view.current.plays.length > 0 && (
            <div className="super-play-trick">
              {view.current.plays.map((p) => {
                const name =
                  game.players.find((x) => x.id === p.playerId)?.name ?? '';
                return (
                  <div key={`${p.playerId}-${p.playOrder}`} className="super-play-slot">
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
              <p className="hint" style={{ margin: 0, textAlign: 'center' }}>
                {lastWinner.name} took it — leads
              </p>
            )}

          <p className="super-play-who">
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
        <div className="action-bar">
          <button
            type="button"
            className="btn ghost block"
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
