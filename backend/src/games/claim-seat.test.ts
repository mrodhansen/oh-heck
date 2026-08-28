import { describe, expect, it } from 'vitest';
import { shouldStampGuestUserId } from './claim-seat';

describe('shouldStampGuestUserId', () => {
  it('is true only when the guest sits in no other game', () => {
    expect(shouldStampGuestUserId(0)).toBe(true);
    expect(shouldStampGuestUserId(1)).toBe(false);
    expect(shouldStampGuestUserId(39)).toBe(false);
  });
});
