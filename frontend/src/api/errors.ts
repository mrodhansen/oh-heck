export const ApiErrorCode = {
  NETWORK: 'NETWORK',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_CODE_NOT_FOUND: 'GAME_CODE_NOT_FOUND',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  ROUND_NOT_FOUND: 'ROUND_NOT_FOUND',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  VALIDATION: 'VALIDATION',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL: 'INTERNAL',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export class NetworkError extends Error {
  readonly code = ApiErrorCode.NETWORK;

  constructor(
    message = 'Could not reach the server. Check your connection.',
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class HttpError extends Error {
  readonly name = 'HttpError';

  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly details?: string[],
  ) {
    super(message);
  }
}

export type ParsedApiError = {
  message: string;
  code: ApiErrorCode;
  details?: string[];
};

const KNOWN_CODES = new Set<string>(Object.values(ApiErrorCode));

export function isApiErrorCode(value: string): value is ApiErrorCode {
  return KNOWN_CODES.has(value);
}

export function parseApiErrorBody(body: unknown, status: number): ParsedApiError {
  if (typeof body === 'string' && body.trim()) {
    return { message: body.trim(), code: codeFromStatus(status, body) };
  }
  if (!body || typeof body !== 'object') {
    return {
      message: fallbackForStatus(status),
      code: codeFromStatus(status),
    };
  }

  const rec = body as { [key: string]: unknown };
  const details = Array.isArray(rec.details)
    ? rec.details.filter((d): d is string => typeof d === 'string')
    : undefined;

  let message = '';
  if (typeof rec.message === 'string' && rec.message.trim()) {
    message = rec.message.trim();
  } else if (Array.isArray(rec.message)) {
    message = rec.message
      .filter((m): m is string => typeof m === 'string')
      .join(', ');
  } else if (typeof rec.error === 'string' && rec.error.trim()) {
    message = rec.error.trim();
  }

  const rawCode = typeof rec.code === 'string' ? rec.code : '';
  const code = isApiErrorCode(rawCode)
    ? rawCode
    : codeFromStatus(status, message);

  return {
    message: message || fallbackForStatus(status),
    code,
    details: details && details.length ? details : undefined,
  };
}

export function toUserMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof NetworkError) return err.message;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export function isNetworkFailure(err: unknown): boolean {
  return err instanceof NetworkError;
}

function codeFromStatus(status: number, message = ''): ApiErrorCode {
  const m = message.toLowerCase();
  if (
    m.includes('no account') ||
    m.includes('user not found') ||
    m.includes('account with that username') ||
    m.includes('username or email')
  ) {
    return ApiErrorCode.USER_NOT_FOUND;
  }
  if (m.includes('incorrect password') || m.includes('invalid username or password')) {
    return ApiErrorCode.INVALID_CREDENTIALS;
  }
  if (m.includes('email already')) return ApiErrorCode.EMAIL_TAKEN;
  if (m.includes('game code not found')) return ApiErrorCode.GAME_CODE_NOT_FOUND;
  if (m.includes('game not found')) return ApiErrorCode.GAME_NOT_FOUND;
  if (m.includes('player not found')) return ApiErrorCode.PLAYER_NOT_FOUND;
  if (m.includes('session not found')) return ApiErrorCode.SESSION_NOT_FOUND;
  if (m.includes('tournament not found')) return ApiErrorCode.TOURNAMENT_NOT_FOUND;
  if (status === 404) return ApiErrorCode.NOT_FOUND;
  if (status === 401) return ApiErrorCode.UNAUTHORIZED;
  if (status === 403) return ApiErrorCode.FORBIDDEN;
  if (status === 409) return ApiErrorCode.CONFLICT;
  if (status === 400) return ApiErrorCode.BAD_REQUEST;
  if (status >= 500) return ApiErrorCode.INTERNAL;
  return ApiErrorCode.UNKNOWN;
}

function fallbackForStatus(status: number): string {
  if (status === 401) return 'Sign in required';
  if (status === 403) return 'You cannot do that';
  if (status === 404) return 'Not found';
  if (status === 409) return 'That conflicts with existing data';
  if (status === 400) return 'Invalid request';
  if (status >= 500) return 'Something went wrong on the server';
  return `Request failed (${status})`;
}
