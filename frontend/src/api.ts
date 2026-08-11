import { httpRequest, HttpError, isNetworkError } from './api/http';
import {
  cacheGame,
  getAllCachedGames,
  getCachedGame,
  kvGet,
  kvSet,
} from './offline/db';
import {
  createLocalGame,
  localSetBids,
  localSetTricks,
  localUpdateRound,
  toSummary,
} from './offline/localEngine';
import {
  enqueue,
  flushOutbox,
  gameIdsWithPendingOps,
  isOnline,
} from './offline/sync';
import { newId } from './offline/rules';
import { hydrateRoundOrder } from './offline/analytics';

export type GameSummary = {
  id: string;
  name: string | null;
  status: 'SETUP' | 'BIDDING' | 'PLAYING' | 'COMPLETED';
  createdAt: string;
  finishedAt: string | null;
  playerCount: number;
  players: string[];
  currentRound: number | null;
  standings: Standing[];
};

export type Standing = {
  playerId: string;
  playerName: string;
  seatIndex: number;
  total: number;
  place: number;
  roundsPlayed: number;
  bidsMade: number;
};

export type RoundEntry = {
  playerId: string;
  playerName: string;
  seatIndex: number;
  bid: number | null;
  tricksTaken: number | null;
  points: number | null;
  bidPosition: number | null;
  isDealer: boolean;
  isFirstBidder: boolean;
  isLastBidder: boolean;
  runningBidBefore: number | null;
  made: boolean | null;
  trickDelta: number | null;
  absDelta: number | null;
  isNilBid: boolean | null;
  isNilMade: boolean | null;
  cumulativeScore: number | null;
  placeAfterRound: number | null;
  scoreBehindLeader: number | null;
};

export type RoundDetail = {
  id: string;
  number: number;
  handSize: number;
  dealerSeat: number;
  firstBidderSeat: number;
  forceBurn: boolean;
  dealerPlayerId: string | undefined;
  firstBidderPlayerId: string | undefined;
  bidOrderSeats: number[];
  bidOrderPlayerIds: string[];
  bidSum: number | null;
  bidDeficit: number | null;
  forbiddenLastBid: number | null;
  bidsCompletedAt: string | null;
  tricksCompletedAt: string | null;
  completedAt: string | null;
  editCount: number;
  entries: RoundEntry[];
  complete: boolean;
};

export type GameEventType =
  | 'GAME_CREATED'
  | 'BIDS_SET'
  | 'TRICKS_SET'
  | 'ROUND_UPDATED';

export type GameEvent = {
  id: string;
  type: GameEventType;
  roundNumber: number | null;
  payload: unknown;
  createdAt: string;
};

export type GameDetail = {
  id: string;
  name: string | null;
  status: 'SETUP' | 'BIDDING' | 'PLAYING' | 'COMPLETED';
  phase: 'bidding' | 'tricks' | 'completed';
  currentRound: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  playerCount: number;
  firstDealerSeat: number;
  winnerPlayerId: string | null;
  winnerScore: number | null;
  runnerUpScore: number | null;
  winMargin: number | null;
  totalForceBurns: number;
  totalEdits: number;
  tournamentId?: string | null;
  tournamentTableId?: string | null;
  isHighTable?: boolean;
  tableNumber?: number | null;
  /** True when BE will reject prelim score edits (high table formed). */
  prelimEditsLocked?: boolean;
  players: { id: string; name: string; seatIndex: number }[];
  rounds: RoundDetail[];
  standings: Standing[];
  events: GameEvent[];
};

export type TournamentStatus =
  | 'OPEN'
  | 'SEATED'
  | 'IN_PROGRESS'
  | 'HIGH_TABLE'
  | 'COMPLETED';

export type TournamentSummary = {
  id: string;
  name: string | null;
  status: TournamentStatus;
  targetPlayerCount: number;
  playerCount: number;
  tableCount: number;
  tablesCompleted: number;
  preferredTableSize: number;
  createdAt: string;
  seatedAt: string | null;
  startedAt: string | null;
  highTableAt: string | null;
  finishedAt: string | null;
};

