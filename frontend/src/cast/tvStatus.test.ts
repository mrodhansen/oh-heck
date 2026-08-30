import { describe, expect, it } from 'vitest';
import type { GameDetail, RoundDetail, Standing } from '../api';
import { tvBoardFingerprint, tvGameStatus } from './tvStatus';

function standing(partial: Partial<Standing> & Pick<Standing, 'playerId'>): Standing {
  return {
    playerName: partial.playerName ?? 'P',
    seatIndex: partial.seatIndex ?? 0,
    total: partial.total ?? 0,
    place: partial.place ?? 1,
    roundsPlayed: partial.roundsPlayed ?? 0,
    bidsMade: partial.bidsMade ?? 0,
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
    name: 'Friday',
    notes: [],
    status: 'BIDDING',
    phase: 'bidding',
    currentRound: 1,
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
      standing({ playerId: 'p0', playerName: 'Ada', seatIndex: 0, place: 1, total: 5 }),
      standing({ playerId: 'p1', playerName: 'Bo', seatIndex: 1, place: 2, total: 2 }),
    ],
    events: [],
    rounds: [round({ id: 'r1', number: 1, handSize: 7 })],
    ...partial,
  };
}

describe('tvGameStatus', () => {
  it('labels bidding', () => {
    expect(tvGameStatus(game())).toBe('Round 1 · 7 cards · Bidding');
  });

  it('labels scoring', () => {
    expect(tvGameStatus(game({ phase: 'tricks', status: 'PLAYING' }))).toBe(
      'Round 1 · 7 cards · Scoring',
    );
  });

  it('labels a finished game', () => {
    expect(
      tvGameStatus(
        game({
          phase: 'completed',
          status: 'COMPLETED',
          currentRound: null,
        }),
      ),
    ).toBe('Final');
  });

  it('fails if the current round is missing', () => {
    expect(() => tvGameStatus(game({ currentRound: 9, rounds: [] }))).toThrow(
      'Missing round 9',
    );
  });
});

describe('tvBoardFingerprint', () => {
  it('changes when a total changes', () => {
    const a = tvBoardFingerprint(game());
    const b = tvBoardFingerprint(
      game({
        standings: [
          standing({ playerId: 'p0', playerName: 'Ada', seatIndex: 0, place: 1, total: 12 }),
          standing({ playerId: 'p1', playerName: 'Bo', seatIndex: 1, place: 2, total: 2 }),
        ],
      }),
    );
    expect(a).not.toBe(b);
  });
});
