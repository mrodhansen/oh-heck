import { FormEvent, useEffect, useState } from 'react';
import type { GameNote } from '../api';
import { toUserMessage } from '../api/errors';
import {
  MAX_NOTE_LENGTH,
  MAX_NOTES_PER_GAME,
  createGameNote,
} from '../offline/notes';
import {
  banner,
  btnClass,
  card,
  cn,
  empty,
  field,
  list,
  panelScroll,
} from '../ui';

type Props = {
  notes: GameNote[];
  readOnly?: boolean;
  onSave: (notes: GameNote[]) => Promise<void>;
};

export function GameNotes({ notes, readOnly = false, onSave }: Props) {
  const [items, setItems] = useState(notes);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (saving || editingId) return;
    setItems(notes);
  }, [notes, saving, editingId]);

  async function commit(next: GameNote[]) {
    setSaving(true);
    setError(null);
    setItems(next);
    try {
      await onSave(next);
    } catch (e) {
      setItems(notes);
      setError(toUserMessage(e, 'Failed to save notes'));
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || saving) return;
    if (items.length >= MAX_NOTES_PER_GAME) {
      setError(`At most ${MAX_NOTES_PER_GAME} notes`);
      return;
    }
    try {
      await commit([createGameNote(text), ...items]);
      setDraft('');
    } catch {
      /* error already set */
    }
  }

  async function saveEdit() {
    if (!editingId || saving) return;
    const text = editText.trim();
    if (!text) {
      setError('Note cannot be empty');
      return;
    }
    try {
      const now = new Date().toISOString();
      await commit(
        items.map((n) =>
          n.id === editingId ? { ...n, text, updatedAt: now } : n,
        ),
      );
      setEditingId(null);
      setEditText('');
    } catch {
      /* error already set */
    }
  }

  function startEdit(note: GameNote) {
    setError(null);
    setEditingId(note.id);
    setEditText(note.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
    setError(null);
  }

  const canAdd =
    !editingId &&
    draft.trim().length > 0 &&
    items.length < MAX_NOTES_PER_GAME;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
      {!readOnly && (
        <form className="flex shrink-0 flex-col gap-2" onSubmit={addNote}>
          <label className={field}>
            New note
            <textarea
              className="min-h-notes"
              value={draft}
              maxLength={MAX_NOTE_LENGTH}
              rows={3}
              placeholder="Write a note…"
              disabled={saving || editingId != null}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void addNote(e);
                }
              }}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className={btnClass({ kind: 'primary' })}
              disabled={saving || !canAdd}
            >
              {saving && !editingId ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {error && <div className={cn(banner, 'shrink-0')}>{error}</div>}

      <div className={panelScroll}>
        {items.length === 0 ? (
          <div className={cn(card, empty)}>No notes yet.</div>
        ) : (
          <div className={list}>
            {items.map((note) => {
              const editing = editingId === note.id;
              return (
                <div
                  key={note.id}
                  className="flex flex-col gap-2 border-b border-line px-3.5 py-3 last:border-b-0"
                >
                  {editing ? (
                    <>
                      <label className={field}>
                        Edit note
                        <textarea
                          value={editText}
                          maxLength={MAX_NOTE_LENGTH}
                          rows={3}
                          disabled={saving}
                          autoFocus
                          onChange={(e) => {
                            setEditText(e.target.value);
                            setError(null);
                          }}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                              e.preventDefault();
                              void saveEdit();
                            }
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                      </label>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className={btnClass({ kind: 'ghost', size: 'sm' })}
                          disabled={saving}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={btnClass({ kind: 'primary', size: 'sm' })}
                          disabled={saving || !editText.trim()}
                          onClick={() => void saveEdit()}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="m-0 wrap-anywhere whitespace-pre-wrap leading-snug">
                        {note.text}
                      </p>
                      {!readOnly && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className={btnClass({ kind: 'ghost', size: 'sm' })}
                            disabled={saving || editingId != null}
                            onClick={() => startEdit(note)}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
