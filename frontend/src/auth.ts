import { httpRequest, setAuthToken } from './api/http';
import type { StatsPlayer } from './api';

export type AuthUser = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: string;
};

export type ClaimableGame = {
  id: string;
  name: string | null;
  status: 'SETUP' | 'BIDDING' | 'PLAYING' | 'COMPLETED';
  playMode: 'IN_PERSON' | 'ONLINE';
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

  register: async (data: {
    username: string;
    firstName: string;
    lastName: string;
    email?: string;
    password: string;
  }) => {
    const res = await httpRequest<{ user: AuthUser; token: string }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
    setAuthToken(res.token);
    return res;
  },

  login: async (username: string, password: string) => {
    const res = await httpRequest<{ user: AuthUser; token: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
    );
    setAuthToken(res.token);
    return res;
  },

  logout: async () => {
    try {
      return await httpRequest<{ ok: boolean }>('/auth/logout', {
        method: 'POST',
      });
    } finally {
      setAuthToken(null);
    }
  },

  update: (data: { password: string }) =>
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
