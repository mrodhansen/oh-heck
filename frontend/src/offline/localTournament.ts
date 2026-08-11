import type {
  GameDetail,
  TournamentDetail,
  TournamentPlayer,
  TournamentSummary,
  TournamentTable,
} from '../api';
import {
  balanceTableSizes,
  shuffleInPlace,
} from '../../../backend/src/tournaments/table-balance';
import { createLocalGame } from './localEngine';
import { newId } from './rules';

const DEFAULTS = {
  preferredTableSize: 7,
  minTableSize: 2,
  maxTableSize: 7,
  highTableSize: 7,
} as const;

function proposedSeating(t: TournamentDetail): {
  proposedTableSizes: number[] | null;
  proposedTableSizesError: string | null;
} {
  if (t.status !== 'OPEN' || t.players.length < 2) {
    return { proposedTableSizes: null, proposedTableSizesError: null };
  }
  try {
    return {
      proposedTableSizes: balanceTableSizes(
        t.players.length,
        t.preferredTableSize,
        t.minTableSize,
        t.maxTableSize,
      ),
      proposedTableSizesError: null,
    };
  } catch (e) {
    return {
      proposedTableSizes: null,
      proposedTableSizesError:
        e instanceof Error ? e.message : 'Cannot balance tables for this roster',
    };
  }
}

export function toTournamentSummary(t: TournamentDetail): TournamentSummary {
  const tablesCompleted = t.tables.filter(
    (tb) => tb.status === 'COMPLETED' || tb.gameStatus === 'COMPLETED',
  ).length;
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    targetPlayerCount: t.targetPlayerCount,
    playerCount: t.players.length,
    tableCount: t.tables.length,
    tablesCompleted,
    preferredTableSize: t.preferredTableSize,
    createdAt: t.createdAt,
    seatedAt: t.seatedAt,
    startedAt: t.startedAt,
    highTableAt: t.highTableAt,
    finishedAt: t.finishedAt,
  };
}

function withProposed(t: TournamentDetail): TournamentDetail {
  const prop = proposedSeating(t);
  return {
    ...t,
    playerCount: t.players.length,
    proposedTableSizes: prop.proposedTableSizes,
    proposedTableSizesError: prop.proposedTableSizesError,
  };
}

export function createLocalTournament(args: {
  id: string;
  targetPlayerCount: number;
  name?: string;
}): TournamentDetail {
  if (
    !Number.isInteger(args.targetPlayerCount) ||
    args.targetPlayerCount < 2 ||
    args.targetPlayerCount > 49
  ) {
    throw new Error('Need 2–49 players');
  }
  const now = new Date().toISOString();
  return withProposed({
    id: args.id,
    name: args.name?.trim() || null,
    status: 'OPEN',
    targetPlayerCount: args.targetPlayerCount,
    preferredTableSize: DEFAULTS.preferredTableSize,
    minTableSize: DEFAULTS.minTableSize,
    maxTableSize: DEFAULTS.maxTableSize,
    highTableSize: DEFAULTS.highTableSize,
    playerCount: 0,
    createdAt: now,
    seatedAt: null,
    startedAt: null,
    highTableAt: null,
    finishedAt: null,
    players: [],
    tables: [],
    finalStandings: null,
    proposedTableSizes: null,
    proposedTableSizesError: null,
    highTableError: null,
  });
}

