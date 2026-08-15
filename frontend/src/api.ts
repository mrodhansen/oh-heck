import { httpRequest, HttpError } from './api/http';
import { isNetworkFailure } from './api/errors';
import type {
  CardJson,
  CardPlayRecord,
  CurrentTrickJson,
  DealtHandsJson,
  TrickHistoryEntry,
} from './types/cards';
import type { OhHeckRules } from './types/rules';
import {
  cacheGame,
  cacheTournament,
  getAllCachedGames,
  getAllCachedTournaments,
  getCachedGame,
  getCachedTournament,
  kvGet,
  kvSet,
} from './offline/db';
import {
  createLocalGame,
  localSetBids,
  localSetSuperPlay,
  localSetTricks,
  localUpdateNotes,
  localUpdateRound,
  toSummary,
} from './offline/localEngine';
import {
  createLocalTournament,
  localAddPlayer,
  localMarkTableFromGame,
  localRemovePlayer,
  localSeatTables,
  localStartTable,
  toTournamentSummary,
} from './offline/localTournament';
import {
  enqueue,
  flushOutbox,
  gameIdsWithPendingOps,
  isOnline,
  tournamentIdsWithPendingOps,
} from './offline/sync';
import { newId } from './offline/rules';
import {
  computeGameFinishStats,
  cumulativeFieldsForRound,
  derivedBidAggregates,
  derivedEntryOutcome,
  hydrateRoundOrder,
} from './offline/analytics';
import { parseGameNotes, type GameNote } from './offline/notes';

export type { GameNote };

export type PlayMode = 'IN_PERSON' | 'ONLINE';

export type GameSummary = {
  id: string;
  name: string | null;
  hasNotes?: boolean;
  status: 'SETUP' | 'BIDDING' | 'PLAYING' | 'COMPLETED';
  playMode?: PlayMode;
  superScorer?: boolean;
  liveCode?: string | null;
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
  bidPlacedAt?: string | null;
  dealtHand?: CardJson[] | null;
  cardsPlayed?: CardPlayRecord[] | null;
};

export type TrickPlayDetail = {
  playOrder: number;
  seatIndex: number;
  playerId: string;
  cardSuit: string;
  cardRank: string;
  cardKey: string;
  followedSuit: boolean;
  playedTrump: boolean;
  playedAt: string;
};

export type TrickDetail = {
  id: string;
  trickIndex: number;
  leadSeat: number;
  leadSuit: string;
  winnerSeat: number;
  winnerPlayerId: string | null;
  completedAt: string;
  plays: TrickPlayDetail[];
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
  trumpSuit?: string | null;
  trumpCard?: CardJson | null;
  dealtHands?: DealtHandsJson | null;
  dealtAt?: string | null;
  trickHistory?: TrickHistoryEntry[] | null;
  currentTrick?: CurrentTrickJson | null;
  tricks?: TrickDetail[];
  entries: RoundEntry[];
  complete: boolean;
};

export type GameEventType =
  | 'GAME_CREATED'
  | 'BIDS_SET'
  | 'TRICKS_SET'
  | 'ROUND_UPDATED'
  | 'ROUND_DEALT'
  | 'CARD_PLAYED'
  | 'TRICK_COMPLETED'
  | 'BID_PLACED'
  | 'PLAYER_LEFT'
  | 'SEAT_CLAIMED'
  | 'PLAYER_JOINED'
  | 'GAME_STARTED_LIVE';

export type GameEventJson =
  | string
  | number
  | boolean
  | null
  | GameEventJson[]
  | { [key: string]: GameEventJson | undefined };

export type GameEventPayload = { [key: string]: GameEventJson | undefined };

export type GameEvent = {
  id: string;
  type: GameEventType;
  roundNumber: number | null;
  payload: GameEventPayload;
  createdAt: string;
};

