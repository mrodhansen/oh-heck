import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const ApiErrorCode = {
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
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export type ApiErrorBody = {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: string[];
};

export class AppException extends HttpException {
  readonly code: ApiErrorCode;

  constructor(status: HttpStatus, code: ApiErrorCode, message: string) {
    super({ statusCode: status, code, message }, status);
    this.code = code;
  }
}

export function notFound(code: ApiErrorCode, message: string): AppException {
  return new AppException(HttpStatus.NOT_FOUND, code, message);
}

export function badRequest(message: string, code: ApiErrorCode = ApiErrorCode.BAD_REQUEST): AppException {
  return new AppException(HttpStatus.BAD_REQUEST, code, message);
}

export function unauthorized(
  message: string,
  code: ApiErrorCode = ApiErrorCode.UNAUTHORIZED,
): AppException {
  return new AppException(HttpStatus.UNAUTHORIZED, code, message);
}

export function forbidden(message: string): AppException {
  return new AppException(HttpStatus.FORBIDDEN, ApiErrorCode.FORBIDDEN, message);
}

export function conflict(message: string, code: ApiErrorCode = ApiErrorCode.CONFLICT): AppException {
  return new AppException(HttpStatus.CONFLICT, code, message);
}

export function exceptionMessage(err: unknown): string {
  if (err instanceof HttpException) {
    return messageFromHttpException(err).message;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return 'Unexpected error';
}

export function mapException(exception: unknown): ApiErrorBody {
  if (exception instanceof AppException) {
    return {
      statusCode: exception.getStatus(),
      code: exception.code,
      message: exceptionMessage(exception),
    };
  }

  if (exception instanceof HttpException) {
    const parsed = messageFromHttpException(exception);
    const status = exception.getStatus();
    return {
      statusCode: status,
      code: inferCode(status, parsed.message, parsed.details),
      message: parsed.message,
      details: parsed.details,
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaError(exception);
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ApiErrorCode.INTERNAL,
    message: 'Something went wrong',
  };
}

function messageFromHttpException(exception: HttpException): {
  message: string;
  details?: string[];
} {
  const raw = exception.getResponse();
  if (typeof raw === 'string') {
    return { message: raw };
  }
  if (!raw || typeof raw !== 'object') {
    return { message: exception.message || 'Request failed' };
  }

  const rec = raw as {
    message?: string | string[];
    code?: string;
    error?: string;
  };
  if (Array.isArray(rec.message)) {
    const details = rec.message.filter((m): m is string => typeof m === 'string');
    return {
      message: details.join(', ') || rec.error || exception.message || 'Invalid request',
      details: details.length ? details : undefined,
    };
  }
  if (typeof rec.message === 'string' && rec.message.trim()) {
    return { message: rec.message };
  }
  if (typeof rec.error === 'string' && rec.error.trim()) {
    return { message: rec.error };
  }
  return { message: exception.message || 'Request failed' };
}

function inferCode(
  status: number,
  message: string,
  details?: string[],
): ApiErrorCode {
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
  if (m.includes('username already taken')) return ApiErrorCode.USERNAME_TAKEN;
  if (m.includes('email already')) return ApiErrorCode.EMAIL_TAKEN;
  if (m.includes('sign in required')) return ApiErrorCode.SIGN_IN_REQUIRED;
  if (m.includes('game code not found')) return ApiErrorCode.GAME_CODE_NOT_FOUND;
  if (m.includes('game not found')) return ApiErrorCode.GAME_NOT_FOUND;
  if (m.includes('player not found')) return ApiErrorCode.PLAYER_NOT_FOUND;
  if (m.includes('session not found')) return ApiErrorCode.SESSION_NOT_FOUND;
  if (m.includes('tournament not found')) return ApiErrorCode.TOURNAMENT_NOT_FOUND;
  if (m.includes('table not found')) return ApiErrorCode.TABLE_NOT_FOUND;
  if (m.includes('round') && m.includes('not found')) return ApiErrorCode.ROUND_NOT_FOUND;
  if (details && details.length > 0 && status === 400) return ApiErrorCode.VALIDATION;
  if (status === 404) return ApiErrorCode.NOT_FOUND;
  if (status === 401) return ApiErrorCode.UNAUTHORIZED;
  if (status === 403) return ApiErrorCode.FORBIDDEN;
  if (status === 409) return ApiErrorCode.CONFLICT;
  if (status === 400) return ApiErrorCode.BAD_REQUEST;
  if (status >= 500) return ApiErrorCode.INTERNAL;
  return ApiErrorCode.BAD_REQUEST;
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): ApiErrorBody {
  if (e.code === 'P2025') {
    return {
      statusCode: HttpStatus.NOT_FOUND,
      code: ApiErrorCode.NOT_FOUND,
      message: 'Record not found',
    };
  }
  if (e.code === 'P2002') {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: ApiErrorCode.CONFLICT,
      message: 'That value is already in use',
    };
  }
  if (e.code === 'P2003') {
    const field = prismaMetaField(e.meta);
    if (field.toLowerCase().includes('user')) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        code: ApiErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      };
    }
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: ApiErrorCode.BAD_REQUEST,
      message: 'Referenced record was not found',
    };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ApiErrorCode.INTERNAL,
    message: 'Something went wrong',
  };
}

function prismaMetaField(meta: Record<string, unknown> | undefined): string {
  if (!meta) return '';
  const field = meta.field_name;
  return typeof field === 'string' ? field : '';
}


