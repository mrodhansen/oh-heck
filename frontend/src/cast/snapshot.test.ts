import { describe, expect, it } from 'vitest';
import type { GameDetail, RoundDetail, Standing } from '../api';
import {
  assertCastMessageSize,
  CAST_APP_ID,
  getCastAppId,
  isCastUserCancel,
  toCastBoardMessage,
} from './snapshot';

function standing(
  partial: Partial<Standing> & Pick<Standing, 'playerId'>,
): Standing {
  return {
    playerName: partial.playerName ?? 'P',
    seatIndex: partial.seatIndex ?? 0,
    total: partial.total ?? 0,
    place: partial.place ?? 1,
    roundsPlayed: 0,
    bidsMade: 0,
    ...partial,
  };
}

function round(
  partial: Partial<RoundDetail> & Pick<RoundDetail, 'id' | 'number' | 'handSize'>,
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
    complete: false,
    entries: [],
    ...partial,
  };
}

function game(partial?: Partial<GameDetail>): GameDetail {
  return {
    id: 'g1',
    name: 'TV board demo',
    notes: [],
    status: 'PLAYING',
    phase: 'tricks',
    currentRound: 11,
    createdAt: '2026-08-21T18:00:00.000Z',
    startedAt: '2026-08-21T18:05:00.000Z',
    finishedAt: null,
    durationMs: null,
    playerCount: 2,
    firstDealerSeat: 0,
    winnerPlayerId: null,
    winnerScore: null,
    runnerUpScore: null,
    winMargin: null,
    totalForceBurns: 0,
    totalEdits: 0,
    players: [
      { id: 'p0', name: 'Ada', seatIndex: 0 },
      { id: 'p1', name: 'Bo', seatIndex: 1 },
    ],
    standings: [
      standing({ playerId: 'p0', playerName: 'Ada', place: 1, total: 8 }),
      standing({ playerId: 'p1', playerName: 'Bo', place: 2, total: 2 }),
    ],
    events: [],
    rounds: [
      round({
        id: 'r11',
        number: 11,
        handSize: 5,
        entries: [
          {
            playerId: 'p0',
            playerName: 'Ada',
            seatIndex: 0,
            bid: 1,
            tricksTaken: null,
            points: null,
            bidPosition: 0,
            isDealer: false,
            isFirstBidder: true,
            isLastBidder: false,
            runningBidBefore: null,
            made: null,
            trickDelta: null,
            absDelta: null,
            isNilBid: null,
            isNilMade: null,
            cumulativeScore: null,
            placeAfterRound: null,
            scoreBehindLeader: null,
          },
        ],
      }),
    ],
    ...partial,
  };
}

describe('toCastBoardMessage', () => {
  it('sends a slim board the TV can render', () => {
    const msg = toCastBoardMessage(game());
    expect(msg.type).toBe('board');
    expect(msg.name).toBe('TV board demo');
    expect(msg.statusLine).toBe('Round 11 · 5 cards · Scoring');
    expect(msg.standings[0]?.playerName).toBe('Ada');
    expect(msg.rounds[0]?.entries[0]?.bid).toBe(1);
  });

  it('accepts a normal-sized payload', () => {
    expect(() => assertCastMessageSize(toCastBoardMessage(game()))).not.toThrow();
  });
});

describe('getCastAppId', () => {
  it('uses the registered Custom Receiver id', () => {
    expect(CAST_APP_ID).toBe('D18AB8E0');
    expect(getCastAppId()).toBe('D18AB8E0');
  });
});

describe('isCastUserCancel', () => {
  it('treats cancel as dismissed', () => {
    expect(isCastUserCancel('cancel')).toBe(true);
    expect(isCastUserCancel({ code: 'cancel' })).toBe(true);
    expect(isCastUserCancel(new Error('boom'))).toBe(false);
  });
});
