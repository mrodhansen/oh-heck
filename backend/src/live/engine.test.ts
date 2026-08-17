import { describe, expect, it } from 'vitest';
import { legalPlays, winnerOfTrick } from './cards';
import { dealRound, engineFromScorecard, placeBid, playCard } from './engine';

describe('winnerOfTrick', () => {
  it('highest trump wins over higher lead suit', () => {
    const w = winnerOfTrick(
      [
        { seat: 0, card: { s: 'S', r: 'A' } },
        { seat: 1, card: { s: 'H', r: '2' } },
      ],
      'S',
      'H',
    );
    expect(w).toBe(1);
  });

  it('highest lead suit wins when no trump', () => {
    const w = winnerOfTrick(
      [
        { seat: 0, card: { s: 'S', r: '9' } },
        { seat: 1, card: { s: 'S', r: 'K' } },
        { seat: 2, card: { s: 'D', r: 'A' } },
      ],
      'S',
      'H',
    );
    expect(w).toBe(1);
  });
});

describe('legalPlays', () => {
  const hand = [
    { s: 'H' as const, r: 'A' as const },
    { s: 'S' as const, r: '2' as const },
  ];
  it('must follow suit when holding lead', () => {
    expect(legalPlays(hand, 'S').map((c) => c.s)).toEqual(['S']);
  });
  it('any card when void', () => {
    expect(legalPlays(hand, 'D')).toHaveLength(2);
  });
});

describe('placeBid last restriction', () => {
  it('rejects last bid that equals hand size total', () => {
    let s = dealRound({
      playerCount: 2,
      roundNumber: 1,
      handSize: 3,
      dealerSeat: 1,
      bidOrder: [0, 1],
    });
    s = placeBid(s, 0, 2, false, null);
    expect(() => placeBid(s, 1, 1, false, 1)).toThrow(/Can't bid/);
  });

  it('allows other last bids and starts play', () => {
    let s = dealRound({
      playerCount: 2,
      roundNumber: 1,
      handSize: 3,
      dealerSeat: 1,
      bidOrder: [0, 1],
    });
    s = placeBid(s, 0, 2, false, null);
    s = placeBid(s, 1, 0, false, 1);
    expect(s.phase).toBe('playing');
    expect(s.turnSeat).toBe(0);
  });
});

describe('playCard follow suit', () => {
  it('rejects off-suit when holding lead suit', () => {
    let s = dealRound({
      playerCount: 2,
      roundNumber: 7,
      handSize: 1,
      dealerSeat: 1,
      bidOrder: [0, 1],
    });
    // Force known hands
    s = {
      ...s,
      phase: 'playing',
      bids: [0, 0],
      hands: [
        [{ s: 'H', r: 'A' }],
        [
          { s: 'H', r: 'K' },
          { s: 'S', r: '2' },
        ],
      ],
      handSize: 1,
      currentTrick: { leadSeat: 0, plays: [] },
      turnSeat: 0,
      trumpSuit: 'C',
      trumpCard: { s: 'C', r: '2' },
    };
    // seat 1 has 2 cards but handSize 1 — simplify: seat 0 leads H, seat 1 has H and S
    s = {
      ...s,
      hands: [
        [{ s: 'S', r: 'A' }],
        [
          { s: 'H', r: 'K' },
          { s: 'S', r: '2' },
        ],
      ],
      handSize: 2,
      tricksTaken: [0, 0],
    };
    // Actually for 2 cards hand:
    s = dealRound({
      playerCount: 2,
      roundNumber: 6,
      handSize: 2,
      dealerSeat: 1,
      bidOrder: [0, 1],
    });
    s = {
      ...s,
      phase: 'playing',
      bids: [0, 0],
      hands: [
        [
          { s: 'H', r: 'A' },
          { s: 'D', r: '3' },
        ],
        [
          { s: 'H', r: 'K' },
          { s: 'S', r: '2' },
        ],
      ],
      currentTrick: { leadSeat: 0, plays: [] },
      turnSeat: 0,
      trumpSuit: 'C',
    };
    s = playCard(s, 0, { s: 'H', r: 'A' });
    expect(() => playCard(s, 1, { s: 'S', r: '2' })).toThrow(/follow suit/);
    s = playCard(s, 1, { s: 'H', r: 'K' });
    expect(s.lastTrick?.winnerSeat).toBe(0);
  });
});

describe('engineFromScorecard', () => {
  it('rebuilds bidding from RoundEntry bids and dealt hands', () => {
    const state = engineFromScorecard({
      sessionStatus: 'PLAYING',
      players: [
        { id: 'p0', seatIndex: 0 },
        { id: 'p1', seatIndex: 1 },
      ],
      rounds: [
        {
          number: 1,
          handSize: 2,
          dealerSeat: 1,
          forceBurn: false,
          trumpSuit: 'H',
          trumpCard: { s: 'H', r: '2' },
          currentTrick: null,
          bidOrderSeats: [0, 1],
          completedAt: null,
          dealtAt: new Date(),
          entries: [
            {
              playerId: 'p0',
              bid: 1,
              dealtHand: [
                { s: 'S', r: 'A' },
                { s: 'D', r: '3' },
              ],
            },
            {
              playerId: 'p1',
              bid: null,
              dealtHand: [
                { s: 'H', r: 'K' },
                { s: 'C', r: '9' },
              ],
            },
          ],
          tricks: [],
        },
      ],
    });
    expect(state.phase).toBe('bidding');
    expect(state.bids).toEqual([1, null]);
    expect(state.bidIndex).toBe(1);
    expect(state.hands[0]).toHaveLength(2);
  });

  it('subtracts completed and current plays from remaining hands', () => {
    const state = engineFromScorecard({
      sessionStatus: 'PLAYING',
      players: [
        { id: 'p0', seatIndex: 0 },
        { id: 'p1', seatIndex: 1 },
      ],
      rounds: [
        {
          number: 1,
          handSize: 2,
          dealerSeat: 1,
          forceBurn: false,
          trumpSuit: 'C',
          trumpCard: { s: 'C', r: '2' },
          currentTrick: {
            leadSeat: 1,
            plays: [
              {
                playOrder: 0,
                seatIndex: 1,
                playerId: 'p1',
                s: 'H',
                r: 'K',
                key: 'KH',
                followedSuit: true,
                playedTrump: false,
              },
            ],
          },
          bidOrderSeats: [0, 1],
          completedAt: null,
          dealtAt: new Date(),
          entries: [
            {
              playerId: 'p0',
              bid: 1,
              dealtHand: [
                { s: 'S', r: 'A' },
                { s: 'H', r: 'A' },
              ],
            },
            {
              playerId: 'p1',
              bid: 0,
              dealtHand: [
                { s: 'H', r: 'K' },
                { s: 'S', r: '2' },
              ],
            },
          ],
          tricks: [
            {
              trickIndex: 0,
              leadSeat: 0,
              leadSuit: 'S',
              winnerSeat: 0,
              plays: [
                {
                  playOrder: 0,
                  seatIndex: 0,
                  cardSuit: 'S',
                  cardRank: 'A',
                },
                {
                  playOrder: 1,
                  seatIndex: 1,
                  cardSuit: 'S',
                  cardRank: '2',
                },
              ],
            },
          ],
        },
      ],
    });
    expect(state.phase).toBe('playing');
    expect(state.tricksPlayed).toBe(1);
    expect(state.tricksTaken).toEqual([1, 0]);
    expect(state.hands[0]).toEqual([{ s: 'H', r: 'A' }]);
    expect(state.hands[1]).toEqual([]);
    expect(state.turnSeat).toBe(0);
  });
});
