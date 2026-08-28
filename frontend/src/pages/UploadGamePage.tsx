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
    <div className="page-fit">
      <div className="page-fit-header">
        <div className="page-header">
          <h2 className="page-title">Upload game</h2>
          <Link to="/play/score" className="btn ghost sm">
            Back
          </Link>
        </div>
      </div>

      {error && <div className="banner banner-inline">{error}</div>}
      {reading && <div className="empty">Reading…</div>}

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
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <h3 className="page-title" style={{ fontSize: '1.2rem', margin: 0 }}>
              How do you want to add this game?
            </h3>
            <button
              type="button"
              className="btn mode-card"
              onClick={() => {
                setChoice('file');
                fileRef.current?.click();
              }}
            >
              <span className="mode-card-title">Upload game data?</span>
              <span className="mode-card-meta">XML, JSON, or CSV export</span>
            </button>
            <button
              type="button"
              className="btn mode-card"
              onClick={() => {
                setChoice('photo');
                photoRef.current?.click();
              }}
            >
              <span className="mode-card-title">Take picture of a scorecard?</span>
              <span className="mode-card-meta">Read the card with Grok</span>
            </button>
            <Link to="/play/score" className="btn ghost block">
              Cancel
            </Link>
          </div>
        </div>
      )}

      {draft && preview && !reading && (
        <div className="page-fit-body stack">
          <label className="field">
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

          <div className="stack-sm">
            {draft.players
              .slice()
              .sort((a, b) => a.seatIndex - b.seatIndex)
              .map((p) => (
                <label key={p.id} className="field">
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
            <div className="banner banner-inline">{validation[0]}</div>
          )}

          <Scoreboard
            game={preview}
            allowIncompleteEdit
            onEditRound={(n) => setEditRound(n)}
          />

          <section className="card stack-sm">
            <h3 className="section-title">Notes</h3>
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
        <div className="action-bar">
          <button type="button" className="btn ghost" onClick={resetChoice}>
            Start over
          </button>
          <button
            type="button"
            className="btn primary block"
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
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setConfirmOpen(false)}
        >
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              Are you sure you want to confirm?
            </p>
            <p className="hint" style={{ margin: 0 }}>
              This saves the game. You can still edit rounds after.
            </p>
            <div className="action-bar form-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={saving}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary block"
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
        <div className="page-fit-body">
          <button type="button" className="btn primary block" onClick={resetChoice}>
            Choose again
          </button>
        </div>
      )}
    </div>
  );
}
