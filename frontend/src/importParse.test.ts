import { describe, expect, it } from 'vitest';
import type { GameDetail, RoundDetail, RoundEntry } from './api';
import {
  buildGameExportCsv,
  buildGameExportJson,
  buildGameExportXml,
} from './exportGameCsv';
import { validateImportDraft } from './importDraft';
import { parseExportCsv, parseExportJson, parseExportXml } from './importParse';

function entry(
  partial: Partial<RoundEntry> &
    Pick<RoundEntry, 'playerId' | 'playerName' | 'seatIndex'>,
): RoundEntry {
  return {
    bid: 0,
    tricksTaken: 0,
    points: 5,
    bidPosition: null,
    isDealer: false,
    isFirstBidder: false,
    isLastBidder: false,
    runningBidBefore: null,
    made: true,
    trickDelta: 0,
    absDelta: 0,
    isNilBid: true,
    isNilMade: true,
    cumulativeScore: 5,
    placeAfterRound: 1,
    scoreBehindLeader: 0,
    ...partial,
  };
}

function round(
  partial: Partial<RoundDetail> &
    Pick<RoundDetail, 'id' | 'number' | 'handSize' | 'entries'>,
): RoundDetail {
  return {
    dealerSeat: 0,
    firstBidderSeat: 1,
    forceBurn: false,
    dealerPlayerId: undefined,
    firstBidderPlayerId: undefined,
    bidOrderSeats: [],
    bidOrderPlayerIds: [],
    bidSum: null,
    bidDeficit: null,
    forbiddenLastBid: null,
    bidsCompletedAt: null,
    tricksCompletedAt: null,
    completedAt: null,
    editCount: 0,
    complete: true,
    ...partial,
  };
}

const HAND = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7] as const;

function fullGame(): GameDetail {
  const players = [
    { id: 'p0', name: 'Martin', seatIndex: 0 },
    { id: 'p1', name: 'Hansen', seatIndex: 1 },
  ];
  return {
    id: 'g1',
    name: 'Friday night',
    notes: [
      {
        id: 'n1',
        text: 'Imported',
        createdAt: '2026-08-21T18:00:00.000Z',
        updatedAt: '2026-08-21T18:00:00.000Z',
      },
    ],
    status: 'COMPLETED',
    phase: 'completed',
    currentRound: null,
    createdAt: '2026-08-21T18:00:00.000Z',
    startedAt: '2026-08-21T18:05:00.000Z',
    finishedAt: '2026-08-21T20:00:00.000Z',
    durationMs: null,
    playerCount: 2,
    firstDealerSeat: 1,
    winnerPlayerId: 'p0',
    winnerScore: 10,
    runnerUpScore: 4,
    winMargin: 6,
    totalForceBurns: 1,
    totalEdits: 0,
    players,
    standings: [],
    events: [],
    rounds: HAND.map((handSize, i) => {
      const number = i + 1;
      return round({
        id: `r${number}`,
        number,
        handSize,
        forceBurn: number === 6,
        entries: [
          entry({
            playerId: 'p0',
            playerName: 'Martin',
            seatIndex: 0,
            bid: 0,
            tricksTaken: handSize,
            points: -handSize,
            made: false,
          }),
          entry({
            playerId: 'p1',
            playerName: 'Hansen',
            seatIndex: 1,
            bid: 0,
            tricksTaken: 0,
            points: 5,
            made: true,
          }),
        ],
      });
    }),
  };
}

describe('parseExportCsv', () => {
  it('round-trips a complete CSV export', () => {
    const csv = buildGameExportCsv(fullGame(), 1);
    const draft = parseExportCsv(csv);
    expect(validateImportDraft(draft)).toEqual([]);
    expect(draft.players.map((p) => p.name)).toEqual(['Martin', 'Hansen']);
    expect(draft.rounds[5]?.forceBurn).toBe(true);
    expect(draft.rounds[0]?.entries[0]?.tricksTaken).toBe(7);
  });

  it('rejects a CSV missing required columns', () => {
    expect(() => parseExportCsv('Foo,Bar\n1,2\n')).toThrow(/missing column/);
  });
});

describe('parseExportXml', () => {
  it('round-trips XML export including notes', () => {
    const xml = buildGameExportXml(fullGame(), 1);
    const draft = parseExportXml(xml);
    expect(validateImportDraft(draft)).toEqual([]);
    expect(draft.name).toBe('Friday night');
    expect(draft.notes.map((n) => n.text)).toEqual(['Imported']);
    expect(draft.rounds).toHaveLength(13);
  });

  it('rejects the wrong root element', () => {
    expect(() => parseExportXml('<other></other>')).toThrow(/ohHeckExport/);
  });
});

describe('parseExportJson', () => {
  it('round-trips JSON export', () => {
    const json = buildGameExportJson(fullGame(), 1);
    const draft = parseExportJson(json);
    expect(validateImportDraft(draft)).toEqual([]);
    expect(draft.players).toHaveLength(2);
    expect(draft.rounds[12]?.handSize).toBe(7);
  });

  it('fails closed on invalid JSON', () => {
    expect(() => parseExportJson('not json')).toThrow(/not valid JSON/);
  });
});
