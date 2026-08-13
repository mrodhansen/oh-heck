import { describe, expect, it } from 'vitest';
import {
  appendPlay,
  buildSuperPlay,
  cardKey,
  playOrderSeats,
  popPlay,
  winnerOfTrick,
} from './superPlay';

const players = [
  { id: 'p0', seatIndex: 0 },
  { id: 'p1', seatIndex: 1 },
  { id: 'p2', seatIndex: 2 },
];

function base(overrides: Partial<Parameters<typeof buildSuperPlay>[0]> = {}) {
  return {
    playerCount: 3,
    firstLeadSeat: 0,
    handSize: 2,
    players,
    trumpCard: { s: 'H' as const, r: '2' as const },
    plays: [],
    ...overrides,
  };
}

describe('winnerOfTrick', () => {
  it('highest lead suit wins when no trump', () => {
    const winner = winnerOfTrick(
      [
        { seat: 0, card: { s: 'S', r: '9' } },
        { seat: 1, card: { s: 'S', r: 'A' } },
        { seat: 2, card: { s: 'C', r: 'K' } },
      ],
      'S',
      'H',
    );
    expect(winner).toBe(1);
  });

  it('any trump beats lead suit', () => {
    const winner = winnerOfTrick(
      [
        { seat: 0, card: { s: 'S', r: 'A' } },
        { seat: 1, card: { s: 'H', r: '3' } },
        { seat: 2, card: { s: 'S', r: 'K' } },
      ],
      'S',
      'H',
    );
    expect(winner).toBe(1);
  });

  it('highest trump wins', () => {
    const winner = winnerOfTrick(
      [
        { seat: 0, card: { s: 'H', r: '5' } },
        { seat: 1, card: { s: 'H', r: 'J' } },
        { seat: 2, card: { s: 'S', r: 'A' } },
      ],
      'S',
      'H',
    );
    expect(winner).toBe(1);
  });
});

describe('playOrderSeats', () => {
  it('starts at lead and wraps left', () => {
    expect(playOrderSeats(2, 4)).toEqual([2, 3, 0, 1]);
  });
});

describe('buildSuperPlay', () => {
  it('first turn is first lead after trump', () => {
    const v = buildSuperPlay(base());
    expect(v.turnPlayerId).toBe('p0');
    expect(v.roundComplete).toBe(false);
    expect(v.usedKeys).toEqual(['2H']);
  });

  it('rejects play before trump', () => {
    expect(() =>
      buildSuperPlay(
        base({
          trumpCard: null,
          plays: [{ playerId: 'p0', s: 'S', r: 'A' }],
        }),
      ),
    ).toThrow(/Trump must be set/);
  });

  it('rejects out of turn', () => {
    expect(() =>
      appendPlay(base(), { playerId: 'p1', s: 'S', r: 'A' }),
    ).toThrow(/out of turn/);
  });

  it('rejects duplicate card and trump flip', () => {
    expect(() =>
      appendPlay(base(), { playerId: 'p0', s: 'H', r: '2' }),
    ).toThrow(/already used/);
    const afterLead = appendPlay(base(), { playerId: 'p0', s: 'S', r: 'A' });
    expect(() =>
      buildSuperPlay(
        base({
          plays: [
            { playerId: 'p0', s: 'S', r: 'A' },
            { playerId: 'p1', s: 'S', r: 'A' },
          ],
        }),
      ),
    ).toThrow(/already used/);
    expect(afterLead.turnPlayerId).toBe('p1');
  });

  it('resolves a trick and winner leads next', () => {
    const v = buildSuperPlay(
      base({
        plays: [
          { playerId: 'p0', s: 'S', r: '9' },
          { playerId: 'p1', s: 'S', r: 'A' },
          { playerId: 'p2', s: 'C', r: '3' },
        ],
      }),
    );
    expect(v.completed).toHaveLength(1);
    expect(v.completed[0]!.winnerPlayerId).toBe('p1');
    expect(v.tricksTakenByPlayerId.p1).toBe(1);
    expect(v.turnPlayerId).toBe('p1');
    expect(v.current?.leadSeat).toBe(1);
  });

  it('auto-fills tricks when the round is complete', () => {
    const v = buildSuperPlay(
      base({
        plays: [
          { playerId: 'p0', s: 'S', r: '9' },
          { playerId: 'p1', s: 'S', r: 'A' },
          { playerId: 'p2', s: 'C', r: '3' },
          { playerId: 'p1', s: 'D', r: 'K' },
          { playerId: 'p2', s: 'D', r: 'A' },
          { playerId: 'p0', s: 'H', r: '3' },
        ],
      }),
    );
    expect(v.roundComplete).toBe(true);
    expect(v.completed).toHaveLength(2);
    expect(v.turnPlayerId).toBeNull();
    expect(v.tricksTakenByPlayerId.p0).toBe(1);
    expect(v.tricksTakenByPlayerId.p1).toBe(1);
    expect(v.tricksTakenByPlayerId.p2).toBe(0);
    expect(
      v.tricksTakenBySeat.reduce((a, b) => a + b, 0),
    ).toBe(2);
  });

  it('undo pops last play then trump', () => {
    const withPlay = {
      ...base(),
      plays: [{ playerId: 'p0' as const, s: 'S' as const, r: 'A' as const }],
    };
    const popped = popPlay(withPlay);
    expect(popped.popped).toEqual({ playerId: 'p0', s: 'S', r: 'A' });
    expect(popped.next.turnPlayerId).toBe('p0');
    const cleared = popPlay({ ...base(), plays: [] });
    expect(cleared.trumpCleared).toBe(true);
    expect(cleared.next.trumpCard).toBeNull();
  });
});

describe('cardKey', () => {
  it('is rank then suit', () => {
    expect(cardKey({ s: 'H', r: 'A' })).toBe('AH');
  });
});
