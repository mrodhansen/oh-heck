import { useMemo, useState } from 'react';
import { GameDetail } from '../api';
import { toUserMessage } from '../api/errors';
import { NumberStepper } from './NumberStepper';
import { forbiddenLastBid } from '../offline/rules';
import {
  banner,
  bannerInfo,
  btnClass,
  card,
  cn,
  grid2,
  hint,
  modal,
  modalBackdrop,
  muted,
  pageTitle,
  row,
  stack,
  stackSm,
} from '../ui';

type Props = {
  game: GameDetail;
  roundNumber: number;
  onClose: () => void;
  allowIncomplete?: boolean;
  onSave: (payload: {
    bids: { playerId: string; bid: number }[];
    tricks: { playerId: string; tricksTaken: number }[];
    forceBurn: boolean;
  }) => Promise<void>;
};

export function EditRoundModal({
  game,
  roundNumber,
  onClose,
  onSave,
  allowIncomplete = false,
}: Props) {
  const round = game.rounds.find((r) => r.number === roundNumber);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [forceBurn, setForceBurn] = useState(round?.forceBurn ?? false);

  const [bids, setBids] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (!round) return init;
    if (!round.complete && !allowIncomplete) return init;
    for (const e of round.entries) {
      init[e.playerId] = e.bid ?? 0;
    }
    return init;
  });

  const [tricks, setTricks] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (!round) return init;
    if (!round.complete && !allowIncomplete) return init;
    for (const e of round.entries) {
      init[e.playerId] = e.tricksTaken ?? 0;
    }
    return init;
  });

  const handSize = round?.handSize ?? 0;
  const bidOrder = round?.bidOrderPlayerIds ?? [];

  const forbiddenLast = useMemo(() => {
    if (!round) return null;
    let sum = 0;
    for (let i = 0; i < bidOrder.length - 1; i++) {
      const v = bids[bidOrder[i]!];
      if (v === undefined) return null;
      sum += v;
    }
    return forbiddenLastBid(sum, handSize);
  }, [bids, bidOrder, handSize, round]);

  const trickSum = Object.values(tricks).reduce((a, b) => a + b, 0);
  const tricksLeft = Math.max(0, handSize - trickSum);
  const lastId = bidOrder[bidOrder.length - 1];

  if (!round || (!round.complete && !allowIncomplete)) {
    return (
      <div className={modalBackdrop} onClick={onClose}>
        <div className={cn(modal, stack)} onClick={(e) => e.stopPropagation()}>
          <p className={banner}>Cannot edit an incomplete round.</p>
          <button type="button" className={btnClass({ kind: 'ghost' })} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  async function submit() {
    setError(null);
    if (lastId != null && forbiddenLast !== null && bids[lastId] === forbiddenLast) {
      setError(`Dealer cannot bid ${forbiddenLast}`);
      return;
    }
    if (trickSum !== handSize) {
      setError(`Tricks must sum to ${handSize} (now ${trickSum})`);
      return;
    }
    setSaving(true);
    try {
      const bidPayload = game.players.map((p) => {
        const bid = bids[p.id];
        if (bid === undefined) {
          throw new Error(`Missing bid for ${p.name}`);
        }
        return { playerId: p.id, bid };
      });
      const trickPayload = game.players.map((p) => {
        const tricksTaken = tricks[p.id];
        if (tricksTaken === undefined) {
          throw new Error(`Missing tricks for ${p.name}`);
        }
        return { playerId: p.id, tricksTaken };
      });
      await onSave({
        bids: bidPayload,
        tricks: trickPayload,
        forceBurn,
      });
      onClose();
    } catch (e) {
      setError(toUserMessage(e, 'Save failed'));
      setSaving(false);
    }
  }

  return (
    <div className={modalBackdrop} onClick={onClose}>
      <div className={cn(modal, stack)} onClick={(e) => e.stopPropagation()}>
        <div className={cn(row, 'justify-between')}>
          <h3 className={pageTitle}>
            Edit round {roundNumber}
          </h3>
          <button type="button" className={btnClass({ kind: 'ghost', size: 'sm' })} onClick={onClose}>
            Close
          </button>
        </div>
        <div className={cn(row, 'justify-between')}>
          <p className={cn(hint, 'm-0')}>
            {handSize} cards · bid order
          </p>
          <button
            type="button"
            className={cn(
              'self-center min-h-9 min-w-12 cursor-pointer rounded-btn border border-line-strong bg-surface-2 px-3 text-meta font-bold tracking-wide text-grey-600',
              forceBurn && 'border-grey-800 bg-grey-800 text-sand-50',
            )}
            aria-pressed={forceBurn}
            title="Force Burn"
            onClick={() => setForceBurn((v) => !v)}
          >
            FB
          </button>
        </div>

        {error && <div className={banner}>{error}</div>}

        <div className={stackSm}>
          {bidOrder.map((pid, idx) => {
            const p = game.players.find((x) => x.id === pid)!;
            const isLast = idx === bidOrder.length - 1;
            return (
              <div key={pid} className={cn(card, stackSm)}>
                <div>
                  <strong>{p.name}</strong>
                  {isLast && (
                    <span className={muted}> · dealer / last bid</span>
                  )}
                </div>
                <div className={grid2}>
                  <div>
                    <div className={cn(hint, 'mb-1.5')}>
                      Bid
                      {isLast && forbiddenLast !== null
                        ? ` (not ${forbiddenLast})`
                        : ''}
                    </div>
                    <NumberStepper
                      value={bids[pid] ?? 0}
                      min={0}
                      max={handSize}
                      forbidden={isLast ? forbiddenLast : null}
                      onChange={(n) =>
                        setBids((prev) => ({ ...prev, [pid]: n }))
                      }
                    />
                  </div>
                  <div>
                    <div className={cn(hint, 'mb-1.5')}>
                      Tricks
                    </div>
                    <NumberStepper
                      value={tricks[pid] ?? 0}
                      min={0}
                      max={(tricks[pid] ?? 0) + tricksLeft}
                      onChange={(n) =>
                        setTricks((prev) => ({ ...prev, [pid]: n }))
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={trickSum === handSize ? bannerInfo : banner}>
          Tricks total: {trickSum} / {handSize}
        </div>

        <button
          type="button"
          className={btnClass({ kind: 'primary', block: true })}
          disabled={saving}
          onClick={submit}
        >
          {saving ? 'Saving…' : 'Save round'}
        </button>
      </div>
    </div>
  );
}
