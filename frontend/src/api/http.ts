const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes('failed to fetch') ||
      m.includes('network') ||
      m.includes('load failed') ||
      m.includes('offline')
    );
  }
  return false;
}

export async function httpRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };
    // Free ngrok interstitial breaks SPA fetch without this header
    if (API_URL.includes('ngrok')) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });
  } catch (e) {
    throw new Error(
      isNetworkError(e) ? 'Network error' : e instanceof Error ? e.message : 'Request failed',
    );
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as {
        message?: string | string[];
      };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (body.message) message = body.message;
    } catch {
      /* ignore body parse */
    }
    throw new HttpError(message || `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
