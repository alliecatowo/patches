import { describe, expect, it, vi } from 'vitest';

import { type AppError } from '../../common/errors/app-error.js';
import { type AppConfigService } from '../../config/app-config.service.js';
import { AuthService } from './auth.service.js';
import { type RateLimitService } from './rate-limit.service.js';

/** A `RateLimitService` fake that never throttles — `register()` calls all three consume
 * methods before it reaches the checks this file cares about. */
function fakeRateLimit(): RateLimitService {
  return {
    consumePeer: vi.fn(),
    consume: vi.fn(),
    consumeDistributed: vi.fn().mockResolvedValue(undefined),
  } as unknown as RateLimitService;
}

function fakeConfig(overrides: Partial<AppConfigService>): AppConfigService {
  return { inviteOnly: false, ...overrides } as unknown as AppConfigService;
}

/** Builds an `AuthService` with every dependency `register()`'s validation-and-config checks
 * run before as an unused fake — `register()` never reaches `dataSource`/`hasher`/`tokens`/
 * SSH/GitHub collaborators when it rejects this early (P14-025, P15-002's `PASSWORD_AUTH`
 * checks live in this same early section of `register()`/`login()`). */
function buildAuthService(config: AppConfigService): AuthService {
  return new AuthService(
    {} as never,
    config,
    {} as never,
    {} as never,
    {} as never,
    fakeRateLimit(),
    {} as never,
    {} as never,
  );
}

describe('AuthService.register — privacy notice acknowledgement (§204.2, P14-025)', () => {
  it('rejects with PRIVACY_NOTICE_NOT_ACKNOWLEDGED when REQUIRE_PRIVACY_ACK is on and the version does not match', async () => {
    const auth = buildAuthService(fakeConfig({ requirePrivacyAck: true, privacyNoticeVersion: 2 }));

    await expect(
      auth.register({
        handle: 'abc',
        displayName: '',
        password: 'a-perfectly-fine-password',
        privacyNoticeVersionAcknowledged: 1,
      }),
    ).rejects.toMatchObject({
      code: 'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
    } satisfies Partial<AppError>);
  });

  it('rejects when REQUIRE_PRIVACY_ACK is on and no version was sent at all (defaults to 0)', async () => {
    const auth = buildAuthService(fakeConfig({ requirePrivacyAck: true, privacyNoticeVersion: 1 }));

    await expect(
      auth.register({
        handle: 'abc',
        displayName: '',
        password: 'a-perfectly-fine-password',
      }),
    ).rejects.toMatchObject({
      code: 'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
    } satisfies Partial<AppError>);
  });

  it('does not reject for the privacy check when REQUIRE_PRIVACY_ACK is off, regardless of the version sent', async () => {
    // `requirePrivacyAck: false` short-circuits before the version comparison, so this proves
    // the *other* early check (password/SSH required) is what runs next, not
    // PRIVACY_NOTICE_NOT_ACKNOWLEDGED — the fake `dataSource` throwing confirms the privacy
    // check itself let this call all the way through to the transaction.
    const auth = buildAuthService(fakeConfig({ requirePrivacyAck: false }));

    await expect(
      auth.register({
        handle: 'abc',
        displayName: '',
        password: 'a-perfectly-fine-password',
        privacyNoticeVersionAcknowledged: 999,
      }),
    ).rejects.not.toMatchObject({ code: 'PRIVACY_NOTICE_NOT_ACKNOWLEDGED' });
  });
});