export type TournamentPlayer = {
  id: string;
  name: string;
  orderIndex: number;
  createdAt: string;
};

export type TournamentSeat = {
  id: string;
  seatIndex: number;
  tournamentPlayerId: string;
  name: string;
  isDealer: boolean;
  sourceTableId: string | null;
  sourceTableNumber: number | null;
  sourcePlace: number | null;
  sourceScore: number | null;
};

export type TournamentTable = {
  id: string;
  tableNumber: number;
  stage: 'PRELIM' | 'HIGH_TABLE';
  isHighTable: boolean;
  status: 'PENDING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED';
  dealerSeat: number;
  gameId: string | null;
  gameStatus: GameDetail['status'] | null;
  currentRound: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  seats: TournamentSeat[];
  standings: Standing[] | null;
};

export type TournamentFinalStanding = {
  tournamentPlayerId: string;
  name: string;
  place: number;
  score: number;
  source: 'HIGH_TABLE' | 'PRELIM';
  prelimPlace: number | null;
  prelimScore: number | null;
  prelimTableNumber: number | null;
  highTablePlace: number | null;
  highTableScore: number | null;
};

export type TournamentDetail = {
  id: string;
  name: string | null;
  status: TournamentStatus;
  targetPlayerCount: number;
  preferredTableSize: number;
  minTableSize: number;
  maxTableSize: number;
  highTableSize: number;
  playerCount: number;
  createdAt: string;
  seatedAt: string | null;
  startedAt: string | null;
  highTableAt: string | null;
  finishedAt: string | null;
  players: TournamentPlayer[];
  tables: TournamentTable[];
  finalStandings: TournamentFinalStanding[] | null;
  proposedTableSizes: number[] | null;
  proposedTableSizesError: string | null;
  highTableError: string | null;
};

export type StatsLeader = { name: string; value: number | string } | null;

export type StatsPlayer = {
  name: string;
  gamesPlayed: number;
  gamesCompleted: number;
  wins: number;
  seconds: number;
  thirds: number;
  podium: number;
  totalScore: number;
  avgScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
  roundsPlayed: number;
  bidsMade: number;
  bidAccuracy: number | null;
  nilBids: number;
  nilsMade: number;
  nilSuccessRate: number | null;
  forceBurns: number;
  overtricks: number;
  undertricks: number;
  biggestRound: number | null;
  smallestRound: number | null;
  perfectGames: number;
  winRate: number | null;
};

export type StatsGame = {
  id: string;
  name: string | null;
  status: 'SETUP' | 'BIDDING' | 'PLAYING' | 'COMPLETED';
  createdAt: string;
  finishedAt: string | null;
  playerCount: number;
  players: string[];
  winner: string | null;
  winnerScore: number | null;
  highScore: number | null;
  lowScore: number | null;
  avgScore: number | null;
  roundsCompleted: number;
  forceBurns: number;
  standings: { name: string; total: number; place: number }[];
};

export type StatsResponse = {
  overview: {
    totalGames: number;
    completedGames: number;
    uniquePlayers: number;
    totalForceBurns: number;
    totalRoundsPlayed: number;
    leaders: {
      mostWins: StatsLeader;
      highestAvg: StatsLeader;
      bestSingleGame: StatsLeader;
      worstSingleGame: StatsLeader;
      bestBidAccuracy: StatsLeader;
      mostNils: StatsLeader;
      biggestRound: StatsLeader;
      mostPodiums: StatsLeader;
      mostForceBurns: StatsLeader;
      perfectGames: StatsLeader;
      biggestMargin: StatsLeader;
    };
  };
  games: StatsGame[];
  players: StatsPlayer[];
};

