import { newId } from './rules';

export const MAX_NOTE_LENGTH = 2000;
export const MAX_NOTES_PER_GAME = 100;

export type GameNote = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

function isNote(value: unknown): value is GameNote {
  if (!value || typeof value !== 'object') return false;
  if (
    !('id' in value) ||
    !('text' in value) ||
    !('createdAt' in value) ||
    !('updatedAt' in value)
  ) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/** Accept current list, legacy string notepad, or missing field. */
export function parseGameNotes(raw: unknown): GameNote[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      return parseGameNotes(JSON.parse(trimmed));
    } catch {
      return [
        {
          id: newId(),
          text: trimmed.slice(0, MAX_NOTE_LENGTH),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: GameNote[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const text = item.trim().slice(0, MAX_NOTE_LENGTH);
      if (!text) continue;
      const now = new Date().toISOString();
      out.push({ id: newId(), text, createdAt: now, updatedAt: now });
      continue;
    }
    if (isNote(item) && item.text.trim()) {
      out.push({
        id: item.id,
        text: item.text.trim().slice(0, MAX_NOTE_LENGTH),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }
  }
  return out.slice(0, MAX_NOTES_PER_GAME);
}

export function hasGameNotes(raw: unknown): boolean {
  return parseGameNotes(raw).length > 0;
}

export function createGameNote(text: string, at = new Date().toISOString()): GameNote {
  return {
    id: newId(),
    text: text.trim(),
    createdAt: at,
    updatedAt: at,
  };
}

export function assertGameNotes(notes: GameNote[]): GameNote[] {
  if (notes.length > MAX_NOTES_PER_GAME) {
    throw new Error(`At most ${MAX_NOTES_PER_GAME} notes`);
  }
  const ids = new Set<string>();
  for (const n of notes) {
    const text = n.text.trim();
    if (!text) throw new Error('Note text cannot be empty');
    if (text.length > MAX_NOTE_LENGTH) {
      throw new Error(`Notes must be ${MAX_NOTE_LENGTH} characters or fewer`);
    }
    if (ids.has(n.id)) throw new Error('Note ids must be unique');
    ids.add(n.id);
  }
  return notes.map((n) => ({
    ...n,
    text: n.text.trim(),
  }));
}
