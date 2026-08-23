import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isHealthOkBody,
  isHoldingPage,
  probeHealth,
  resetApiStatusForTests,
} from './health';

afterEach(() => {
  resetApiStatusForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isHoldingPage', () => {
  it('detects Sablier HTML and rejects JSON', () => {
    expect(isHoldingPage('text/html; charset=utf-8', '<html>wait</html>')).toBe(
      true,
    );
    expect(
      isHoldingPage('text/plain', '<!DOCTYPE html><title>oh-heck</title>'),
    ).toBe(true);
    expect(isHoldingPage('application/json', '{"ok":true}')).toBe(false);
  });
});

describe('isHealthOkBody', () => {
  it('requires ok: true', () => {
    expect(isHealthOkBody({ ok: true })).toBe(true);
    expect(isHealthOkBody({ ok: false })).toBe(false);
    expect(isHealthOkBody(null)).toBe(false);
    expect(isHealthOkBody('ok')).toBe(false);
  });
});

describe('probeHealth', () => {
  it('returns offline when the device has no network', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(probeHealth()).resolves.toBe('offline');
  });

  it('returns ready on JSON {ok:true}', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(probeHealth()).resolves.toBe('ready');
  });

  it('returns waking on Sablier HTML 200', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!DOCTYPE html><html><body>starting</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    await expect(probeHealth()).resolves.toBe('waking');
  });

  it('returns waking on 502 while the container starts', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })),
    );
    await expect(probeHealth()).resolves.toBe('waking');
  });
});
