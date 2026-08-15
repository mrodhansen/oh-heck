import { describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  HttpError,
  NetworkError,
  parseApiErrorBody,
  toUserMessage,
} from './errors';

describe('parseApiErrorBody', () => {
  it('reads the structured API body', () => {
    expect(
      parseApiErrorBody(
        {
          statusCode: 404,
          code: 'USER_NOT_FOUND',
          message: 'No account with that username',
        },
        404,
      ),
    ).toEqual({
      message: 'No account with that username',
      code: ApiErrorCode.USER_NOT_FOUND,
    });
  });

  it('reads Nest-style message arrays', () => {
    const parsed = parseApiErrorBody(
      { statusCode: 400, message: ['name must be longer than 0'], error: 'Bad Request' },
      400,
    );
    expect(parsed.message).toBe('name must be longer than 0');
  });

  it('maps email-already-taken copy', () => {
    expect(
      parseApiErrorBody(
        { statusCode: 409, message: 'Email already in use' },
        409,
      ).code,
    ).toBe(ApiErrorCode.EMAIL_TAKEN);
  });

  it('does not treat 404 as a network failure', () => {
    const parsed = parseApiErrorBody(
      { statusCode: 404, message: 'Game code not found' },
      404,
    );
    expect(parsed.code).toBe(ApiErrorCode.GAME_CODE_NOT_FOUND);
    expect(parsed.message).toBe('Game code not found');
  });
});

describe('toUserMessage', () => {
  it('keeps HTTP messages and network copy distinct', () => {
    expect(
      toUserMessage(
        new HttpError('No account with that username', 404, ApiErrorCode.USER_NOT_FOUND),
        'Failed',
      ),
    ).toBe('No account with that username');
    expect(toUserMessage(new NetworkError(), 'Failed')).toMatch(/connection/i);
  });
});
