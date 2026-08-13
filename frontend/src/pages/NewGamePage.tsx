import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { toUserMessage } from '../api/errors';
import { useAuth } from '../useAuth';
import { SuperScorerToggle } from '../components/SuperScorerToggle';

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
    if (!user?.username) return;
    setNames((prev) => {
      if (prev.some((n) => n.trim())) return prev;
      return prev.map((n, i) => (i === 0 ? user.username : n));
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
    setDealerIndex(cleaned.length - 1);
    setStep('dealer');
  }

  async function startGame() {
    setError(null);
    setSaving(true);
    try {
      // Seating order stays clockwise; rotate so chosen dealer is last
      // (API: last seat = round-1 dealer, first seat = left of dealer).
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
      <div className="page-fit">
        <div className="page-fit-header">
          <h2 className="page-title">Who deals first?</h2>
          <p className="lede">Tap the round-1 dealer. Seating order stays the same.</p>
        </div>

        {error && <div className="banner banner-inline">{error}</div>}

        <div className="page-fit-body">
          <div className="dealer-pick" role="radiogroup" aria-label="First dealer">
            {cleaned.map((name, i) => {
              const selected = dealerIndex === i;
              return (
                <button
                  key={`${name}-${i}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`dealer-option ${selected ? 'selected' : ''}`}
                  onClick={() => setDealerIndex(i)}
                >
                  <span className="dealer-radio" aria-hidden>
                    {selected ? (
                      <span className="dealer-radio-dot" />
                    ) : null}
                  </span>
                  <span className="dealer-name truncate">{name}</span>
                </button>
              );
            })}
          </div>

          <SuperScorerToggle
            on={superScorer}
            onToggle={() => setSuperScorer((v) => !v)}
          />
        </div>

        <div className="action-bar">
          <button
            type="button"
            className="btn ghost"
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
            className="btn primary block"
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
    <form className="page-fit" onSubmit={goToDealer}>
      <div className="page-fit-header">
        <h2 className="page-title">New game</h2>
      </div>

      {error && <div className="banner banner-inline">{error}</div>}

      <div className="page-fit-body">
        <div className="card stack-sm">
          <label className="field">
            Game name
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Optional"
              maxLength={80}
            />
          </label>

          <h3 className="section-title" style={{ marginTop: 4 }}>
            Players
          </h3>
          <p className="hint" style={{ margin: '0 0 4px' }}>
            Enter names in the order everyone is sitting.
            {user
              ? ' Your seat is pre-filled — you can change the name; your account still links to that seat.'
              : ''}
          </p>

          <div className="stack-sm">
            {names.map((name, i) => (
              <div key={i} className="player-name-row">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(i, e.target.value)}
                  placeholder="Name"
                  maxLength={40}
                  aria-label={`Player ${i + 1}`}
                />
                <button
                  type="button"
                  className="name-remove"
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
            className="btn"
            onClick={addPlayer}
            disabled={names.length >= MAX}
          >
            Add player
          </button>
        </div>
      </div>

      <div className="action-bar">
        <button
          type="button"
          className="btn ghost"
          onClick={() => navigate('/play/single')}
        >
          Cancel
        </button>
        <button type="submit" className="btn primary block">
          Next
        </button>
      </div>
    </form>
  );
}
