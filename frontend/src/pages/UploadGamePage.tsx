import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { toUserMessage } from '../api/errors';
import { EditRoundModal } from '../components/EditRoundModal';
import { GameNotes } from '../components/GameNotes';
import { Scoreboard } from '../components/Scoreboard';
import { compressScorecardImage } from '../compressScorecardImage';
import {
  draftFromParsed,
  draftToImportBody,
  draftToPreviewGame,
  validateImportDraft,
  type ImportDraft,
} from '../importDraft';
import { parseExportFile } from '../importParse';
import { newId } from '../offline/rules';
import { isApiReady } from '../offline/sync';
import {
  actionBar,
  banner,
  btnClass,
  card,
  cn,
  empty,
  field,
  hint,
  modal,
  modalBackdrop,
  modeCard,
  modeCardMeta,
  modeCardTitle,
  pageFit,
  pageFitBody,
  pageFitHeader,
  pageHeader,
  pageTitle,
  sectionTitle,
  stack,
  stackSm,
} from '../ui';

type Choice = 'file' | 'photo' | null;

export function UploadGamePage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [choiceOpen, setChoiceOpen] = useState(true);
  const [choice, setChoice] = useState<Choice>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [editRound, setEditRound] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetChoice() {
    setChoiceOpen(true);
    setChoice(null);
    setDraft(null);
    setError(null);
    setConfirmOpen(false);
  }

  async function onFile(file: File) {
    setError(null);
    setReading(true);
    try {
      const text = await file.text();
      const parsed = parseExportFile(file.name, text);
      parsed.aiImport = false;
      setDraft(parsed);
      setChoiceOpen(false);
    } catch (e) {
      setError(toUserMessage(e, 'Could not read that file'));
    } finally {
      setReading(false);
    }
  }

  async function onPhoto(file: File) {
    setError(null);
    if (!isApiReady()) {
      setError('Photo import needs a connection');
      return;
    }
    setReading(true);
    try {
      const image = await compressScorecardImage(file);
      const parsed = await api.parseScorecardImage(image);
      setDraft(draftFromParsed(parsed, true));
      setChoiceOpen(false);
    } catch (e) {
      setError(toUserMessage(e, 'Could not read that scorecard'));
    } finally {
      setReading(false);
    }
  }

  const preview = draft ? draftToPreviewGame(draft) : null;
  const validation = draft ? validateImportDraft(draft) : [];
  const canConfirm = !!draft && validation.length === 0 && !saving;

  async function confirmImport() {
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      const body = draftToImportBody(draft);
      const game = await api.importGame({
        ...body,
        id: newId(),
        playerIds: draft.players
          .slice()
          .sort((a, b) => a.seatIndex - b.seatIndex)
          .map((p) => p.id),
      });
      navigate(`/games/${game.id}`);
    } catch (e) {
      setError(toUserMessage(e, 'Could not save imported game'));
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className={pageFit}>
      <div className={pageFitHeader}>
        <div className={pageHeader}>
          <h2 className={pageTitle}>Upload game</h2>
          <Link to="/play/score" className={btnClass({ kind: 'ghost', size: 'sm' })}>
            Back
          </Link>
        </div>
      </div>

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}
      {reading && <div className={empty}>Reading…</div>}

      <input
        ref={fileRef}
        type="file"
        accept=".xml,.json,.csv,text/xml,application/json,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onFile(file);
        }}
      />
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onPhoto(file);
        }}
      />

      {choiceOpen && !reading && (
        <div className={modalBackdrop} role="dialog" aria-modal="true">
          <div className={cn(modal, stack)} onClick={(e) => e.stopPropagation()}>
            <h3 className={cn(pageTitle, 'm-0 text-mode')}>
              How do you want to add this game?
            </h3>
            <button
              type="button"
              className={cn(modeCard, 'cursor-pointer')}
              onClick={() => {
                setChoice('file');
                fileRef.current?.click();
              }}
            >
              <span className={modeCardTitle}>Upload game data?</span>
              <span className={modeCardMeta}>XML, JSON, or CSV export</span>
            </button>
            <button
              type="button"
              className={cn(modeCard, 'cursor-pointer')}
              onClick={() => {
                setChoice('photo');
                photoRef.current?.click();
              }}
            >
              <span className={modeCardTitle}>Take picture of a scorecard?</span>
              <span className={modeCardMeta}>Read the card with Grok</span>
            </button>
            <Link to="/play/score" className={btnClass({ kind: 'ghost', block: true })}>
              Cancel
            </Link>
          </div>
        </div>
      )}

      {draft && preview && !reading && (
        <div className={cn(pageFitBody, stack)}>
          <label className={field}>
            Game name
            <input
              type="text"
              maxLength={80}
              value={draft.name ?? ''}
              placeholder="Optional"
              onChange={(e) =>
                setDraft({ ...draft, name: e.target.value || null })
              }
            />
          </label>

          <div className={stackSm}>
            {draft.players
              .slice()
              .sort((a, b) => a.seatIndex - b.seatIndex)
              .map((p) => (
                <label key={p.id} className={field}>
                  Seat {p.seatIndex + 1}
                  <input
                    type="text"
                    maxLength={40}
                    value={p.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        players: draft.players.map((x) =>
                          x.id === p.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
          </div>

          {validation.length > 0 && (
            <div className={cn(banner, 'shrink-0')}>{validation[0]}</div>
          )}

          <Scoreboard
            game={preview}
            allowIncompleteEdit
            onEditRound={(n) => setEditRound(n)}
          />

          <section className={cn(card, stackSm)}>
            <h3 className={sectionTitle}>Notes</h3>
            <GameNotes
              notes={draft.notes}
              onSave={async (notes) => {
                setDraft({ ...draft, notes });
              }}
            />
          </section>
        </div>
      )}

      {draft && preview && !reading && (
        <div className={actionBar}>
          <button type="button" className={btnClass({ kind: 'ghost' })} onClick={resetChoice}>
            Start over
          </button>
          <button
            type="button"
            className={cn(btnClass({ kind: 'primary' }), 'h-12 min-w-0 flex-1')}
            disabled={!canConfirm}
            onClick={() => setConfirmOpen(true)}
          >
            Confirm
          </button>
        </div>
      )}

      {editRound != null && preview && draft && (
        <EditRoundModal
          game={preview}
          roundNumber={editRound}
          allowIncomplete
          onClose={() => setEditRound(null)}
          onSave={async (payload) => {
            setDraft({
              ...draft,
              rounds: draft.rounds.map((r) => {
                if (r.number !== editRound) return r;
                return {
                  ...r,
                  forceBurn: payload.forceBurn,
                  entries: r.entries.map((e) => {
                    const bid = payload.bids.find((b) => b.playerId === e.playerId);
                    const tricks = payload.tricks.find(
                      (t) => t.playerId === e.playerId,
                    );
                    if (!bid || !tricks) {
                      throw new Error('Missing bid or tricks for a player');
                    }
                    return {
                      ...e,
                      bid: bid.bid,
                      tricksTaken: tricks.tricksTaken,
                    };
                  }),
                };
              }),
            });
          }}
        />
      )}

      {confirmOpen && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setConfirmOpen(false)}
        >
          <div className={cn(modal, stack)} onClick={(e) => e.stopPropagation()}>
            <p className="m-0 font-semibold">
              Are you sure you want to confirm?
            </p>
            <p className={cn(hint, 'm-0')}>
              This saves the game. You can still edit rounds after.
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className={btnClass({ kind: 'ghost' })}
                disabled={saving}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(btnClass({ kind: 'primary' }), 'h-12 min-w-0 flex-1')}
                disabled={saving}
                onClick={() => void confirmImport()}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {choice && !draft && !reading && !choiceOpen && (
        <div className={pageFitBody}>
          <button
            type="button"
            className={btnClass({ kind: 'primary', block: true })}
            onClick={resetChoice}
          >
            Choose again
          </button>
        </div>
      )}
    </div>
  );
}
