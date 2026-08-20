import { describe, expect, it } from 'vitest';

import { OidcLoginAttemptsService } from './oidc-login-attempts.service.js';

function future(ms = 60_000): Date {
  return new Date(Date.now() + ms);
}

describe('OidcLoginAttemptsService', () => {
  it('recovers a begun attempt by (provider, device_code)', () => {
    const attempts = new OidcLoginAttemptsService();
    attempts.begin({
      providerId: 'gitlab',
      deviceCode: 'devcode-1',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: 'user-1',
    });

    const found = attempts.get('gitlab', 'devcode-1');
    expect(found?.callerUserId).toBe('user-1');
  });

  it('never returns an attempt for a mismatched provider, even with the same device_code', () => {
    const attempts = new OidcLoginAttemptsService();
    attempts.begin({
      providerId: 'gitlab',
      deviceCode: 'shared-code',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: null,
    });

    // The same device_code string under a different provider must not resolve to GitLab's
    // attempt — this is what stops a `PollOidcLoginRequest.provider` mismatch (or a
    // theoretical device_code collision between two configured providers) from ever crossing
    // wires between two providers' pending logins.
    expect(attempts.get('codeberg', 'shared-code')).toBeUndefined();
  });

  it('expires an attempt past its expires_at', () => {
    const attempts = new OidcLoginAttemptsService();
    attempts.begin({
      providerId: 'gitlab',
      deviceCode: 'devcode-1',
      expiresAt: new Date(Date.now() - 1),
      intervalMs: 5000,
      callerUserId: null,
    });
    expect(attempts.get('gitlab', 'devcode-1')).toBeUndefined();
  });

  it('enforces the poll interval independently per (provider, device_code)', () => {
    const attempts = new OidcLoginAttemptsService();
    const now = Date.now();
    attempts.begin({
      providerId: 'gitlab',
      deviceCode: 'devcode-1',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: null,
    });
    attempts.begin({
      providerId: 'codeberg',
      deviceCode: 'devcode-2',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: null,
    });

    expect(attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now))).toBe(true);
    // Same provider/device_code, too soon — refused.
    expect(attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now + 1000))).toBe(false);
    // A different provider's own attempt is on its own clock, unaffected by GitLab's poll.
    expect(attempts.tryConsumePoll('codeberg', 'devcode-2', new Date(now + 1000))).toBe(true);

    expect(attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now + 6000))).toBe(true);
  });

  it('extendInterval widens the matching (provider, device_code) pair — a poll too soon under the new interval is refused', () => {
    const attempts = new OidcLoginAttemptsService();
    const now = Date.now();
    attempts.begin({
      providerId: 'gitlab',
      deviceCode: 'devcode-1',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: null,
    });
    attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now));
    attempts.extendInterval('gitlab', 'devcode-1', 5000);

    // Interval is now 10s (5s original + 5s extension): a poll at +6s from the last
    // successful poll is still too soon under the widened interval — it would have been
    // allowed under the original 5s one.
    expect(attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now + 6000))).toBe(false);
  });

  it('extendInterval leaves the matching pair pollable again once the widened interval has fully elapsed', () => {
    const attempts = new OidcLoginAttemptsService();
    const now = Date.now();
    attempts.begin({
      providerId: 'gitlab',
      deviceCode: 'devcode-1',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: null,
    });
    attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now));
    attempts.extendInterval('gitlab', 'devcode-1', 5000);

    // A poll at +10s from the last successful poll clears the widened 10s interval.
    expect(attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now + 10000))).toBe(true);
  });

  it('extendInterval never affects a different (provider, device_code) pair', () => {
    const attempts = new OidcLoginAttemptsService();
    const now = Date.now();
    attempts.begin({
      providerId: 'gitlab',
      deviceCode: 'devcode-1',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: null,
    });
    attempts.begin({
      providerId: 'codeberg',
      deviceCode: 'devcode-2',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: null,
    });
    attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now));
    attempts.tryConsumePoll('codeberg', 'devcode-2', new Date(now));
    attempts.extendInterval('gitlab', 'devcode-1', 5000);

    // GitLab's interval is now 10s; Codeberg's stays at 5s and is pollable at +6s.
    expect(attempts.tryConsumePoll('gitlab', 'devcode-1', new Date(now + 6000))).toBe(false);
    expect(attempts.tryConsumePoll('codeberg', 'devcode-2', new Date(now + 6000))).toBe(true);
  });

  it('consume removes the attempt so a later get/poll sees nothing', () => {
    const attempts = new OidcLoginAttemptsService();
    attempts.begin({
      providerId: 'gitlab',
      deviceCode: 'devcode-1',
      expiresAt: future(),
      intervalMs: 5000,
      callerUserId: null,
    });
    attempts.consume('gitlab', 'devcode-1');
    expect(attempts.get('gitlab', 'devcode-1')).toBeUndefined();
    expect(attempts.tryConsumePoll('gitlab', 'devcode-1')).toBe(false);
  });

  it('tryConsumePoll on an unknown attempt returns false without throwing', () => {
    const attempts = new OidcLoginAttemptsService();
    expect(attempts.tryConsumePoll('gitlab', 'never-began')).toBe(false);
  });
});
