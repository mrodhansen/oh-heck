export const LIVE_DISCONNECT_GRACE_MS = 8_000;

export type LiveSocketDrop = {
  sessionId: string;
  playerId: string;
};

export function parseLiveRoom(room: string): string | null {
  if (!room.startsWith('live:')) return null;
  const id = room.slice('live:'.length).trim();
  return id.length > 0 ? id : null;
}

export class LivePresence {
  private readonly sockets = new Map<
    string,
    { sessionId: string; playerId: string }
  >();
  private readonly seats = new Map<string, Set<string>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly onDrop: (drop: LiveSocketDrop) => void,
    private readonly graceMs = LIVE_DISCONNECT_GRACE_MS,
  ) {}

  static seatKey(sessionId: string, playerId: string) {
    return `${sessionId}:${playerId}`;
  }

  bind(socketId: string, sessionId: string, playerId: string) {
    this.unbind(socketId, false);
    const key = LivePresence.seatKey(sessionId, playerId);
    this.clearTimer(key);
    this.sockets.set(socketId, { sessionId, playerId });
    let set = this.seats.get(key);
    if (!set) {
      set = new Set();
      this.seats.set(key, set);
    }
    set.add(socketId);
  }

  unbind(socketId: string, scheduleDrop = true) {
    const bind = this.sockets.get(socketId);
    if (!bind) return;
    this.sockets.delete(socketId);
    const key = LivePresence.seatKey(bind.sessionId, bind.playerId);
    const set = this.seats.get(key);
    set?.delete(socketId);
    if (set && set.size === 0) {
      this.seats.delete(key);
      if (scheduleDrop) this.scheduleDrop(bind);
    }
  }

  dispose() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.sockets.clear();
    this.seats.clear();
  }

  private scheduleDrop(bind: { sessionId: string; playerId: string }) {
    const key = LivePresence.seatKey(bind.sessionId, bind.playerId);
    this.clearTimer(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        if (this.seats.has(key)) return;
        this.onDrop(bind);
      }, this.graceMs),
    );
  }

  private clearTimer(key: string) {
    const t = this.timers.get(key);
    if (!t) return;
    clearTimeout(t);
    this.timers.delete(key);
  }
}
