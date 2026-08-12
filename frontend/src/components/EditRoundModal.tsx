import { useMemo, useState } from 'react';
import { GameDetail } from '../api';
import { toUserMessage } from '../api/errors';
import { NumberStepper } from './NumberStepper';
import { forbiddenLastBid } from '../offline/rules';

type Props = {
  game: GameDetail;
  roundNumber: number;
  onClose: () => void;
  onSave: (payload: {
    bids: { playerId: string; bid: number }[];
    tricks: { playerId: string; tricksTaken: number }[];
    forceBurn: boolean;
  }) => Promise<void>;
};

export function EditRoundModal({ game, roundNumber, onClose, onSave }: Props) {
  const round = game.rounds.find((r) => r.number === roundNumber);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [forceBurn, setForceBurn] = useState(round?.forceBurn ?? false);

  const [bids, setBids] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (!round?.complete) return init;
    for (const e of round.entries) {
      if (e.bid === null || e.tricksTaken === null) {
        throw new Error('Cannot edit incomplete round');
      }
      init[e.playerId] = e.bid;
    }
    return init;
  });

  const [tricks, setTricks] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (!round?.complete) return init;
    for (const e of round.entries) {
      if (e.tricksTaken === null) {
        throw new Error('Cannot edit incomplete round');
      }
      init[e.playerId] = e.tricksTaken;
    }
    return init;
  });

  const handSize = round?.handSize ?? 0;
  const bidOrder = round?.bidOrderPlayerIds ?? [];

  const forbiddenLast = useMemo(() => {
    if (!round?.complete) return null;
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

  if (!round?.complete) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal stack" onClick={(e) => e.stopPropagation()}>
          <p className="banner">Cannot edit an incomplete round.</p>
          <button type="button" className="btn ghost" onClick={onClose}>
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="row space-between">
          <h3 className="page-title" style={{ fontSize: '1.25rem', margin: 0 }}>
            Edit round {roundNumber}
          </h3>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="row space-between">
          <p className="hint" style={{ margin: 0 }}>
            {handSize} cards · bid order
          </p>
          <button
            type="button"
            className={`fb-toggle ${forceBurn ? 'on' : ''}`}
            aria-pressed={forceBurn}
            title="Force Burn"
            onClick={() => setForceBurn((v) => !v)}
          >
            FB
          </button>
        </div>

        {error && <div className="banner">{error}</div>}

        <div className="stack-sm">
          {bidOrder.map((pid, idx) => {
            const p = game.players.find((x) => x.id === pid)!;
            const isLast = idx === bidOrder.length - 1;
            return (
              <div key={pid} className="card stack-sm">
                <div>
                  <strong>{p.name}</strong>
                  {isLast && (
                    <span className="muted"> · dealer / last bid</span>
                  )}
                </div>
                <div className="grid-2">
                  <div>
                    <div className="hint" style={{ marginBottom: 6 }}>
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
                    <div className="hint" style={{ marginBottom: 6 }}>
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

        <div className={`banner ${trickSum === handSize ? 'info' : ''}`}>
          Tricks total: {trickSum} / {handSize}
        </div>

        <button
          type="button"
          className="btn primary block"
          disabled={saving}
          onClick={submit}
        >
          {saving ? 'Saving…' : 'Save round'}
        </button>
      </div>
    </div>
  );
}
