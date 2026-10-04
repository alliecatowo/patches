import { describe, expect, it } from 'vitest';

import { isAppError } from '../../common/errors/app-error.js';
import { assertSandboxNotExpired } from './sandbox-expiry.js';

describe('assertSandboxNotExpired', () => {
  const now = new Date('2026-10-03T12:00:00Z');

  it('lets real accounts (no expiry) through, however the column is read', () => {
    expect(() => {
      assertSandboxNotExpired({ sandboxExpiresAt: null }, now);
    }).not.toThrow();
    expect(() => {
      assertSandboxNotExpired({}, now);
    }).not.toThrow();
  });

  it('lets a live sandbox through', () => {
    expect(() => {
      assertSandboxNotExpired({ sandboxExpiresAt: new Date(now.getTime() + 1) }, now);
    }).not.toThrow();
  });

  it('ends a sandbox at its expiry instant, as an expired session', () => {
    try {
      assertSandboxNotExpired({ sandboxExpiresAt: now }, now);
      expect.unreachable('expected the expired sandbox to be rejected');
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('AUTH_SESSION_EXPIRED');
    }
  });
});