export type GameDetail = {
  id: string;
  name: string | null;
  notes: GameNote[];
  status: 'SETUP' | 'BIDDING' | 'PLAYING' | 'COMPLETED';
  playMode?: PlayMode;
  superScorer?: boolean;
  liveCode?: string | null;
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
  players: {
    id: string;
    name: string;
    seatIndex: number;
    userId?: string | null;
  }[];
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
  /** Stable identity: user:<id> */
  key?: string;
  userId?: string | null;
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

/** Fill defaults and recompute derived fields from raw bids / tricks / points. */
function normalizeGame(raw: GameDetail): GameDetail {
  const players = raw.players ?? [];
  const playerCount = players.length;
  const playersForCalc = players.map((p) => ({
    id: p.id,
    seatIndex: p.seatIndex,
  }));
  const sourceRounds = raw.rounds ?? [];
  const roundsSnap = sourceRounds.map((r) => ({
    number: r.number,
    forceBurn: r.forceBurn,
    entries: (r.entries ?? []).map((e) => ({
      playerId: e.playerId,
      points: e.points,
    })),
  }));

  const rounds = sourceRounds.map((r) => {
    const hydrated =
      playerCount > 0 ? hydrateRoundOrder(players, r.dealerSeat) : null;
    const bidOrderSeats = hydrated?.bidOrderSeats ?? r.bidOrderSeats ?? [];
    const bidOrderPlayerIds =
      hydrated?.bidOrderPlayerIds ?? r.bidOrderPlayerIds ?? [];
    const firstBidderSeat =
      hydrated?.firstBidderSeat ??
      r.firstBidderSeat ??
      (playerCount > 0 ? (r.dealerSeat + 1) % playerCount : 0);
    const { bidSum, bidDeficit } = derivedBidAggregates(
      r.handSize,
      (r.entries ?? []).map((e) => e.bid),
    );
    const complete = (r.entries ?? []).every(
      (e) => e.bid !== null && e.tricksTaken !== null && e.points !== null,
    );
    const cum =
      complete && playerCount > 0
        ? cumulativeFieldsForRound(playersForCalc, roundsSnap, r.number)
        : null;

    return {
      ...r,
      firstBidderSeat,
      dealerPlayerId: hydrated?.dealerPlayerId ?? r.dealerPlayerId,
      firstBidderPlayerId:
        hydrated?.firstBidderPlayerId ?? r.firstBidderPlayerId,
      bidOrderSeats,
      bidOrderPlayerIds,
      bidSum,
      bidDeficit,
      forbiddenLastBid: r.forbiddenLastBid ?? null,
      bidsCompletedAt: r.bidsCompletedAt ?? null,
      tricksCompletedAt: r.tricksCompletedAt ?? null,
      completedAt: r.completedAt ?? null,
      editCount: r.editCount ?? 0,
      complete,
      entries: (r.entries ?? []).map((e) => {
        const roles = hydrated?.entryRolesByPlayerId.get(e.playerId);
        if (!roles && playerCount > 0) {
          throw new Error(
            `Cannot hydrate roles for player ${e.playerId} in round ${r.number}`,
          );
        }
        const outcome = derivedEntryOutcome(e.bid, e.tricksTaken);
        const standing = cum?.get(e.playerId);
        return {
          ...e,
          bidPosition: roles?.bidPosition ?? e.bidPosition ?? null,
          isDealer: roles?.isDealer ?? false,
          isFirstBidder: roles?.isFirstBidder ?? false,
          isLastBidder: roles?.isLastBidder ?? false,
          runningBidBefore: e.runningBidBefore ?? null,
          made: outcome.made,
          trickDelta: outcome.trickDelta,
          absDelta: outcome.absDelta,
          isNilBid: outcome.isNilBid,
          isNilMade: outcome.isNilMade,
          cumulativeScore: standing?.cumulativeScore ?? null,
          placeAfterRound: standing?.placeAfterRound ?? null,
          scoreBehindLeader: standing?.scoreBehindLeader ?? null,
        };
      }),
    };
  });

  const allPointsPresent =
    rounds.length > 0 &&
    rounds.every((r) =>
      r.entries.every((e) => e.points !== null),
    );
  let finish: ReturnType<typeof computeGameFinishStats> | null = null;
  if (raw.status === 'COMPLETED' && raw.finishedAt && allPointsPresent) {
    try {
      finish = computeGameFinishStats(
        playersForCalc,
        roundsSnap,
        raw.createdAt,
        raw.finishedAt,
      );
    } catch {
      finish = null;
    }
  }

  return {
    ...raw,
    superScorer: raw.superScorer === true,
    notes: parseGameNotes(raw.notes),
    startedAt: raw.startedAt ?? null,
    durationMs:
      finish?.durationMs ??
      (raw.finishedAt
        ? Math.max(
            0,
            new Date(raw.finishedAt).getTime() - new Date(raw.createdAt).getTime(),
          )
        : null),
    playerCount,
    firstDealerSeat: raw.firstDealerSeat ?? Math.max(playerCount - 1, 0),
    winnerPlayerId: finish?.winnerPlayerId ?? null,
    winnerScore: finish?.winnerScore ?? null,
    runnerUpScore: finish?.runnerUpScore ?? null,
    winMargin: finish?.winMargin ?? null,
    totalForceBurns:
      finish?.totalForceBurns ??
      rounds.filter((r) => r.forceBurn).length,
    totalEdits: rounds.reduce((s, r) => s + (r.editCount ?? 0), 0),
    events: raw.events ?? [],
    players,
    rounds,
  };
}

async function rememberGame(game: GameDetail): Promise<GameDetail> {
  const normalized = normalizeGame(game);
  await cacheGame(normalized);
  const list = (await kvGet<GameSummary[]>('gameList')) ?? [];
  const summary = toSummary(normalized);
  const next = [summary, ...list.filter((g) => g.id !== game.id)];
  await kvSet('gameList', next);

  if (normalized.tournamentId) {
    const t = await getCachedTournament<TournamentDetail>(
      normalized.tournamentId,
    );
    if (t) {
      await rememberTournament(localMarkTableFromGame(t, normalized));
    }
  }
  return normalized;
}

async function rememberTournament(
  t: TournamentDetail,
): Promise<TournamentDetail> {
  await cacheTournament(t);
  const list = (await kvGet<TournamentSummary[]>('tournamentList')) ?? [];
  const summary = toTournamentSummary(t);
  const next = [summary, ...list.filter((x) => x.id !== t.id)];
  await kvSet('tournamentList', next);
  return t;
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

async function mergeTournamentList(
  server: TournamentSummary[],
): Promise<TournamentSummary[]> {
  const pending = await tournamentIdsWithPendingOps();
  const local = await getAllCachedTournaments<TournamentDetail>();
  const byId = new Map(server.map((t) => [t.id, t]));
  for (const t of local) {
    if (pending.has(t.id) || !byId.has(t.id)) {
      byId.set(t.id, toTournamentSummary(t));
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
  return isNetworkFailure(err);
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
    opts?: { playerUserIds?: (string | null)[]; superScorer?: boolean },
  ): Promise<GameDetail> => {
    const gameId = newId();
    const playerIds = playerNames.map(() => newId());
    const playerUserIds = opts?.playerUserIds;
    const superScorer = opts?.superScorer === true;

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
              ...(playerUserIds ? { playerUserIds } : {}),
              ...(superScorer ? { superScorer: true } : {}),
            }),
          });
          return rememberGame(game);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const local = createLocalGame(playerNames, name, {
      gameId,
      playerIds,
      playerUserIds,
      superScorer,
    });
    await rememberGame(local);
    await enqueue({
      type: 'createGame',
      payload: {
        playerNames,
        name,
        id: gameId,
        playerIds,
        ...(playerUserIds ? { playerUserIds } : {}),
        ...(superScorer ? { superScorer: true } : {}),
      },
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
    if (normalized.prelimEditsLocked) {
      throw new Error('Prelim edits locked — reconnect to sync tournament state');
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
    if (normalized.prelimEditsLocked) {
      throw new Error('Prelim edits locked — reconnect to sync tournament state');
    }
    const next = localSetTricks(normalized, roundNumber, tricks);
    await rememberGame(next);
    await enqueue({
      type: 'setTricks',
      payload: { gameId, roundNumber, tricks },
    });
    return next;
  },

  setSuperPlay: async (
    gameId: string,
    roundNumber: number,
    body: {
      trumpCard: CardJson | null;
      plays: { playerId: string; card: CardJson }[];
    },
  ): Promise<GameDetail> => {
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const game = await httpRequest<GameDetail>(
            `/games/${gameId}/rounds/${roundNumber}/super-play`,
            {
              method: 'POST',
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
    if (normalized.prelimEditsLocked) {
      throw new Error('Prelim edits locked — reconnect to sync tournament state');
    }
    const next = localSetSuperPlay(
      normalized,
      roundNumber,
      body.trumpCard,
      body.plays,
    );
    await rememberGame(next);
    await enqueue({
      type: 'setSuperPlay',
      payload: { gameId, roundNumber, ...body },
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
    if (normalized.prelimEditsLocked) {
      throw new Error('Prelim edits locked — reconnect to sync tournament state');
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

  claimSeat: async (gameId: string, playerId: string): Promise<GameDetail> => {
    if (!isOnline()) {
      throw new Error('Sign in and go online to claim a seat');
    }
    const game = await httpRequest<GameDetail>(`/games/${gameId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    });
    return rememberGame(game);
  },

  updateNotes: async (
    gameId: string,
    notes: GameNote[],
  ): Promise<GameDetail> => {
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const game = await httpRequest<GameDetail>(`/games/${gameId}/notes`, {
            method: 'PATCH',
            body: JSON.stringify({ notes }),
          });
          return rememberGame(game);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const current = await getCachedGame<GameDetail>(gameId);
    if (!current) throw new Error('Game not available offline');
    const next = localUpdateNotes(normalizeGame(current), notes);
    await rememberGame(next);
    await enqueue({
      type: 'updateNotes',
      payload: { gameId, notes },
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

  getRules: async (): Promise<OhHeckRules> => {
    if (isOnline()) {
      try {
        const rules = await httpRequest<OhHeckRules>('/rules');
        await kvSet('rules', rules);
        return rules;
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }
    const cached = await kvGet<OhHeckRules>('rules');
    if (cached != null) return cached;
    throw new Error('Rules not available offline');
  },

  listTournaments: async (opts?: {
    all?: boolean;
  }): Promise<TournamentSummary[]> => {
    const q = opts?.all ? '?all=1' : '';
    if (isOnline()) {
      try {
        const flush = await flushOutbox();
        if (flush.error) {
          const cached =
            (await kvGet<TournamentSummary[]>('tournamentList')) ?? [];
          return mergeTournamentList(cached);
        }
        const list = await httpRequest<TournamentSummary[]>(`/tournaments${q}`);
        const merged = await mergeTournamentList(list);
        await kvSet('tournamentList', merged);
        return merged;
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }
    const cached = (await kvGet<TournamentSummary[]>('tournamentList')) ?? [];
    return mergeTournamentList(cached);
  },

  getTournament: async (id: string): Promise<TournamentDetail> => {
    const pending = await tournamentIdsWithPendingOps();
    if (isOnline() && !pending.has(id)) {
      try {
        const flush = await flushOutbox();
        if (!flush.error) {
          const t = await httpRequest<TournamentDetail>(`/tournaments/${id}`);
          return rememberTournament(t);
        }
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }
    const cached = await getCachedTournament<TournamentDetail>(id);
    if (cached) return cached;
    throw new Error('Tournament not available offline');
  },

  createTournament: async (args: {
    targetPlayerCount: number;
    id: string;
    name?: string;
  }): Promise<TournamentDetail> => {
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const t = await httpRequest<TournamentDetail>('/tournaments', {
            method: 'POST',
            body: JSON.stringify({
              id: args.id,
              targetPlayerCount: args.targetPlayerCount,
              name: args.name,
            }),
          });
          return rememberTournament(t);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const local = createLocalTournament(args);
    await rememberTournament(local);
    await enqueue({
      type: 'createTournament',
      payload: {
        id: args.id,
        targetPlayerCount: args.targetPlayerCount,
        name: args.name,
      },
    });
    return local;
  },

  addTournamentPlayer: async (
    tournamentId: string,
    name: string,
  ): Promise<TournamentDetail> => {
    const playerId = newId();
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const t = await httpRequest<TournamentDetail>(
            `/tournaments/${tournamentId}/players`,
            {
              method: 'POST',
              body: JSON.stringify({ name, id: playerId }),
            },
          );
          return rememberTournament(t);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const current = await getCachedTournament<TournamentDetail>(tournamentId);
    if (!current) throw new Error('Tournament not available offline');
    const next = localAddPlayer(current, name, playerId);
    await rememberTournament(next);
    await enqueue({
      type: 'addTournamentPlayer',
      payload: { tournamentId, name, id: playerId },
    });
    return next;
  },

  removeTournamentPlayer: async (
    tournamentId: string,
    playerId: string,
  ): Promise<TournamentDetail> => {
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const t = await httpRequest<TournamentDetail>(
            `/tournaments/${tournamentId}/players/${playerId}`,
            { method: 'DELETE' },
          );
          return rememberTournament(t);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const current = await getCachedTournament<TournamentDetail>(tournamentId);
    if (!current) throw new Error('Tournament not available offline');
    const next = localRemovePlayer(current, playerId);
    await rememberTournament(next);
    await enqueue({
      type: 'removeTournamentPlayer',
      payload: { tournamentId, playerId },
    });
    return next;
  },

  seatTournament: async (tournamentId: string): Promise<TournamentDetail> => {
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const t = await httpRequest<TournamentDetail>(
            `/tournaments/${tournamentId}/seat`,
            { method: 'POST', body: JSON.stringify({}) },
          );
          return rememberTournament(t);
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const current = await getCachedTournament<TournamentDetail>(tournamentId);
    if (!current) throw new Error('Tournament not available offline');
    const { tournament, plan } = localSeatTables(current);
    await rememberTournament(tournament);
    await enqueue({
      type: 'seatTournament',
      payload: { tournamentId, tables: plan },
    });
    return tournament;
  },

  startTournamentTable: async (
    tournamentId: string,
    tableId: string,
    opts?: { superScorer?: boolean },
  ): Promise<{ tournament: TournamentDetail; game: GameDetail }> => {
    const superScorer = opts?.superScorer === true;
    if (isOnline()) {
      try {
        return await onlineWrite(async () => {
          const res = await httpRequest<{
            tournament: TournamentDetail;
            game: GameDetail;
          }>(`/tournaments/${tournamentId}/tables/${tableId}/start`, {
            method: 'POST',
            body: JSON.stringify(superScorer ? { superScorer: true } : {}),
          });
          await rememberTournament(res.tournament);
          await rememberGame(res.game);
          return res;
        });
      } catch (e) {
        if (!shouldGoOffline(e)) throw e;
      }
    }

    const current = await getCachedTournament<TournamentDetail>(tournamentId);
    if (!current) throw new Error('Tournament not available offline');
    const started = localStartTable(current, tableId, { superScorer });
    await rememberTournament(started.tournament);
    await rememberGame(started.game);
    await enqueue({
      type: 'startTournamentTable',
      payload: {
        tournamentId,
        tableId,
        gameId: started.gameId,
        playerIds: started.playerIds,
        ...(superScorer ? { superScorer: true } : {}),
      },
    });
    return { tournament: started.tournament, game: started.game };
  },
};
