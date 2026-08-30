import { describe, expect, it } from 'vitest';
import { tvScoreboardHref, tvScoreboardPath } from './tvUrl';

describe('tvScoreboardPath', () => {
  it('builds the TV board route', () => {
    expect(tvScoreboardPath('abc-123')).toBe('/games/abc-123/tv');
  });

  it('fails without a game id', () => {
    expect(() => tvScoreboardPath('')).toThrow('Missing game id');
  });
});

describe('tvScoreboardHref', () => {
  it('joins origin and base url', () => {
    expect(
      tvScoreboardHref('g1', 'https://o-heck.com', '/'),
    ).toBe('https://o-heck.com/games/g1/tv');
  });

  it('keeps a non-root base without a double slash', () => {
    expect(
      tvScoreboardHref('g1', 'https://example.com', '/oh-heck/'),
    ).toBe('https://example.com/oh-heck/games/g1/tv');
  });
});
