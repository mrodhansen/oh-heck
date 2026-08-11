import { httpRequest } from '../api/http';
import type { GameDetail, GameSummary, StatsResponse } from '../api';
import {
  cacheGame,
  getAllCachedGames,
  kvSet,
  outboxAdd,
  outboxAll,
  outboxCount,
  outboxRemove,
  type OutboxOp,
} from './db';
import { toSummary } from './localEngine';
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
    } else {
      const id = op.payload.gameId;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
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
      const body = {
        operations: ops.map((o) => ({ type: o.type, payload: o.payload })),
      };

      const res = await httpRequest<{
        results: {
          ok: boolean;
          type: string;
          error?: string;
          data?: unknown;
        }[];
      }>('/games/sync', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!Array.isArray(res.results) || res.results.length === 0) {
        return { flushed: 0, error: 'Sync returned no results' };
      }

      const doneIds: string[] = [];
      let error: string | undefined;
      for (let i = 0; i < res.results.length; i++) {
        const r = res.results[i];
        if (r.ok) {
          doneIds.push(ops[i].id);
          if (
            r.data &&
            typeof r.data === 'object' &&
            r.data !== null &&
            'id' in (r.data as object) &&
            'players' in (r.data as object) &&
            'rounds' in (r.data as object)
          ) {
            await cacheGame(r.data as GameDetail);
          }
        } else {
          error = r.error ?? 'Sync failed';
          break;
        }
      }

      if (!error && doneIds.length < ops.length) {
        error = 'Sync incomplete';
      }

      if (doneIds.length) await outboxRemove(doneIds);

      if (error) {
        lastSyncError = error;
      } else {
        lastSyncError = null;
      }

      const cached = await getAllCachedGames<GameDetail>();
      await kvSet(
        'gameList',
        cached
          .map(toSummary)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
      );

      return { flushed: doneIds.length, error };
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
  const pending = await gameIdsWithPendingOps();
  try {
    const list = await httpRequest<GameSummary[]>('/games');
    const localGames = await getAllCachedGames<GameDetail>();
    const byId = new Map(list.map((g) => [g.id, g]));
    for (const g of localGames) {
      if (pending.has(g.id) || !byId.has(g.id)) {
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
      .filter((g) => g.status !== 'COMPLETED' && !pending.has(g.id))
      .slice(0, 10);
    for (const g of warm) {
      try {
        const detail = await httpRequest<GameDetail>(`/games/${g.id}`);
        if (!pending.has(detail.id)) await cacheGame(detail);
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
    void syncNow();
  });
  setInterval(() => {
    if (isOnline()) void flushOutbox();
  }, 30_000);
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