/** Fill analytics defaults for older cached payloads missing new fields. */
function normalizeGame(raw: GameDetail): GameDetail {
  const players = raw.players ?? [];
  const playerCount = players.length;

  return {
    ...raw,
    startedAt: raw.startedAt ?? null,
    durationMs: raw.durationMs ?? null,
    playerCount,
    firstDealerSeat: raw.firstDealerSeat ?? Math.max(playerCount - 1, 0),
    winnerPlayerId: raw.winnerPlayerId ?? null,
    winnerScore: raw.winnerScore ?? null,
    runnerUpScore: raw.runnerUpScore ?? null,
    winMargin: raw.winMargin ?? null,
    totalForceBurns: raw.totalForceBurns ?? 0,
    totalEdits: raw.totalEdits ?? 0,
    events: raw.events ?? [],
    players,
    rounds: (raw.rounds ?? []).map((r) => {
      // Always recompute seating roles from dealer when roster is known.
      const hydrated =
        playerCount > 0 ? hydrateRoundOrder(players, r.dealerSeat) : null;
      const bidOrderSeats = hydrated?.bidOrderSeats ?? r.bidOrderSeats ?? [];
      const bidOrderPlayerIds =
        hydrated?.bidOrderPlayerIds ?? r.bidOrderPlayerIds ?? [];
      const firstBidderSeat =
        hydrated?.firstBidderSeat ??
        r.firstBidderSeat ??
        (playerCount > 0 ? (r.dealerSeat + 1) % playerCount : 0);

      return {
        ...r,
        firstBidderSeat,
        dealerPlayerId: hydrated?.dealerPlayerId ?? r.dealerPlayerId,
        firstBidderPlayerId:
          hydrated?.firstBidderPlayerId ?? r.firstBidderPlayerId,
        bidOrderSeats,
        bidOrderPlayerIds,
        bidSum: r.bidSum ?? null,
        bidDeficit: r.bidDeficit ?? null,
        forbiddenLastBid: r.forbiddenLastBid ?? null,
        bidsCompletedAt: r.bidsCompletedAt ?? null,
        tricksCompletedAt: r.tricksCompletedAt ?? null,
        completedAt: r.completedAt ?? null,
        editCount: r.editCount ?? 0,
        entries: (r.entries ?? []).map((e) => {
          const roles = hydrated?.entryRolesByPlayerId.get(e.playerId);
          if (!roles && playerCount > 0) {
            throw new Error(
              `Cannot hydrate roles for player ${e.playerId} in round ${r.number}`,
            );
          }
          return {
            ...e,
            bidPosition: roles?.bidPosition ?? e.bidPosition ?? null,
            isDealer: roles?.isDealer ?? false,
            isFirstBidder: roles?.isFirstBidder ?? false,
            isLastBidder: roles?.isLastBidder ?? false,
            runningBidBefore: e.runningBidBefore ?? null,
            made: e.made ?? null,
            trickDelta: e.trickDelta ?? null,
            absDelta: e.absDelta ?? null,
            isNilBid: e.isNilBid ?? null,
            isNilMade: e.isNilMade ?? null,
            cumulativeScore: e.cumulativeScore ?? null,
            placeAfterRound: e.placeAfterRound ?? null,
            scoreBehindLeader: e.scoreBehindLeader ?? null,
          };
        }),
      };
    }),
  };
}

async function rememberGame(game: GameDetail): Promise<GameDetail> {
  const normalized = normalizeGame(game);
  await cacheGame(normalized);
  const list = (await kvGet<GameSummary[]>('gameList')) ?? [];
  const summary = toSummary(normalized);
  const next = [summary, ...list.filter((g) => g.id !== game.id)];
  await kvSet('gameList', next);
  return normalized;
}

