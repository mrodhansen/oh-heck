import { apiBaseUrl } from './baseUrl';

export type ApiStatus = 'unknown' | 'offline' | 'waking' | 'ready';

const API_URL = apiBaseUrl();
const WAKE_POLL_MS = 2_000;

const listeners = new Set<(status: ApiStatus) => void>();

let status: ApiStatus = 'unknown';
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let probeInFlight: Promise<ApiStatus> | null = null;

export function getApiStatus(): ApiStatus {
  return status;
}

export function isApiReady(): boolean {
  return status === 'ready';
}

export function onApiStatusChange(
  fn: (status: ApiStatus) => void,
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(next: ApiStatus): void {
  if (status === next) return;
  status = next;
  for (const fn of listeners) fn(status);
}

export function isHoldingPage(contentType: string, body: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('application/json')) return false;
  if (ct.includes('text/html')) return true;
  const t = body.trimStart().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

export function isHealthOkBody(body: unknown): body is { ok: true } {
  if (typeof body !== 'object' || body === null) return false;
  return Reflect.get(body, 'ok') === true;
}

function deviceOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export async function probeHealth(): Promise<ApiStatus> {
  if (!deviceOnline()) return 'offline';

  try {
    const res = await fetch(`${API_URL}/health`, { credentials: 'include' });
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return 'waking';
    }
    const text = await res.text();
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || isHoldingPage(ct, text) || !ct.includes('application/json')) {
      return 'waking';
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return 'waking';
    }
    return isHealthOkBody(parsed) ? 'ready' : 'waking';
  } catch {
    return deviceOnline() ? 'waking' : 'offline';
  }
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePoll(): void {
  stopPolling();
  pollTimer = setTimeout(() => {
    void runProbe();
  }, WAKE_POLL_MS);
}

async function runProbe(): Promise<ApiStatus> {
  if (probeInFlight) return probeInFlight;
  probeInFlight = (async () => {
    if (!deviceOnline()) {
      setStatus('offline');
      stopPolling();
      return 'offline';
    }
    if (status === 'unknown' || status === 'offline') {
      setStatus('waking');
    }
    const next = await probeHealth();
    setStatus(next);
    if (next === 'ready' || next === 'offline') {
      stopPolling();
    } else {
      schedulePoll();
    }
    return next;
  })().finally(() => {
    probeInFlight = null;
  });
  return probeInFlight;
}

export function noteApiReady(): void {
  setStatus('ready');
  stopPolling();
}

export function noteApiStarting(): void {
  if (!deviceOnline()) {
    setStatus('offline');
    stopPolling();
    return;
  }
  setStatus('waking');
  if (started && pollTimer === null && !probeInFlight) {
    schedulePoll();
  }
}

export function startApiStatusWatcher(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => {
    void runProbe();
  });
  window.addEventListener('offline', () => {
    setStatus('offline');
    stopPolling();
  });
  void runProbe();
}

export function resetApiStatusForTests(): void {
  stopPolling();
  status = 'unknown';
  started = false;
  probeInFlight = null;
  listeners.clear();
}
