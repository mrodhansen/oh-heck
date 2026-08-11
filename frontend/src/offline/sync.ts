import { httpRequest } from '../api/http';
import type {
  GameDetail,
  GameSummary,
  StatsResponse,
  TournamentDetail,
  TournamentSummary,
} from '../api';
import {
  cacheGame,
  cacheTournament,
  GAME_OUTBOX_TYPES,
  getAllCachedGames,
  getAllCachedTournaments,
  kvSet,
  outboxAdd,
  outboxAll,
  outboxCount,
  outboxRemove,
  TOURNAMENT_OUTBOX_TYPES,
  type OutboxOp,
} from './db';
import { toSummary } from './localEngine';
import { toTournamentSummary } from './localTournament';
import { newId } from './rules';

let flushChain: Promise<unknown> = Promise.resolve();
let lastSyncError: string | null = null;
const listeners = new Set<() => void>();

export function onSyncChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export async function getPendingCount(): Promise<number> {
  return outboxCount();
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export async function gameIdsWithPendingOps(): Promise<Set<string>> {
  const ops = await outboxAll();
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.type === 'createGame') {
      const id = op.payload.id;
      if (typeof id === 'string') ids.add(id);
    } else if (op.type === 'startTournamentTable') {
      const id = op.payload.gameId;
      if (typeof id === 'string') ids.add(id);
    } else if (GAME_OUTBOX_TYPES.has(op.type)) {
      const id = op.payload.gameId;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}

export async function tournamentIdsWithPendingOps(): Promise<Set<string>> {
  const ops = await outboxAll();
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.type === 'createTournament') {
      const id = op.payload.id;
      if (typeof id === 'string') ids.add(id);
    } else if (TOURNAMENT_OUTBOX_TYPES.has(op.type)) {
      const id = op.payload.tournamentId;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}

type SyncResultRow = {
  ok: boolean;
  type: string;
  error?: string;
  data?: unknown;
};

async function postSyncBatch(
  path: string,
  ops: OutboxOp[],
): Promise<{ doneIds: string[]; error?: string }> {
  const body = {
    operations: ops.map((o) => ({ type: o.type, payload: o.payload })),
  };
  const res = await httpRequest<{ results: SyncResultRow[] }>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!Array.isArray(res.results) || res.results.length === 0) {
    return { doneIds: [], error: 'Sync returned no results' };
  }

  const doneIds: string[] = [];
  let error: string | undefined;
  for (let i = 0; i < res.results.length; i++) {
    const r = res.results[i];
    if (r.ok) {
      doneIds.push(ops[i]!.id);
      await cacheSyncResultData(r.data);
    } else {
      error = r.error ?? 'Sync failed';
      break;
    }
  }

  if (!error && doneIds.length < ops.length) {
    error = 'Sync incomplete';
  }

  return { doneIds, error };
}

async function cacheSyncResultData(data: unknown): Promise<void> {
  if (!data || typeof data !== 'object') return;
  const obj = data as Record<string, unknown>;

  // startTournamentTable returns { tournament, game }
  if (
    'tournament' in obj &&
    'game' in obj &&
    obj.tournament &&
    typeof obj.tournament === 'object' &&
    obj.game &&
    typeof obj.game === 'object'
  ) {
    const tournament = obj.tournament as TournamentDetail;
    const game = obj.game as GameDetail;
    if ('id' in tournament && 'players' in tournament && 'tables' in tournament) {
      await cacheTournament(tournament);
    }
    if ('id' in game && 'players' in game && 'rounds' in game) {
      await cacheGame(game);
    }
    return;
  }

  if ('id' in obj && 'players' in obj && 'rounds' in obj) {
    await cacheGame(obj as GameDetail);
    return;
  }

  if ('id' in obj && 'players' in obj && 'tables' in obj && 'status' in obj) {
    await cacheTournament(obj as TournamentDetail);
  }
}

