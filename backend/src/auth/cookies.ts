import type { Request, Response } from 'express';
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC } from './auth.constants';

export function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== SESSION_COOKIE) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/** Bearer header first (SPA / PWA), then the session cookie. */
export function readAuthToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header) {
    const match = /^Bearer\s+(\S+)/i.exec(header);
    if (match?.[1]) return match[1];
  }
  return readSessionToken(req);
}

/**
 * Cross-origin SPA (GitHub Pages / Vite → API) cannot send SameSite=Lax
 * cookies on fetch(). Use None+Secure+Partitioned so the browser will
 * store and return the cookie on credentialed XHR. Override with
 * COOKIE_SAMESITE=lax|strict and COOKIE_SECURE=true|false.
 */
function cookieFlags(res: Response): string[] {
  const req = res.req;
  const xf = String(req?.headers?.['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim();
  const host = req?.hostname ?? '';
  const local =
    host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const https =
    process.env.COOKIE_SECURE === 'true' ||
    xf === 'https' ||
    req?.secure === true ||
    local;

  const raw = (process.env.COOKIE_SAMESITE ?? 'none').toLowerCase();
  const sameSite =
    raw === 'lax' || raw === 'strict' ? raw : 'none';

  const flags = [
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite === 'none' ? 'None' : sameSite === 'strict' ? 'Strict' : 'Lax'}`,
  ];
  // SameSite=None is rejected unless Secure. localhost counts as a secure context.
  if (sameSite === 'none' || https) flags.push('Secure');
  if (sameSite === 'none') flags.push('Partitioned');
  return flags;
}

export function setSessionCookie(res: Response, token: string) {
  res.append(
    'Set-Cookie',
    [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      ...cookieFlags(res),
      `Max-Age=${SESSION_MAX_AGE_SEC}`,
    ].join('; '),
  );
}

export function clearSessionCookie(res: Response) {
  res.append(
    'Set-Cookie',
    [
      `${SESSION_COOKIE}=`,
      ...cookieFlags(res),
      'Max-Age=0',
    ].join('; '),
  );
}
