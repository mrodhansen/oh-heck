import { describe, expect, it } from 'vitest';
import {
  matchingClaimablePlayers,
  type ClaimableGame,
} from './auth';

function game(players: ClaimableGame['players']): ClaimableGame {
  return {
    id: 'g1',
    name: 'Game 1',
    status: 'COMPLETED',
    playMode: 'IN_PERSON',
    createdAt: '2013-11-30T18:00:00.000Z',
    finishedAt: '2013-11-30T19:30:00.000Z',
    players,
  };
}

describe('matchingClaimablePlayers', () => {
  const user = {
    username: 'jeremiah',
    firstName: 'Jeremiah',
    lastName: 'Hansen',
  };

  it('matches the unclaimed Jeremiah seat, not Jr.', () => {
    const seats = matchingClaimablePlayers(
      game([
        {
          id: 'a',
          name: 'Jeremiah Jr.',
          seatIndex: 0,
          userId: null,
          claimable: true,
        },
        {
          id: 'b',
          name: 'Jeremiah',
          seatIndex: 1,
          userId: null,
          claimable: true,
        },
      ]),
      user,
    );
    expect(seats.map((p) => p.id)).toEqual(['b']);
  });

  it('skips already-claimed seats', () => {
    const seats = matchingClaimablePlayers(
      game([
        {
          id: 'b',
          name: 'Jeremiah',
          seatIndex: 1,
          userId: 'u1',
          claimable: false,
        },
      ]),
      user,
    );
    expect(seats).toEqual([]);
  });
});
