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

let flushChain: Promise<void> = Promise.resolve();
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
      ids.add(op.payload.id);
    } else if (op.type === 'startTournamentTable') {
      ids.add(op.payload.gameId);
    } else if (
      op.type === 'setBids' ||
      op.type === 'setTricks' ||
      op.type === 'updateRound' ||
      op.type === 'updateNotes'
    ) {
      ids.add(op.payload.gameId);
    }
  }
  return ids;
}

export async function tournamentIdsWithPendingOps(): Promise<Set<string>> {
  const ops = await outboxAll();
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.type === 'createTournament') {
      ids.add(op.payload.id);
    } else if (
      op.type === 'addTournamentPlayer' ||
      op.type === 'removeTournamentPlayer' ||
      op.type === 'seatTournament' ||
      op.type === 'startTournamentTable'
    ) {
      ids.add(op.payload.tournamentId);
    }
  }
  return ids;
}

type SyncResultRow =
  | { ok: true; type: string; data?: object }
  | { ok: false; type: string; error?: string };

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

function isGameDetail(value: object): value is GameDetail {
  return 'id' in value && 'players' in value && 'rounds' in value;
}

function isTournamentDetail(value: object): value is TournamentDetail {
  return (
    'id' in value &&
    'players' in value &&
    'tables' in value &&
    'status' in value
  );
}

async function cacheSyncResultData(data: object | undefined): Promise<void> {
  if (!data) return;

  if ('tournament' in data && 'game' in data) {
    const pair = data as { tournament: object; game: object };
    if (isTournamentDetail(pair.tournament)) {
      await cacheTournament(pair.tournament);
    }
    if (isGameDetail(pair.game)) {
      await cacheGame(pair.game);
    }
    return;
  }

  if (isGameDetail(data)) {
    await cacheGame(data);
    return;
  }

  if (isTournamentDetail(data)) {
    await cacheTournament(data);
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
        const isTournament = isTournamentOpType(head.type);
        const isGame = isGameOpType(head.type);
        if (!isTournament && !isGame) {
          error = `Unknown outbox op type: ${head.type}`;
          break;
        }

        const batch: OutboxOp[] = [];
        while (i < ops.length) {
          const op = ops[i]!;
          if (isTournament && !isTournamentOpType(op.type)) break;
          if (isGame && !isGameOpType(op.type)) break;
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
      const rules = await httpRequest<import('../types/rules').OhHeckRules>('/rules');
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
  const full = {
    ...op,
    id: newId(),
    createdAt: new Date().toISOString(),
  } as OutboxOp;
  await outboxAdd(full);
  emit();
}

function isTournamentOpType(
  type: OutboxOp['type'],
): type is import('./db').TournamentOutboxType {
  return TOURNAMENT_OUTBOX_TYPES.has(type as import('./db').TournamentOutboxType);
}

function isGameOpType(
  type: OutboxOp['type'],
): type is import('./db').GameOutboxType {
  return GAME_OUTBOX_TYPES.has(type as import('./db').GameOutboxType);
}
