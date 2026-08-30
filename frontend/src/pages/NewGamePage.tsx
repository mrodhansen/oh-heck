import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { toUserMessage } from '../api/errors';
import { accountDisplayName } from '../auth';
import { useAuth } from '../useAuth';
import { SuperScorerToggle } from '../components/SuperScorerToggle';
import { DealerSeatList } from '../components/DealerSeatList';
import {
  actionBar,
  banner,
  btnClass,
  card,
  cn,
  field,
  hint,
  lede,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageTitle,
  sectionTitle,
  stackSm,
} from '../ui';

const MIN = 2;
const MAX = 7;

type Step = 'names' | 'dealer';

export function NewGamePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('names');
  const [names, setNames] = useState<string[]>(() => Array.from({ length: MAX }, () => ''));
  const [selfSlot, setSelfSlot] = useState<number | null>(null);
  const [gameName, setGameName] = useState('');
  const [dealerIndex, setDealerIndex] = useState(0);
  const [superScorer, setSuperScorer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const display = accountDisplayName(user);
    if (!display) return;
    setNames((prev) => {
      if (prev.some((n) => n.trim())) return prev;
      return prev.map((n, i) => (i === 0 ? display : n));
    });
    setSelfSlot((s) => (s == null ? 0 : s));
  }, [user]);

  const cleaned = names.map((n) => n.trim()).filter(Boolean);

  function setName(i: number, value: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }

  function addPlayer() {
    if (names.length >= MAX) return;
    setNames((prev) => [...prev, '']);
  }

  function removePlayer(i: number) {
    if (names.length <= MIN) return;
    setNames((prev) => prev.filter((_, idx) => idx !== i));
    setSelfSlot((s) => {
      if (s == null) return s;
      if (s === i) return null;
      return s > i ? s - 1 : s;
    });
  }

  function goToDealer(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (cleaned.length < MIN || cleaned.length > MAX) {
      setError(`Need ${MIN}–${MAX} named players`);
      return;
    }
    if (new Set(cleaned.map((n) => n.toLowerCase())).size !== cleaned.length) {
      setError('Names must be unique');
      return;
    }
    const seated = names.map((n) => n.trim()).filter(Boolean);
    const selfName =
      selfSlot != null && names[selfSlot]?.trim()
        ? names[selfSlot].trim()
        : null;
    setNames(seated);
    setSelfSlot(selfName ? seated.indexOf(selfName) : null);
    setDealerIndex(seated.length - 1);
    setStep('dealer');
  }

  function movePlayer(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setNames((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (item === undefined) return prev;
      next.splice(to, 0, item);
      return next;
    });
    setSelfSlot((s) => shiftIndex(s, from, to));
    setDealerIndex((d) => shiftIndex(d, from, to) ?? d);
  }

  async function startGame() {
    setError(null);
    setSaving(true);
    try {
      const seated = names
        .map((n, i) => ({
          name: n.trim(),
          userId:
            user && selfSlot === i && n.trim() ? user.id : null,
        }))
        .filter((p) => p.name);
      const rotated = [
        ...seated.slice(dealerIndex + 1),
        ...seated.slice(0, dealerIndex + 1),
      ];
      const playerUserIds = rotated.map((p) => p.userId);
      const game = await api.createGame(
        rotated.map((p) => p.name),
        gameName.trim() || undefined,
        {
          ...(playerUserIds.some((id) => id) ? { playerUserIds } : {}),
          ...(superScorer ? { superScorer: true } : {}),
        },
      );
      navigate(`/games/${game.id}`);
    } catch (err) {
      setError(toUserMessage(err, 'Failed to create game'));
      setSaving(false);
    }
  }

  if (step === 'dealer') {
    return (
      <div className={pageFit}>
        <div className={pageFitHeader}>
          <h2 className={pageTitle}>Who deals first?</h2>
          <p className={lede}>
            Tap the round-1 dealer. Drag players so they match sitting order.
          </p>
        </div>

        {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}

        <div className={pageFitBody}>
          <DealerSeatList
            names={cleaned}
            dealerIndex={dealerIndex}
            onDealer={setDealerIndex}
            onReorder={movePlayer}
          />

          <SuperScorerToggle
            on={superScorer}
            onToggle={() => setSuperScorer((v) => !v)}
          />
        </div>

        <div className={actionBar}>
          <button
            type="button"
            className={btnClass({ kind: 'ghost' })}
            disabled={saving}
            onClick={() => {
              setError(null);
              setStep('names');
            }}
          >
            Back
          </button>
          <button
            type="button"
            className={cn(btnClass({ kind: 'primary' }), 'h-12 min-w-0 flex-1')}
            disabled={saving}
            onClick={startGame}
          >
            {saving ? 'Starting…' : 'Start game'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={pageFit} onSubmit={goToDealer}>
      <div className={pageFitHeader}>
        <h2 className={pageTitle}>New game</h2>
      </div>

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}

      <div className={pageFitBody}>
        <div className={cn(card, stackSm)}>
          <label className={field}>
            Game name
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Optional"
              maxLength={80}
            />
          </label>

          <h3 className={cn(sectionTitle, 'mt-1')}>
            Players
          </h3>
          {user ? (
            <p className={cn(hint, 'mb-1')}>
              Your seat is pre-filled — you can change the name; your account
              still links to that seat.
            </p>
          ) : null}

          <div className={stackSm}>
            {names.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className="min-w-0 flex-1"
                  value={name}
                  onChange={(e) => setName(i, e.target.value)}
                  placeholder="Name"
                  maxLength={40}
                  aria-label={`Player ${i + 1}`}
                />
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-btn border border-line-strong bg-surface text-xl leading-none text-grey-600 enabled:active:bg-sand-200 disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={() => removePlayer(i)}
                  disabled={names.length <= MIN}
                  aria-label="Remove player"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className={btnClass()}
            onClick={addPlayer}
            disabled={names.length >= MAX}
          >
            Add player
          </button>
        </div>
      </div>

      <div className={actionBar}>
        <button
          type="button"
          className={btnClass({ kind: 'ghost' })}
          onClick={() => navigate('/play/single')}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={cn(btnClass({ kind: 'primary' }), 'h-12 min-w-0 flex-1')}
        >
          Next
        </button>
      </div>
    </form>
  );
}

function shiftIndex(
  current: number | null,
  from: number,
  to: number,
): number | null {
  if (current == null) return current;
  if (current === from) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}