export async function flushOutbox(): Promise<{
  flushed: number;
  error?: string;
}> {
  // Serialize flushes so onlineWrite never races the outbox.
  const run = async (): Promise<{ flushed: number; error?: string }> => {
    if (!isOnline()) return { flushed: 0 };

    const ops = await outboxAll();
    if (ops.length === 0) return { flushed: 0 };

    emit();
    try {
      const allDone: string[] = [];
      let error: string | undefined;
      let i = 0;

      while (i < ops.length) {
        const head = ops[i]!;
        const isTournament = TOURNAMENT_OUTBOX_TYPES.has(head.type);
        const isGame = GAME_OUTBOX_TYPES.has(head.type);
        if (!isTournament && !isGame) {
          error = `Unknown outbox op type: ${head.type}`;
          break;
        }

        const batch: OutboxOp[] = [];
        while (i < ops.length) {
          const op = ops[i]!;
          if (isTournament && !TOURNAMENT_OUTBOX_TYPES.has(op.type)) break;
          if (isGame && !GAME_OUTBOX_TYPES.has(op.type)) break;
          batch.push(op);
          i += 1;
        }

        const path = isTournament ? '/tournaments/sync' : '/games/sync';
        const result = await postSyncBatch(path, batch);
        allDone.push(...result.doneIds);
        if (result.error) {
          error = result.error;
          break;
        }
      }

      if (allDone.length) await outboxRemove(allDone);

      if (error) {
        lastSyncError = error;
      } else {
        lastSyncError = null;
      }

      const cachedGames = await getAllCachedGames<GameDetail>();
      await kvSet(
        'gameList',
        cachedGames
          .map(toSummary)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
      );

      const cachedTourneys = await getAllCachedTournaments<TournamentDetail>();
      await kvSet(
        'tournamentList',
        cachedTourneys
          .map(toTournamentSummary)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
      );

      return { flushed: allDone.length, error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Sync failed';
      lastSyncError = error;
      return { flushed: 0, error };
    } finally {
      emit();
    }
  };

  const result = flushChain.then(run, run);
  flushChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function pullFromServer(): Promise<void> {
  if (!isOnline()) return;
  const pendingGames = await gameIdsWithPendingOps();
  const pendingTourneys = await tournamentIdsWithPendingOps();
  try {
    const list = await httpRequest<GameSummary[]>('/games');
    const localGames = await getAllCachedGames<GameDetail>();
    const byId = new Map(list.map((g) => [g.id, g]));
    for (const g of localGames) {
      if (pendingGames.has(g.id) || !byId.has(g.id)) {
        byId.set(g.id, toSummary(g));
      }
    }
    await kvSet(
      'gameList',
      [...byId.values()].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );

    const warm = list
      .filter((g) => g.status !== 'COMPLETED' && !pendingGames.has(g.id))
      .slice(0, 10);
    for (const g of warm) {
      try {
        const detail = await httpRequest<GameDetail>(`/games/${g.id}`);
        if (!pendingGames.has(detail.id)) await cacheGame(detail);
      } catch {
        /* single warm failure OK */
      }
    }

    try {
      const stats = await httpRequest<StatsResponse>('/stats');
      await kvSet('stats', stats);
    } catch {
      /* stats optional on pull */
    }

    try {
      const rules = await httpRequest<unknown>('/rules');
      await kvSet('rules', rules);
    } catch {
      /* rules optional on pull */
    }

    try {
      const tList = await httpRequest<TournamentSummary[]>('/tournaments?all=1');
      const localTs = await getAllCachedTournaments<TournamentDetail>();
      const tById = new Map(tList.map((t) => [t.id, t]));
      for (const t of localTs) {
        if (pendingTourneys.has(t.id) || !tById.has(t.id)) {
          tById.set(t.id, toTournamentSummary(t));
        }
      }
      await kvSet(
        'tournamentList',
        [...tById.values()].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );

      const warmT = tList
        .filter((t) => t.status !== 'COMPLETED' && !pendingTourneys.has(t.id))
        .slice(0, 10);
      for (const row of warmT) {
        try {
          const detail = await httpRequest<TournamentDetail>(
            `/tournaments/${row.id}`,
          );
          if (pendingTourneys.has(detail.id)) continue;
          await cacheTournament(detail);
          for (const tb of detail.tables) {
            if (!tb.gameId || pendingGames.has(tb.gameId)) continue;
            if (tb.status === 'COMPLETED') continue;
            try {
              const g = await httpRequest<GameDetail>(`/games/${tb.gameId}`);
              if (!pendingGames.has(g.id)) await cacheGame(g);
            } catch {
              /* warm table game optional */
            }
          }
        } catch {
          /* single tournament warm failure OK */
        }
      }
    } catch {
      /* tournaments optional on pull */
    }
  } catch {
    /* server down */
  }
}

export async function syncNow(): Promise<void> {
  const flush = await flushOutbox();
  if (flush.error) {
    emit();
    return;
  }
  await pullFromServer();
  emit();
}

export function startSyncListeners(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    void syncNow().catch(() => undefined);
  });
  // Quiet background retry — no UI
  setInterval(() => {
    if (isOnline()) void syncNow().catch(() => undefined);
  }, 20_000);
}

export async function enqueue(
  op: Omit<OutboxOp, 'id' | 'createdAt'>,
): Promise<void> {
  const full: OutboxOp = {
    ...op,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
  await outboxAdd(full);
  emit();
}
