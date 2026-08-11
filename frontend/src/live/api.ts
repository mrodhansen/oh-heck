import { httpRequest } from '../api/http';
import type { LiveLookup, LiveView } from './types';

export type LiveCreateResult = LiveView & {
  token: string;
  playerId: string;
};

export const liveApi = {
  create: (name: string) =>
    httpRequest<LiveCreateResult>('/live', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  join: (code: string, name: string) =>
    httpRequest<LiveCreateResult>('/live/join', {
      method: 'POST',
      body: JSON.stringify({ code, name }),
    }),

  claim: (code: string, playerId: string) =>
    httpRequest<LiveCreateResult>('/live/claim', {
      method: 'POST',
      body: JSON.stringify({ code, playerId }),
    }),

  leave: (id: string, token: string) =>
    httpRequest<{
      ok: boolean;
      removed?: boolean;
      ended?: boolean;
      gone?: boolean;
      alreadyGone?: boolean;
    }>(`/live/${id}/leave`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  lookup: (code: string) =>
    httpRequest<LiveLookup>(`/live/code/${encodeURIComponent(code)}`),

  get: (id: string, token: string) =>
    httpRequest<LiveView>(`/live/${id}`, {
      headers: { 'x-live-token': token },
    }),

  start: (id: string, token: string) =>
    httpRequest<LiveView>(`/live/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  bid: (id: string, token: string, bid: number, forceBurn?: boolean) =>
    httpRequest<LiveView>(`/live/${id}/bid`, {
      method: 'POST',
      body: JSON.stringify({ token, bid, forceBurn }),
    }),

  play: (id: string, token: string, card: string) =>
    httpRequest<LiveView>(`/live/${id}/play`, {
      method: 'POST',
      body: JSON.stringify({ token, card }),
    }),
};
