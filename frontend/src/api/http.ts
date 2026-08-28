import {
  ApiStartingError,
  HttpError,
  NetworkError,
  parseApiErrorBody,
} from './errors';
import { apiBaseUrl } from './baseUrl';
import { isHoldingPage, noteApiReady, noteApiStarting } from './health';

const API_URL = apiBaseUrl();

const TOKEN_KEY = 'oh_heck_session';

export { ApiStartingError, HttpError, NetworkError } from './errors';
export { toUserMessage, isNetworkFailure as isNetworkError } from './errors';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / blocked storage */
  }
}

function looksLikeFetchFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m === 'network request failed'
  );
}

export async function httpRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has('Content-Type') && init?.body != null) {
      headers.set('Content-Type', 'application/json');
    }
    const token = getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    // Free ngrok interstitial breaks SPA fetch without this header
    if (API_URL.includes('ngrok')) {
      headers.set('ngrok-skip-browser-warning', 'true');
    }
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });
  } catch (e) {
    if (looksLikeFetchFailure(e)) {
      throw new NetworkError();
    }
    throw e instanceof Error ? e : new NetworkError();
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    noteApiStarting();
    throw new ApiStartingError();
  }

  if (!res.ok) {
    let parsedBody: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsedBody = JSON.parse(text) as unknown;
      } catch {
        parsedBody = text;
      }
    }
    const parsed = parseApiErrorBody(parsedBody, res.status);
    throw new HttpError(parsed.message, res.status, parsed.code, parsed.details);
  }

  if (res.status === 204) {
    noteApiReady();
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    noteApiReady();
    return undefined as T;
  }
  const ct = res.headers.get('content-type') ?? '';
  if (isHoldingPage(ct, text) || !ct.includes('application/json')) {
    noteApiStarting();
    throw new ApiStartingError();
  }
  noteApiReady();
  return JSON.parse(text) as T;
}
