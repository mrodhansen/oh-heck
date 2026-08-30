import type { GameDetail } from '../api';
import { tvGameStatus } from './tvStatus';

export const CAST_NAMESPACE = 'urn:x-cast:com.ohheck.board';
/** Custom Receiver registered at cast.google.com/publish */
export const CAST_APP_ID = 'D18AB8E0';
const CAST_MAX_BYTES = 60_000;

export type CastBoardEntry = {
  playerId: string;
  bid: number | null;
  tricksTaken: number | null;
  points: number | null;
};

export type CastBoardRound = {
  number: number;
  handSize: number;
  forceBurn: boolean;
  complete: boolean;
  entries: CastBoardEntry[];
};

export type CastBoardStanding = {
  playerId: string;
  playerName: string;
  place: number;
  total: number;
};

export type CastBoardPlayer = {
  id: string;
  name: string;
};

export type CastBoardMessage = {
  type: 'board';
  name: string;
  statusLine: string;
  players: CastBoardPlayer[];
  standings: CastBoardStanding[];
  rounds: CastBoardRound[];
};

export function toCastBoardMessage(game: GameDetail): CastBoardMessage {
  return {
    type: 'board',
    name: game.name?.trim() || 'Oh Heck',
    statusLine: tvGameStatus(game),
    players: game.players.map((p) => ({ id: p.id, name: p.name })),
    standings: [...game.standings]
      .sort((a, b) => a.place - b.place)
      .map((s) => ({
        playerId: s.playerId,
        playerName: s.playerName,
        place: s.place,
        total: s.total,
      })),
    rounds: game.rounds.map((r) => ({
      number: r.number,
      handSize: r.handSize,
      forceBurn: r.forceBurn,
      complete: r.complete,
      entries: r.entries.map((e) => ({
        playerId: e.playerId,
        bid: e.bid,
        tricksTaken: e.tricksTaken,
        points: e.points,
      })),
    })),
  };
}

export function assertCastMessageSize(message: CastBoardMessage): void {
  const bytes = new TextEncoder().encode(JSON.stringify(message)).length;
  if (bytes > CAST_MAX_BYTES) {
    throw new Error(`Cast payload too large (${bytes} bytes)`);
  }
}

export function getCastAppId(): string {
  const fromEnv = import.meta.env.VITE_CAST_APP_ID?.trim();
  return fromEnv || CAST_APP_ID;
}

export function isCastUserCancel(error: unknown): boolean {
  if (error === 'cancel') return true;
  if (typeof error === 'string') return error.toLowerCase() === 'cancel';
  if (typeof error !== 'object' || error === null) return false;
  if (!('code' in error)) return false;
  return error.code === 'cancel';
}
