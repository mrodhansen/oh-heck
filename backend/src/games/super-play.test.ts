import { describe, expect, it } from 'vitest';
import { buildSuperPlay } from './super-play';

const players = [
  { id: 'p0', seatIndex: 0 },
  { id: 'p1', seatIndex: 1 },
  { id: 'p2', seatIndex: 2 },
];

describe('buildSuperPlay', () => {
  it('rejects out of turn and duplicate cards', () => {
    expect(() =>
      buildSuperPlay({
        playerCount: 3,
        firstLeadSeat: 0,
        handSize: 1,
        players,
        trumpCard: { s: 'H', r: '2' },
        plays: [{ playerId: 'p1', s: 'S', r: 'A' }],
      }),
    ).toThrow(/out of turn/);

    expect(() =>
      buildSuperPlay({
        playerCount: 3,
        firstLeadSeat: 0,
        handSize: 1,
        players,
        trumpCard: { s: 'H', r: '2' },
        plays: [{ playerId: 'p0', s: 'H', r: '2' }],
      }),
    ).toThrow(/already used/);
  });

  it('scores a completed 1-card round', () => {
    const v = buildSuperPlay({
      playerCount: 3,
      firstLeadSeat: 0,
      handSize: 1,
      players,
      trumpCard: { s: 'H', r: '2' },
      plays: [
        { playerId: 'p0', s: 'S', r: '9' },
        { playerId: 'p1', s: 'S', r: 'A' },
        { playerId: 'p2', s: 'C', r: '3' },
      ],
    });
    expect(v.roundComplete).toBe(true);
    expect(v.tricksTakenByPlayerId.p1).toBe(1);
    expect(v.tricksTakenByPlayerId.p0).toBe(0);
  });
});
