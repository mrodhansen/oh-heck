import { Prisma } from '@prisma/client';

export type GameNote = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

function isNote(value: unknown): value is GameNote {
  if (!value || typeof value !== 'object') return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    typeof n.text === 'string' &&
    typeof n.createdAt === 'string' &&
    typeof n.updatedAt === 'string'
  );
}

/** Accept stored JSON, a legacy string, or an array of note objects. */
export function asNotes(raw: Prisma.JsonValue | string | null | undefined): GameNote[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      return asNotes(JSON.parse(trimmed) as Prisma.JsonValue);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(isNote);
}

export function hasNotes(raw: Prisma.JsonValue | string | null | undefined): boolean {
  return asNotes(raw).length > 0;
}
