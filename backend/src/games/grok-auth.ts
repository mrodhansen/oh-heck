import { BadRequestException } from '@nestjs/common';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

/** Public Grok-CLI / OpenCode SuperGrok OAuth client. */
export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
export const XAI_TOKEN_URL = 'https://auth.x.ai/oauth2/token';
const ACCESS_TOKEN_REFRESH_SKEW_MS = 120_000;
const DEFAULT_API_MODEL = 'grok-2-vision-1212';
const DEFAULT_OAUTH_MODEL = 'grok-4';

export type GrokAuthSource = 'env' | 'opencode-api' | 'opencode-oauth';

export type GrokConfig = {
  apiKey: string;
  model: string;
  source: GrokAuthSource;
};

type OpenCodeOAuth = {
  type: 'oauth';
  access: string;
  refresh: string;
  expires?: number;
};

type OpenCodeApi = {
  type: 'api';
  key: string;
};

type OpenCodeAuthFile = {
  xai?: OpenCodeOAuth | OpenCodeApi | unknown;
  [key: string]: unknown;
};

export function opencodeAuthPath(): string {
  const override = process.env.OPENCODE_AUTH_PATH?.trim();
  if (override) return override;
  const xdg = process.env.XDG_DATA_HOME?.trim();
  if (xdg) return join(xdg, 'opencode', 'auth.json');
  return join(homedir(), '.local', 'share', 'opencode', 'auth.json');
}

export function accessTokenIsExpiring(
  token: string,
  nowMs = Date.now(),
  skewMs = ACCESS_TOKEN_REFRESH_SKEW_MS,
): boolean {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return false;
  try {
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4 !== 0) payload += '=';
    const claims = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf8'),
    ) as { exp?: unknown };
    if (typeof claims.exp !== 'number') return false;
    return claims.exp * 1000 <= nowMs + Math.max(0, skewMs);
  } catch {
    return false;
  }
}

function isOAuth(value: unknown): value is OpenCodeOAuth {
  if (!value || typeof value !== 'object') return false;
  const rec = value as { [k: string]: unknown };
  return (
    rec.type === 'oauth' &&
    typeof rec.access === 'string' &&
    rec.access.length > 0 &&
    typeof rec.refresh === 'string' &&
    rec.refresh.length > 0
  );
}

function isApi(value: unknown): value is OpenCodeApi {
  if (!value || typeof value !== 'object') return false;
  const rec = value as { [k: string]: unknown };
  return rec.type === 'api' && typeof rec.key === 'string' && rec.key.trim().length > 0;
}

function readAuthFile(path: string): OpenCodeAuthFile | null {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as OpenCodeAuthFile;
  } catch {
    return null;
  }
}

function writeXaiAuth(path: string, current: OpenCodeAuthFile, xai: OpenCodeOAuth): void {
  const next: OpenCodeAuthFile = { ...current, xai };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8' });
}

export function oauthRefreshError(status: number, body: string): string {
  let code = '';
  let description = '';
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as { error?: unknown; error_description?: unknown };
      if (typeof rec.error === 'string') code = rec.error;
      if (typeof rec.error_description === 'string') {
        description = rec.error_description;
      }
    }
  } catch {
    /* not JSON */
  }
  if (code === 'invalid_grant') {
    return 'OpenCode Grok login expired. In OpenCode run /connect, choose xAI → SuperGrok Subscription, then try the photo again.';
  }
  if (description) {
    return `OpenCode Grok OAuth refresh failed (${status}): ${description}`;
  }
  if (code) {
    return `OpenCode Grok OAuth refresh failed (${status}): ${code}`;
  }
  return `OpenCode Grok OAuth refresh failed (${status})`;
}

export async function refreshXaiOAuth(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ access: string; refresh: string; expires: number }> {
  const res = await fetchImpl(XAI_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'opencode/oh-heck',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: XAI_OAUTH_CLIENT_ID,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new BadRequestException(oauthRefreshError(res.status, text));
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new BadRequestException('OpenCode Grok OAuth refresh returned non-JSON');
  }
  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as { access_token?: unknown }).access_token !== 'string'
  ) {
    throw new BadRequestException('OpenCode Grok OAuth refresh missing access_token');
  }
  const rec = body as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    access: rec.access_token,
    refresh: rec.refresh_token || refreshToken,
    expires: Date.now() + (rec.expires_in ?? 3600) * 1000,
  };
}

function needsRefresh(auth: OpenCodeOAuth, nowMs = Date.now()): boolean {
  if (!auth.expires || auth.expires - nowMs <= ACCESS_TOKEN_REFRESH_SKEW_MS) {
    return true;
  }
  return accessTokenIsExpiring(auth.access, nowMs);
}

function modelFor(source: GrokAuthSource): string {
  const fromEnv = process.env.XAI_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return source === 'opencode-oauth' ? DEFAULT_OAUTH_MODEL : DEFAULT_API_MODEL;
}

/**
 * Resolve a Grok bearer token.
 * 1. XAI_API_KEY
 * 2. OpenCode auth.json xAI API key
 * 3. OpenCode SuperGrok OAuth (refresh + write back rotated tokens)
 */
export async function resolveGrokConfig(
  opts?: { fetchImpl?: typeof fetch; nowMs?: number },
): Promise<GrokConfig> {
  const envKey = process.env.XAI_API_KEY?.trim();
  if (envKey) {
    return { apiKey: envKey, model: modelFor('env'), source: 'env' };
  }

  const path = opencodeAuthPath();
  const file = readAuthFile(path);
  if (!file || file.xai == null) {
    throw new BadRequestException(
      'Scorecard photo import is not configured (missing XAI_API_KEY and OpenCode xAI login)',
    );
  }

  if (isApi(file.xai)) {
    return {
      apiKey: file.xai.key.trim(),
      model: modelFor('opencode-api'),
      source: 'opencode-api',
    };
  }

  if (!isOAuth(file.xai)) {
    throw new BadRequestException(
      'OpenCode xAI login is present but is not a usable API key or OAuth token',
    );
  }

  let oauth = file.xai;
  if (needsRefresh(oauth, opts?.nowMs)) {
    const refreshed = await refreshXaiOAuth(oauth.refresh, opts?.fetchImpl);
    oauth = {
      type: 'oauth',
      access: refreshed.access,
      refresh: refreshed.refresh,
      expires: refreshed.expires,
    };
    try {
      writeXaiAuth(path, file, oauth);
    } catch {
      /* Token is usable this request; next refresh may need /connect again. */
    }
  }

  return {
    apiKey: oauth.access,
    model: modelFor('opencode-oauth'),
    source: 'opencode-oauth',
  };
}
