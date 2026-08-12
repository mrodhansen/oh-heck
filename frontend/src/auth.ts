import { httpRequest } from './api/http';
import type { StatsPlayer } from './api';

export type AuthUser = {
  id: string;
  username: string;
  createdAt: string;
};

export type ClaimableGame = {
  id: string;
  name: string | null;
  status: string;
  playMode: string;
  createdAt: string;
  finishedAt: string | null;
  players: {
    id: string;
    name: string;
    seatIndex: number;
    userId: string | null;
    claimable: boolean;
  }[];
};

export const authApi = {
  me: () => httpRequest<{ user: AuthUser | null }>('/auth/me'),

  register: (username: string, password: string) =>
    httpRequest<{ user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    httpRequest<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    httpRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  update: (data: { username?: string; password?: string }) =>
    httpRequest<{ user: AuthUser }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  myStats: () =>
    httpRequest<{ user: AuthUser; stats: StatsPlayer | null }>(
      '/auth/me/stats',
    ),

  claimable: () => httpRequest<ClaimableGame[]>('/auth/me/claimable'),

  claim: (gameId: string, playerId: string) =>
    httpRequest<{ ok: boolean; alreadyClaimed?: boolean }>(
      `/auth/games/${gameId}/claim`,
      {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      },
    ),
};