async function mergeGameList(server: GameSummary[]): Promise<GameSummary[]> {
  const pending = await gameIdsWithPendingOps();
  const localGames = await getAllCachedGames<GameDetail>();
  const byId = new Map(server.map((g) => [g.id, g]));
  for (const g of localGames) {
    if (pending.has(g.id) || !byId.has(g.id)) {
      byId.set(g.id, toSummary(g));
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

async function onlineWrite<T>(fn: () => Promise<T>): Promise<T> {
  const flush = await flushOutbox();
  if (flush.error) {
    throw new Error(`Offline sync failed: ${flush.error}`);
  }
  return fn();
}

function shouldGoOffline(err: unknown): boolean {
  if (!isOnline()) return true;
  if (err instanceof HttpError) return false;
  return isNetworkError(err) || (err instanceof Error && err.message === 'Network error');
}

export const api = {
  listGames: async (): Promise<GameSummary[]> => {
    if (isOnline()) {
      try {
        const flush = await flushOutbox();
        if (flush.error) {
          // Still show merged local+any server we can get
          const cached = (await kvGet<GameSummary[]>('gameList')) ?? [];
          return mergeGameList(cached);
        }
        const list = await httpRequest<GameSummary[]>('/games');
        const merged = await mergeGameList(list);
        await kvSet('gameList', merged);
        return merged;
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }
    const cached = (await kvGet<GameSummary[]>('gameList')) ?? [];
    return mergeGameList(cached);
  },

  getGame: async (id: string): Promise<GameDetail> => {
    const pending = await gameIdsWithPendingOps();
    if (isOnline() && !pending.has(id)) {
      try {
        const flush = await flushOutbox();
        if (!flush.error) {
          const game = await httpRequest<GameDetail>(`/games/${id}`);
          return rememberGame(game);
        }
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }
    const cached = await getCachedGame<GameDetail>(id);
    if (cached) return normalizeGame(cached);
    throw new Error('Game not available offline');
  },

  createGame: async (
    playerNames: string[],
    name?: string,
  ): Promise<GameDetail> => {
    const gameId = newId();
    const playerIds = playerNames.map(() => newId());

    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const game = await httpRequest<GameDetail>('/games', {
            method: 'POST',
            body: JSON.stringify({
              playerNames,
              name,
              id: gameId,
              playerIds,
            }),
          });
          return rememberGame(game);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const local = createLocalGame(playerNames, name, { gameId, playerIds });
    await rememberGame(local);
    await enqueue({
      type: 'createGame',
      payload: { playerNames, name, id: gameId, playerIds },
    });
    return local;
  },

  setBids: async (
    gameId: string,
    roundNumber: number,
    bids: { playerId: string; bid: number }[],
    forceBurn = false,
  ): Promise<GameDetail> => {
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const game = await httpRequest<GameDetail>(
            `/games/${gameId}/rounds/${roundNumber}/bids`,
            {
              method: 'POST',
              body: JSON.stringify({ bids, forceBurn }),
            },
          );
          return rememberGame(game);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const current = await getCachedGame<GameDetail>(gameId);
    if (!current) throw new Error('Game not available offline');
    const normalized = normalizeGame(current);
    if (normalized.tournamentId) {
      throw new Error('Tournament games require a live connection');
    }
    const next = localSetBids(normalized, roundNumber, bids, forceBurn);
    await rememberGame(next);
    await enqueue({
      type: 'setBids',
      payload: { gameId, roundNumber, bids, forceBurn },
    });
    return next;
  },

  setTricks: async (
    gameId: string,
    roundNumber: number,
    tricks: { playerId: string; tricksTaken: number }[],
  ): Promise<GameDetail> => {
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const game = await httpRequest<GameDetail>(
            `/games/${gameId}/rounds/${roundNumber}/tricks`,
            {
              method: 'POST',
              body: JSON.stringify({ tricks }),
            },
          );
          return rememberGame(game);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const current = await getCachedGame<GameDetail>(gameId);
    if (!current) throw new Error('Game not available offline');
    const normalized = normalizeGame(current);
    if (normalized.tournamentId) {
      throw new Error('Tournament games require a live connection');
    }
    const next = localSetTricks(normalized, roundNumber, tricks);
    await rememberGame(next);
    await enqueue({
      type: 'setTricks',
      payload: { gameId, roundNumber, tricks },
    });
    return next;
  },

  updateRound: async (
    gameId: string,
    roundNumber: number,
    body: {
      bids: { playerId: string; bid: number }[];
      tricks: { playerId: string; tricksTaken: number }[];
      forceBurn?: boolean;
    },
  ): Promise<GameDetail> => {
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const game = await httpRequest<GameDetail>(
            `/games/${gameId}/rounds/${roundNumber}`,
            {
              method: 'PATCH',
              body: JSON.stringify(body),
            },
          );
          return rememberGame(game);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const current = await getCachedGame<GameDetail>(gameId);
    if (!current) throw new Error('Game not available offline');
    const normalized = normalizeGame(current);
    if (normalized.tournamentId) {
      throw new Error('Tournament games require a live connection');
    }
    const next = localUpdateRound(
      normalized,
      roundNumber,
      body.bids,
      body.tricks,
      body.forceBurn === true,
    );
    await rememberGame(next);
    await enqueue({
      type: 'updateRound',
      payload: { gameId, roundNumber, ...body },
    });
    return next;
  },

  getStats: async (): Promise<StatsResponse> => {
    if (isOnline()) {
      try {
        const flush = await flushOutbox();
        if (flush.error) {
          const cached = await kvGet<StatsResponse>('stats');
          if (cached) return cached;
          throw new Error(`Offline sync failed: ${flush.error}`);
        }
        const stats = await httpRequest<StatsResponse>('/stats');
        await kvSet('stats', stats);
        return stats;
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }
    const cached = await kvGet<StatsResponse>('stats');
    if (cached) return cached;
    throw new Error('Stats not available offline');
  },

  getRules: async (): Promise<unknown> => {
    if (isOnline()) {
      try {
        const rules = await httpRequest<unknown>('/rules');
        await kvSet('rules', rules);
        return rules;
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }
    const cached = await kvGet<unknown>('rules');
    if (cached != null) return cached;
    throw new Error('Rules not available offline');
  },

  listTournaments: async (opts?: {
    all?: boolean;
  }): Promise<TournamentSummary[]> => {
    const q = opts?.all ? '?all=1' : '';
    return httpRequest<TournamentSummary[]>(`/tournaments${q}`);
  },

  getTournament: async (id: string): Promise<TournamentDetail> => {
    return httpRequest<TournamentDetail>(`/tournaments/${id}`);
  },

  createTournament: async (args: {
    targetPlayerCount: number;
    id: string;
    name?: string;
  }): Promise<TournamentDetail> => {
    return httpRequest<TournamentDetail>('/tournaments', {
      method: 'POST',
      body: JSON.stringify({
        id: args.id,
        targetPlayerCount: args.targetPlayerCount,
        name: args.name,
      }),
    });
  },

  addTournamentPlayer: async (
    tournamentId: string,
    name: string,
  ): Promise<TournamentDetail> => {
    return httpRequest<TournamentDetail>(`/tournaments/${tournamentId}/players`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  removeTournamentPlayer: async (
    tournamentId: string,
    playerId: string,
  ): Promise<TournamentDetail> => {
    return httpRequest<TournamentDetail>(
      `/tournaments/${tournamentId}/players/${playerId}`,
      { method: 'DELETE' },
    );
  },

  seatTournament: async (tournamentId: string): Promise<TournamentDetail> => {
    return httpRequest<TournamentDetail>(`/tournaments/${tournamentId}/seat`, {
      method: 'POST',
    });
  },

  startTournamentTable: async (
    tournamentId: string,
    tableId: string,
  ): Promise<{ tournament: TournamentDetail; game: GameDetail }> => {
    const res = await httpRequest<{
      tournament: TournamentDetail;
      game: GameDetail;
    }>(`/tournaments/${tournamentId}/tables/${tableId}/start`, {
      method: 'POST',
    });
    await rememberGame(res.game);
    return res;
  },
};
