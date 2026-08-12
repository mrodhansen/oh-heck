import { describe, expect, it } from 'vitest';
import { parseGameNotes } from './notes';

describe('parseGameNotes', () => {
  it('returns empty for missing or blank values', () => {
    expect(parseGameNotes(undefined)).toEqual([]);
    expect(parseGameNotes('')).toEqual([]);
    expect(parseGameNotes('   ')).toEqual([]);
  });

  it('wraps a legacy notepad string as one note', () => {
    const notes = parseGameNotes('House rules: no talking');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.text).toBe('House rules: no talking');
    expect(notes[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('keeps a structured list', () => {
    const raw = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        text: '  first  ',
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
      },
    ];
    expect(parseGameNotes(raw)).toEqual([
      {
        id: raw[0].id,
        text: 'first',
        createdAt: raw[0].createdAt,
        updatedAt: raw[0].updatedAt,
      },
    ]);
  });
});
