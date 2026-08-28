import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  SCORECARD_PROMPT,
  assertImageSize,
  grokConfig,
  readScorecardWithGrok,
  splitImagePayload,
} from './grok-vision';

describe('SCORECARD_PROMPT', () => {
  it('pins the paper-sheet layout so bid and tricks are not swapped', () => {
    expect(SCORECARD_PROMPT).toMatch(/BID \/ TRICKS TAKEN/);
    expect(SCORECARD_PROMPT).toMatch(/LEFT or TOP of the slash = bid/);
    expect(SCORECARD_PROMPT).toMatch(/RIGHT or BOTTOM of the slash = tricksTaken/);
    expect(SCORECARD_PROMPT).toMatch(/7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7/);
    expect(SCORECARD_PROMPT).toMatch(/RUNNING TOTAL/);
    expect(SCORECARD_PROMPT).toMatch(/letters "FB"/);
    expect(SCORECARD_PROMPT).toMatch(/sum of tricksTaken across players MUST equal/);
  });
});

describe('splitImagePayload', () => {
  it('reads a JPEG data URL', () => {
    const raw = 'data:image/jpeg;base64,abcd+/==';
    expect(splitImagePayload(raw)).toEqual({
      base64: 'abcd+/==',
      mimeType: 'image/jpeg',
    });
  });

  it('rejects an unsupported data URL mime', () => {
    expect(() => splitImagePayload('data:image/gif;base64,aaaa')).toThrow(
      /JPEG, PNG, or WebP/,
    );
  });
});

describe('assertImageSize', () => {
  it('rejects tiny payloads', () => {
    expect(() => assertImageSize('abc')).toThrow(/empty/);
  });
});

describe('grokConfig', () => {
  it('fails when XAI_API_KEY and OpenCode xAI login are both missing', async () => {
    const prevKey = process.env.XAI_API_KEY;
    const prevPath = process.env.OPENCODE_AUTH_PATH;
    delete process.env.XAI_API_KEY;
    process.env.OPENCODE_AUTH_PATH = '/tmp/oh-heck-missing-opencode-auth.json';
    try {
      await expect(grokConfig()).rejects.toThrow(BadRequestException);
      await expect(grokConfig()).rejects.toThrow(/XAI_API_KEY and OpenCode/);
    } finally {
      if (prevKey !== undefined) process.env.XAI_API_KEY = prevKey;
      else delete process.env.XAI_API_KEY;
      if (prevPath !== undefined) process.env.OPENCODE_AUTH_PATH = prevPath;
      else delete process.env.OPENCODE_AUTH_PATH;
    }
  });
});

describe('readScorecardWithGrok', () => {
  it('returns the assistant text on success', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const text = await readScorecardWithGrok({
      base64: 'a'.repeat(40),
      mimeType: 'image/jpeg',
      apiKey: 'test-key',
      model: 'grok-2-vision-1212',
      fetchImpl,
    });
    expect(text).toBe('{"ok":true}');
  });

  it('surfaces API error messages', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'quota' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    await expect(
      readScorecardWithGrok({
        base64: 'a'.repeat(40),
        mimeType: 'image/jpeg',
        apiKey: 'test-key',
        model: 'grok-2-vision-1212',
        fetchImpl,
      }),
    ).rejects.toThrow(/quota/);
  });
});
