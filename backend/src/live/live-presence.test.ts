import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_DISCONNECT_GRACE_MS,
  LivePresence,
  parseLiveRoom,
} from './live-presence';

describe('parseLiveRoom', () => {
  it('reads the session id', () => {
    expect(parseLiveRoom('live:abc-123')).toBe('abc-123');
  });

  it('rejects other rooms', () => {
    expect(parseLiveRoom('game:abc')).toBeNull();
    expect(parseLiveRoom('live:')).toBeNull();
    expect(parseLiveRoom('live:  ')).toBeNull();
  });
});

describe('LivePresence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not drop if the socket rebinds before the grace ends', () => {
    vi.useFakeTimers();
    const onDrop = vi.fn();
    const p = new LivePresence(onDrop, LIVE_DISCONNECT_GRACE_MS);
    p.bind('s1', 'sess', 'p1');
    p.unbind('s1');
    vi.advanceTimersByTime(LIVE_DISCONNECT_GRACE_MS - 1);
    p.bind('s2', 'sess', 'p1');
    vi.advanceTimersByTime(LIVE_DISCONNECT_GRACE_MS);
    expect(onDrop).not.toHaveBeenCalled();
    p.dispose();
  });

  it('drops after grace when no socket remains', () => {
    vi.useFakeTimers();
    const onDrop = vi.fn();
    const p = new LivePresence(onDrop, LIVE_DISCONNECT_GRACE_MS);
    p.bind('s1', 'sess', 'p1');
    p.unbind('s1');
    vi.advanceTimersByTime(LIVE_DISCONNECT_GRACE_MS - 1);
    expect(onDrop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith({ sessionId: 'sess', playerId: 'p1' });
    p.dispose();
  });

  it('keeps the seat if another socket is still bound', () => {
    vi.useFakeTimers();
    const onDrop = vi.fn();
    const p = new LivePresence(onDrop, LIVE_DISCONNECT_GRACE_MS);
    p.bind('s1', 'sess', 'p1');
    p.bind('s2', 'sess', 'p1');
    p.unbind('s1');
    vi.advanceTimersByTime(LIVE_DISCONNECT_GRACE_MS);
    expect(onDrop).not.toHaveBeenCalled();
    p.dispose();
  });
});
