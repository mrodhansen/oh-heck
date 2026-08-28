import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';
import {
  accessTokenIsExpiring,
  oauthRefreshError,
  resolveGrokConfig,
} from './grok-auth';

function jwtExp(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds }), 'utf8')
    .toString('base64')
    .replace(/=+$/, '');
  return `eyJhbGciOiJub25lIn0.${payload}.sig`;
}

describe('oauthRefreshError', () => {
  it('tells the user to reconnect OpenCode on invalid_grant', () => {
    expect(
      oauthRefreshError(
        400,
        '{"error":"invalid_grant","error_description":"Invalid or unknown refresh token"}',
      ),
    ).toMatch(/\/connect/);
  });
});

describe('accessTokenIsExpiring', () => {
  it('is true when JWT exp is in the past', () => {
    expect(accessTokenIsExpiring(jwtExp(1_700_000_000), Date.now())).toBe(true);
  });

  it('is false when JWT exp is far in the future', () => {
    const far = Math.floor(Date.now() / 1000) + 86_400;
    expect(accessTokenIsExpiring(jwtExp(far), Date.now())).toBe(false);
  });
});

describe('resolveGrokConfig', () => {
  it('prefers XAI_API_KEY over OpenCode auth', async () => {
    const prev = process.env.XAI_API_KEY;
    process.env.XAI_API_KEY = 'env-key';
    try {
      const cfg = await resolveGrokConfig();
      expect(cfg.source).toBe('env');
      expect(cfg.apiKey).toBe('env-key');
    } finally {
      if (prev !== undefined) process.env.XAI_API_KEY = prev;
      else delete process.env.XAI_API_KEY;
    }
  });

  it('uses OpenCode SuperGrok OAuth and refreshes when expired', async () => {
    const prevKey = process.env.XAI_API_KEY;
    const prevPath = process.env.OPENCODE_AUTH_PATH;
    const prevModel = process.env.XAI_MODEL;
    delete process.env.XAI_API_KEY;
    delete process.env.XAI_MODEL;
    const dir = join(tmpdir(), `oh-heck-auth-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'auth.json');
    writeFileSync(
      path,
      JSON.stringify({
        xai: {
          type: 'oauth',
          access: jwtExp(1),
          refresh: 'old-refresh',
          expires: 1,
        },
      }),
    );
    process.env.OPENCODE_AUTH_PATH = path;
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    try {
      const cfg = await resolveGrokConfig({ fetchImpl });
      expect(cfg.source).toBe('opencode-oauth');
      expect(cfg.apiKey).toBe('new-access');
      expect(cfg.model).toBe('grok-4');
      const written = JSON.parse(readFileSync(path, 'utf8')) as {
        xai: { access: string; refresh: string };
      };
      expect(written.xai.access).toBe('new-access');
      expect(written.xai.refresh).toBe('new-refresh');
    } finally {
      if (prevKey !== undefined) process.env.XAI_API_KEY = prevKey;
      if (prevPath !== undefined) process.env.OPENCODE_AUTH_PATH = prevPath;
      else delete process.env.OPENCODE_AUTH_PATH;
      if (prevModel !== undefined) process.env.XAI_MODEL = prevModel;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
