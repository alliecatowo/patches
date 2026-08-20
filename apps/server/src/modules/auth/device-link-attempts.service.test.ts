import { describe, expect, it } from 'vitest';

import { DeviceLinkAttemptsService } from './device-link-attempts.service.js';

function future(ms = 60_000): Date {
  return new Date(Date.now() + ms);
}

function begin(
  attempts: DeviceLinkAttemptsService,
  overrides: Partial<{
    deviceCode: string;
    userCode: string;
    expiresAt: Date;
    intervalMs: number;
  }> = {},
): void {
  attempts.begin({
    deviceCode: 'devcode-1',
    userCode: 'ABCD1234',
    expiresAt: future(),
    intervalMs: 3000,
    ...overrides,
  });
}

describe('DeviceLinkAttemptsService', () => {
  it('recovers a begun attempt by device_code, unapproved', () => {
    const attempts = new DeviceLinkAttemptsService();
    begin(attempts);

    const found = attempts.get('devcode-1');
    expect(found?.userCode).toBe('ABCD1234');
    expect(found?.approvedUserId).toBeNull();
  });

  it('expires an attempt past its expires_at (wrong-code/expiry rejection surface)', () => {
    const attempts = new DeviceLinkAttemptsService();
    begin(attempts, { expiresAt: new Date(Date.now() - 1) });

    expect(attempts.get('devcode-1')).toBeUndefined();
    // The reverse (user_code) index must be cleaned up too, or a later `begin` reusing the same
    // user_code would collide with a phantom entry.
    expect(attempts.approve('ABCD1234', 'user-1')).toBe(false);
  });

  it('enforces the poll interval on device_code', () => {
    const attempts = new DeviceLinkAttemptsService();
    const now = Date.now();
    begin(attempts, { intervalMs: 5000 });

    expect(attempts.tryConsumePoll('devcode-1', new Date(now))).toBe(true);
    expect(attempts.tryConsumePoll('devcode-1', new Date(now + 1000))).toBe(false);
    expect(attempts.tryConsumePoll('devcode-1', new Date(now + 6000))).toBe(true);
  });

  it('tryConsumePoll on an unknown device_code returns false without throwing', () => {
    const attempts = new DeviceLinkAttemptsService();
    expect(attempts.tryConsumePoll('never-began')).toBe(false);
  });

  describe('approve', () => {
    it('binds the pending link to the approving account, findable afterward by device_code', () => {
      const attempts = new DeviceLinkAttemptsService();
      begin(attempts);

      expect(attempts.approve('ABCD1234', 'user-1')).toBe(true);
      expect(attempts.get('devcode-1')?.approvedUserId).toBe('user-1');
    });

    it('rejects an unknown user_code (wrong-code rejection)', () => {
      const attempts = new DeviceLinkAttemptsService();
      begin(attempts);

      expect(attempts.approve('WRONGCOD', 'user-1')).toBe(false);
      // The real pending link is untouched by the failed guess.
      expect(attempts.get('devcode-1')?.approvedUserId).toBeNull();
    });

    it('rejects approving an already-expired link', () => {
      const attempts = new DeviceLinkAttemptsService();
      begin(attempts, { expiresAt: new Date(Date.now() - 1) });

      expect(attempts.approve('ABCD1234', 'user-1')).toBe(false);
    });

    it('rejects a second approval of the same link — by the same account (replay)', () => {
      const attempts = new DeviceLinkAttemptsService();
      begin(attempts);

      expect(attempts.approve('ABCD1234', 'user-1')).toBe(true);
      expect(attempts.approve('ABCD1234', 'user-1')).toBe(false);
      // The account bound by the first, successful approval is never overwritten.
      expect(attempts.get('devcode-1')?.approvedUserId).toBe('user-1');
    });

    it('rejects a second approval of the same link — by a different account (hijack attempt)', () => {
      const attempts = new DeviceLinkAttemptsService();
      begin(attempts);

      expect(attempts.approve('ABCD1234', 'user-1')).toBe(true);
      expect(attempts.approve('ABCD1234', 'attacker')).toBe(false);
      expect(attempts.get('devcode-1')?.approvedUserId).toBe('user-1');
    });
  });

  it('consume removes the attempt so a later get/poll/approve sees nothing (single-use)', () => {
    const attempts = new DeviceLinkAttemptsService();
    begin(attempts);
    attempts.approve('ABCD1234', 'user-1');

    attempts.consume('devcode-1');

    expect(attempts.get('devcode-1')).toBeUndefined();
    expect(attempts.tryConsumePoll('devcode-1')).toBe(false);
    expect(attempts.approve('ABCD1234', 'user-2')).toBe(false);
  });

  it('consume on an unknown device_code is a harmless no-op', () => {
    const attempts = new DeviceLinkAttemptsService();
    expect(() => attempts.consume('never-began')).not.toThrow();
  });

  it('drops a brand-new attempt once at capacity, without throwing', () => {
    const attempts = new DeviceLinkAttemptsService();
    const MAX_ATTEMPTS = 5_000;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      begin(attempts, { deviceCode: `devcode-${String(i)}`, userCode: `CODE${String(i)}` });
    }

    begin(attempts, { deviceCode: 'devcode-overflow', userCode: 'OVERFLOW' });

    expect(attempts.get('devcode-overflow')).toBeUndefined();
    // Capacity wasn't silently corrupted — the very first entry is still live.
    expect(attempts.get('devcode-0')).toBeDefined();
  });
});
