import { describe, expect, it } from 'vitest';
import type { GameDetail, RoundDetail, RoundEntry } from './api';
import {
  buildGameExportCsv,
  gameExportDate,
  gameExportFilename,
} from './exportGameCsv';

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

function game(partial?: Partial<GameDetail>): GameDetail {
  return {
    id: 'g1',
    name: null,
    notes: [],
    status: 'COMPLETED',
    phase: 'completed',
    currentRound: null,
    createdAt: '2026-08-21T18:00:00.000Z',
    startedAt: '2026-08-21T18:05:00.000Z',
    finishedAt: '2026-08-21T20:00:00.000Z',
    durationMs: null,
    playerCount: 2,
    firstDealerSeat: 0,
    winnerPlayerId: 'p0',
    winnerScore: 10,
    runnerUpScore: 4,
    winMargin: 6,
    totalForceBurns: 1,
    totalEdits: 0,
    players: [
      { id: 'p0', name: 'Martin', seatIndex: 0 },
      { id: 'p1', name: 'Hansen', seatIndex: 1 },
    ],
    standings: [],
    events: [],
    rounds: [
      round({
        id: 'r1',
        number: 1,
        handSize: 7,
        forceBurn: false,
        entries: [
          entry({
            playerId: 'p0',
            playerName: 'Martin',
            seatIndex: 0,
            bid: 0,
            tricksTaken: 0,
            points: 5,
            made: true,
          }),
          entry({
            playerId: 'p1',
            playerName: 'Hansen',
            seatIndex: 1,
            bid: 0,
            tricksTaken: 1,
            points: -1,
            made: false,
          }),
        ],
      }),
      round({
        id: 'r2',
        number: 2,
        handSize: 6,
        forceBurn: true,
        entries: [
          entry({
            playerId: 'p0',
            playerName: 'Martin',
            seatIndex: 0,
            bid: 3,
            tricksTaken: 3,
            points: 8,
            made: true,
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
      }),
    ],
    ...partial,
  };
}

describe('buildGameExportCsv', () => {
  it('matches the score-sheet column layout and row order', () => {
    const csv = buildGameExportCsv(game(), 1);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'Game Number,Game Date,Player Name,Player Position,Hand Number,Cards Dealt,Tricks Bid,Tricks Taken,Forced Burn Flag,Hand Status,Hand Score',
    );
    const date = gameExportDate(game());
    expect(lines[1]).toBe(`1,${date},Martin,1,1,7,0,0,No,Made Bid,5`);
    expect(lines[2]).toBe(`1,${date},Martin,1,2,6,3,3,Yes,Made Bid,8`);
    expect(lines[3]).toBe(`1,${date},Hansen,2,1,7,0,1,No,Burn,-1`);
    expect(lines[4]).toBe(`1,${date},Hansen,2,2,6,0,0,Yes,Made Bid,5`);
  });

  it('escapes commas in player names', () => {
    const g = game({
      players: [
        { id: 'p0', name: 'Martin, Jr.', seatIndex: 0 },
        { id: 'p1', name: 'Hansen', seatIndex: 1 },
      ],
      rounds: [
        round({
          id: 'r1',
          number: 1,
          handSize: 1,
          entries: [
            entry({
              playerId: 'p0',
              playerName: 'Martin, Jr.',
              seatIndex: 0,
            }),
          ],
        }),
      ],
    });
    const line = buildGameExportCsv(g).trimEnd().split('\n')[1];
    expect(line).toContain('"Martin, Jr."');
  });

  it('skips incomplete hand entries', () => {
    const g = game({
      rounds: [
        round({
          id: 'r1',
          number: 1,
          handSize: 7,
          complete: false,
          entries: [
            entry({
              playerId: 'p0',
              playerName: 'Martin',
              seatIndex: 0,
              bid: 1,
              tricksTaken: null,
              points: null,
              made: null,
            }),
          ],
        }),
      ],
    });
    const lines = buildGameExportCsv(g).trimEnd().split('\n');
    expect(lines).toHaveLength(1);
  });
});

describe('gameExportFilename', () => {
  it('uses oh-heck-YYYY-MM-DD-game-N.csv', () => {
    const g = game();
    expect(gameExportFilename(g, 1)).toBe(
      `oh-heck-${gameExportDate(g)}-game-1.csv`,
    );
  });
});
