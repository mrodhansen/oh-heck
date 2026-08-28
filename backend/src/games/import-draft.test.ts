import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertImportDraft,
  extractJsonObject,
  parseUnknownImport,
} from './import-draft';

function validDraft() {
  const players = [
    { name: 'Abe', seatIndex: 0 },
    { name: 'Bea', seatIndex: 1 },
  ];
  const rounds = Array.from({ length: 13 }, (_, i) => {
    const number = i + 1;
    const handSize = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7][i]!;
    return {
      number,
      forceBurn: false,
      entries: [
        { seatIndex: 0, bid: 0, tricksTaken: handSize },
        { seatIndex: 1, bid: 0, tricksTaken: 0 },
      ],
    };
  });
  return { players, rounds };
}

describe('assertImportDraft', () => {
  it('accepts a full 13-round game', () => {
    expect(() => assertImportDraft(validDraft())).not.toThrow();
  });

  it('rejects tricks that do not sum to hand size', () => {
    const draft = validDraft();
    draft.rounds[0]!.entries[0]!.tricksTaken = 0;
    expect(() => assertImportDraft(draft)).toThrow(BadRequestException);
    expect(() => assertImportDraft(draft)).toThrow(/tricks must sum to 7/);
  });

  it('rejects missing rounds', () => {
    const draft = validDraft();
    draft.rounds.pop();
    expect(() => assertImportDraft(draft)).toThrow(/all 13 rounds/);
  });

  it('rejects duplicate player names', () => {
    const draft = validDraft();
    draft.players[1]!.name = 'abe';
    expect(() => assertImportDraft(draft)).toThrow(/unique/);
  });
});

describe('parseUnknownImport', () => {
  it('parses structured players/rounds JSON', () => {
    const draft = parseUnknownImport({
      name: 'Friday',
      gameDate: '2026-08-21',
      notes: ['great game'],
      players: [
        { name: 'Abe', position: 1 },
        { name: 'Bea', position: 2 },
      ],
      rounds: validDraft().rounds.map((r) => ({
        handNumber: r.number,
        forceBurn: r.forceBurn,
        scores: r.entries.map((e) => ({
          playerName: e.seatIndex === 0 ? 'Abe' : 'Bea',
          bid: e.bid,
          tricksTaken: e.tricksTaken,
        })),
      })),
    });
    expect(draft.name).toBe('Friday');
    expect(draft.gameDate).toBe('2026-08-21');
    expect(draft.noteTexts).toEqual(['great game']);
    expect(draft.players.map((p) => p.name)).toEqual(['Abe', 'Bea']);
    expect(draft.rounds).toHaveLength(13);
  });

  it('parses export row JSON', () => {
    const rows = [];
    for (const p of [
      { name: 'Abe', position: 1 },
      { name: 'Bea', position: 2 },
    ]) {
      for (let h = 1; h <= 13; h++) {
        const handSize = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7][h - 1]!;
        rows.push({
          playerName: p.name,
          playerPosition: p.position,
          handNumber: h,
          tricksBid: 0,
          tricksTaken: p.position === 1 ? handSize : 0,
          forcedBurnFlag: 'No',
        });
      }
    }
    const draft = parseUnknownImport({ rows });
    expect(draft.players).toHaveLength(2);
    expect(draft.rounds[0]?.entries[0]?.tricksTaken).toBe(7);
  });

  it('fails closed on non-object input', () => {
    expect(() => parseUnknownImport(null)).toThrow(/must be an object/);
  });
});

describe('extractJsonObject', () => {
  it('parses fenced JSON', () => {
    const raw = extractJsonObject('```json\n{"ok":true}\n```');
    expect(raw).toEqual({ ok: true });
  });

  it('fails when there is no JSON object', () => {
    expect(() => extractJsonObject('nope')).toThrow(/did not contain JSON/);
  });
});
