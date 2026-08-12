const DB_NAME = 'oh-heck';
const DB_VERSION = 2;

export type GameOutboxType =
  | 'createGame'
  | 'setBids'
  | 'setTricks'
  | 'updateRound'
  | 'updateNotes';

export type TournamentOutboxType =
  | 'createTournament'
  | 'addTournamentPlayer'
  | 'removeTournamentPlayer'
  | 'seatTournament'
  | 'startTournamentTable';

export type OutboxOpType = GameOutboxType | TournamentOutboxType;

export type OutboxOp = {
  id: string;
  type: OutboxOpType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export const TOURNAMENT_OUTBOX_TYPES: ReadonlySet<string> = new Set([
  'createTournament',
  'addTournamentPlayer',
  'removeTournamentPlayer',
  'seatTournament',
  'startTournamentTable',
]);

export const GAME_OUTBOX_TYPES: ReadonlySet<string> = new Set([
  'createGame',
  'setBids',
  'setTricks',
  'updateRound',
  'updateNotes',
]);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        const store = db.createObjectStore('outbox', { keyPath: 'id' });
        store.createIndex('byCreated', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('games')) {
        db.createObjectStore('games', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tournaments')) {
        db.createObjectStore('tournaments', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let req: IDBRequest<T> | undefined;
    try {
      const result = fn(store);
      if (result) req = result;
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error('IDB tx failed'));
    if (req) {
      req.onerror = () => reject(req!.error ?? new Error('IDB req failed'));
    }
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await withStore('kv', 'readwrite', (store) => store.put(value, key));
}

export async function outboxAdd(op: OutboxOp): Promise<void> {
  await withStore('outbox', 'readwrite', (store) => store.put(op));
}

export async function outboxAll(): Promise<OutboxOp[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const req = tx.objectStore('outbox').index('byCreated').getAll();
    req.onsuccess = () => resolve((req.result as OutboxOp[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function outboxRemove(ids: string[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function outboxCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const req = tx.objectStore('outbox').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheGame(game: { id: string }): Promise<void> {
  await withStore('games', 'readwrite', (store) => store.put(game));
}

export async function getCachedGame<T>(id: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readonly');
    const req = tx.objectStore('games').get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCachedGames<T>(): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readonly');
    const req = tx.objectStore('games').getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheTournament(t: { id: string }): Promise<void> {
  await withStore('tournaments', 'readwrite', (store) => store.put(t));
}

export async function getCachedTournament<T>(
  id: string,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tournaments', 'readonly');
    const req = tx.objectStore('tournaments').get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCachedTournaments<T>(): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tournaments', 'readonly');
    const req = tx.objectStore('tournaments').getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}