export function localAddPlayer(
  t: TournamentDetail,
  name: string,
  playerId: string,
): TournamentDetail {
  if (t.status !== 'OPEN') {
    throw new Error('Tournament is no longer accepting names');
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name required');
  if (t.players.length >= 49) throw new Error('Max 49 players (7×7 tables)');
  if (t.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Name already added');
  }
  if (t.players.some((p) => p.id === playerId)) {
    throw new Error('Player id already exists');
  }

  const orderIndex =
    t.players.reduce((m, p) => Math.max(m, p.orderIndex), -1) + 1;
  const player: TournamentPlayer = {
    id: playerId,
    name: trimmed,
    orderIndex,
    createdAt: new Date().toISOString(),
  };
  const players = [...t.players, player];
  const nextCount = players.length;
  return withProposed({
    ...t,
    players,
    targetPlayerCount: Math.max(t.targetPlayerCount, nextCount),
  });
}

export function localRemovePlayer(
  t: TournamentDetail,
  playerId: string,
): TournamentDetail {
  if (t.status !== 'OPEN') {
    throw new Error('Cannot remove players after seating');
  }
  if (!t.players.some((p) => p.id === playerId)) {
    throw new Error('Player not found');
  }
  return withProposed({
    ...t,
    players: t.players.filter((p) => p.id !== playerId),
  });
}

export type SeatPlanTable = {
  id: string;
  tableNumber: number;
  dealerSeat: number;
  seats: {
    id: string;
    tournamentPlayerId: string;
    seatIndex: number;
  }[];
};

export function localSeatTables(t: TournamentDetail): {
  tournament: TournamentDetail;
  plan: SeatPlanTable[];
} {
  if (t.status !== 'OPEN') {
    throw new Error('Tables already seated');
  }
  if (t.players.length < t.targetPlayerCount) {
    throw new Error(
      `Need at least ${t.targetPlayerCount} players before seating (have ${t.players.length})`,
    );
  }

  let sizes: number[];
  try {
    sizes = balanceTableSizes(
      t.players.length,
      t.preferredTableSize,
      t.minTableSize,
      t.maxTableSize,
    );
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : 'Cannot balance tables for this roster',
    );
  }

  const roster = shuffleInPlace([...t.players]);
  let cursor = 0;
  const plan: SeatPlanTable[] = [];
  const tables: TournamentTable[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i]!;
    const slice = roster.slice(cursor, cursor + size);
    cursor += size;
    const tableId = newId();
    const dealerSeat = slice.length - 1;
    const seats = slice.map((p, seatIndex) => ({
      id: newId(),
      seatIndex,
      tournamentPlayerId: p.id,
      name: p.name,
      isDealer: seatIndex === dealerSeat,
      sourceTableId: null,
      sourceTableNumber: null,
      sourcePlace: null,
      sourceScore: null,
    }));
    plan.push({
      id: tableId,
      tableNumber: i + 1,
      dealerSeat,
      seats: seats.map((s) => ({
        id: s.id,
        tournamentPlayerId: s.tournamentPlayerId,
        seatIndex: s.seatIndex,
      })),
    });
    tables.push({
      id: tableId,
      tableNumber: i + 1,
      stage: 'PRELIM',
      isHighTable: false,
      status: 'READY',
      dealerSeat,
      gameId: null,
      gameStatus: null,
      currentRound: null,
      startedAt: null,
      finishedAt: null,
      seats,
      standings: null,
    });
  }

  return {
    tournament: withProposed({
      ...t,
      status: 'SEATED',
      seatedAt: now,
      tables,
      proposedTableSizes: null,
      proposedTableSizesError: null,
    }),
    plan,
  };
}

export function localStartTable(
  t: TournamentDetail,
  tableId: string,
  opts?: { gameId?: string; playerIds?: string[] },
): {
  tournament: TournamentDetail;
  game: GameDetail;
  gameId: string;
  playerIds: string[];
} {
  const table = t.tables.find((tb) => tb.id === tableId);
  if (!table) throw new Error('Table not found');
  if (table.gameId) throw new Error('Game already started for this table');
  if (table.status !== 'READY' && table.status !== 'PENDING') {
    throw new Error('Table is not ready to start');
  }

  const seats = [...table.seats].sort((a, b) => a.seatIndex - b.seatIndex);
  if (seats.length < 2 || seats.length > 7) {
    throw new Error('Invalid seat count for a game');
  }

  const names = seats.map((s) => s.name);
  const gameId = opts?.gameId ?? newId();
  const playerIds = opts?.playerIds ?? names.map(() => newId());
  if (playerIds.length !== names.length) {
    throw new Error('playerIds must match seats');
  }

  const gameName = table.isHighTable
    ? `${t.name ?? 'Tournament'} — High Table`
    : `${t.name ?? 'Tournament'} — Table ${table.tableNumber}`;

  const game = createLocalGame(names, gameName, { gameId, playerIds });
  const linked: GameDetail = {
    ...game,
    tournamentId: t.id,
    tournamentTableId: table.id,
    isHighTable: table.isHighTable,
    tableNumber: table.tableNumber,
    prelimEditsLocked: false,
  };

  const now = new Date().toISOString();
  const tables = t.tables.map((tb) =>
    tb.id === tableId
      ? {
          ...tb,
          status: 'IN_PROGRESS' as const,
          gameId,
          gameStatus: linked.status,
          currentRound: linked.currentRound,
          startedAt: now,
          standings: null,
        }
      : tb,
  );

  const tourneyStatus = table.isHighTable ? 'HIGH_TABLE' : 'IN_PROGRESS';
  const tournament = withProposed({
    ...t,
    status: tourneyStatus,
    startedAt: t.startedAt ?? now,
    highTableAt:
      table.isHighTable && !t.highTableAt ? now : t.highTableAt,
    tables,
  });

  return { tournament, game: linked, gameId, playerIds };
}

/** After a linked game finishes offline, mark the table done (no high-table formation). */
export function localMarkTableFromGame(
  t: TournamentDetail,
  game: GameDetail,
): TournamentDetail {
  if (!game.tournamentTableId) return t;
  const tables = t.tables.map((tb) => {
    if (tb.id !== game.tournamentTableId) {
      if (tb.gameId === game.id) {
        return {
          ...tb,
          gameStatus: game.status,
          currentRound: game.currentRound,
          standings: game.status === 'COMPLETED' ? game.standings : tb.standings,
        };
      }
      return tb;
    }
    const done = game.status === 'COMPLETED';
    return {
      ...tb,
      gameId: game.id,
      gameStatus: game.status,
      currentRound: game.currentRound,
      status: done ? ('COMPLETED' as const) : tb.status,
      finishedAt: done ? game.finishedAt ?? new Date().toISOString() : tb.finishedAt,
      standings: done ? game.standings : tb.standings,
    };
  });
  return withProposed({ ...t, tables });
}
