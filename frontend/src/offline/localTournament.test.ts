import { describe, expect, it } from 'vitest';
import {
  createLocalTournament,
  localAddPlayer,
  localRemovePlayer,
  localSeatTables,
  localStartTable,
  toTournamentSummary,
} from './localTournament';

describe('localTournament', () => {
  it('creates open tournament', () => {
    const t = createLocalTournament({
      id: '11111111-1111-4111-8111-111111111111',
      targetPlayerCount: 4,
      name: 'Friday',
    });
    expect(t.status).toBe('OPEN');
    expect(t.targetPlayerCount).toBe(4);
    expect(t.name).toBe('Friday');
    expect(toTournamentSummary(t).playerCount).toBe(0);
  });

  it('adds and removes players offline', () => {
    let t = createLocalTournament({
      id: '11111111-1111-4111-8111-111111111111',
      targetPlayerCount: 3,
    });
    t = localAddPlayer(t, 'Alice', '22222222-2222-4222-8222-222222222222');
    t = localAddPlayer(t, 'Bob', '33333333-3333-4333-8333-333333333333');
    expect(t.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(t.proposedTableSizes).toEqual([2]);

    t = localRemovePlayer(t, '22222222-2222-4222-8222-222222222222');
    expect(t.players.map((p) => p.name)).toEqual(['Bob']);
  });

  it('grows target when roster exceeds it', () => {
    let t = createLocalTournament({
      id: '11111111-1111-4111-8111-111111111111',
      targetPlayerCount: 2,
    });
    t = localAddPlayer(t, 'A', '22222222-2222-4222-8222-222222222222');
    t = localAddPlayer(t, 'B', '33333333-3333-4333-8333-333333333333');
    t = localAddPlayer(t, 'C', '44444444-4444-4444-8444-444444444444');
    expect(t.targetPlayerCount).toBe(3);
  });

  it('seats and starts a table offline', () => {
    let t = createLocalTournament({
      id: '11111111-1111-4111-8111-111111111111',
      targetPlayerCount: 4,
    });
    const ids = [
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
    ];
    for (let i = 0; i < 4; i++) {
      t = localAddPlayer(t, `P${i}`, ids[i]!);
    }
    const seated = localSeatTables(t);
    expect(seated.tournament.status).toBe('SEATED');
    expect(seated.plan.length).toBe(1);
    expect(seated.plan[0]!.seats).toHaveLength(4);

    const started = localStartTable(seated.tournament, seated.plan[0]!.id, {
      gameId: '66666666-6666-4666-8666-666666666666',
      playerIds: [
        '77777777-7777-4777-8777-777777777777',
        '88888888-8888-4888-8888-888888888888',
        '99999999-9999-4999-8999-999999999999',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ],
    });
    expect(started.tournament.status).toBe('IN_PROGRESS');
    expect(started.game.tournamentId).toBe(t.id);
    expect(started.game.players).toHaveLength(4);
    expect(started.game.status).toBe('BIDDING');
  });

  it('rejects seat before target met', () => {
    let t = createLocalTournament({
      id: '11111111-1111-4111-8111-111111111111',
      targetPlayerCount: 4,
    });
    t = localAddPlayer(t, 'A', '22222222-2222-4222-8222-222222222222');
    expect(() => localSeatTables(t)).toThrow(/at least 4/);
  });
});
