import { Actor, User } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthService } from './auth.service.js';
import { DeviceLinkAttemptsService } from './device-link-attempts.service.js';
import { type RateLimitService } from './rate-limit.service.js';
import { type TokenService } from './token.service.js';

const CLAIMS = { userId: 'user-1', actorId: 'actor-1', sessionId: 'session-1', expiresAt: new Date() };

function fakeRateLimit(): RateLimitService {
  return {
    consumePeer: vi.fn(),
    consume: vi.fn(),
    consumeDistributed: vi.fn().mockResolvedValue(undefined),
  } as unknown as RateLimitService;
}

function fakeTokens(): TokenService {
  return {
    issueSession: vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      accessExpiresAt: new Date(),
      refreshToken: 'refresh-token',
      refreshExpiresAt: new Date(),
    }),
  } as unknown as TokenService;
}

/** Only what `AuthService.pollDeviceLink`'s COMPLETE branch reads: an active `User` and its
 * `Actor`, both resolved through `manager.getRepository(...).findOne(...)`. */
function fakeDataSource(options: { user: Partial<User> | null; actor: Partial<Actor> | null }): {
  transaction: (fn: (manager: unknown) => unknown) => unknown;
} {
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === User) return { findOne: vi.fn().mockResolvedValue(options.user) };
      if (entity === Actor) return { findOne: vi.fn().mockResolvedValue(options.actor) };
      throw new Error('unexpected repository');
    },
  };
  return { transaction: (fn) => fn(manager) };
}

function buildAuthService(options: {
  rateLimit?: RateLimitService;
  tokens?: TokenService;
  dataSource?: { transaction: (fn: (manager: unknown) => unknown) => unknown };
  deviceLinks?: DeviceLinkAttemptsService;
}): AuthService {
  return new AuthService(
    (options.dataSource ?? fakeDataSource({ user: null, actor: null })) as never,
    {} as never,
    {} as never,
    (options.tokens ?? fakeTokens()) as never,
    {} as never,
    options.rateLimit ?? fakeRateLimit(),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    options.deviceLinks ?? new DeviceLinkAttemptsService(),
    {} as never,
    {} as never,
  );
}

describe('AuthService device link (P15-005)', () => {
  it('beginDeviceLink mints an XXXX-XXXX user_code and spends the peer budget', async () => {
    const rateLimit = fakeRateLimit();
    const auth = buildAuthService({ rateLimit });

    const begun = await auth.beginDeviceLink();

    expect(begun.userCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(begun.deviceCode.length).toBeGreaterThan(20);
    expect(begun.interval).toBeGreaterThan(0);
    expect(begun.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(rateLimit.consumePeer).toHaveBeenCalledWith('device_link_begin', undefined);
  });

  it('pollDeviceLink reports EXPIRED for an unknown device_code', async () => {
    const auth = buildAuthService({});
    await expect(auth.pollDeviceLink('never-began')).resolves.toEqual({ status: 'EXPIRED' });
  });

  it('pollDeviceLink reports PENDING before ApproveDeviceLink has run', async () => {
    const deviceLinks = new DeviceLinkAttemptsService();
    deviceLinks.begin({
      deviceCode: 'devcode-1',
      userCode: 'ABCD1234',
      expiresAt: new Date(Date.now() + 60_000),
      intervalMs: 0,
    });
    const auth = buildAuthService({ deviceLinks });

    await expect(auth.pollDeviceLink('devcode-1')).resolves.toEqual({ status: 'PENDING' });
  });

  it('approveDeviceLink rejects an unknown/wrong user_code with a uniform VALIDATION_ERROR', async () => {
    const deviceLinks = new DeviceLinkAttemptsService();
    deviceLinks.begin({
      deviceCode: 'devcode-1',
      userCode: 'ABCD1234',
      expiresAt: new Date(Date.now() + 60_000),
      intervalMs: 0,
    });
    const auth = buildAuthService({ deviceLinks });

    await expect(auth.approveDeviceLink(CLAIMS, 'WRONG-CODE')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    } satisfies Partial<AppError>);
  });

  it('approveDeviceLink accepts the code with or without its display hyphen/case', async () => {
    const deviceLinks = new DeviceLinkAttemptsService();
    deviceLinks.begin({
      deviceCode: 'devcode-1',
      userCode: 'ABCD1234',
      expiresAt: new Date(Date.now() + 60_000),
      intervalMs: 0,
    });
    const auth = buildAuthService({ deviceLinks });

    await expect(auth.approveDeviceLink(CLAIMS, 'abcd-1234')).resolves.toBeUndefined();
    expect(deviceLinks.get('devcode-1')?.approvedUserId).toBe(CLAIMS.userId);
  });

  it('approveDeviceLink rejects replaying the same code a second time', async () => {
    const deviceLinks = new DeviceLinkAttemptsService();
    deviceLinks.begin({
      deviceCode: 'devcode-1',
      userCode: 'ABCD1234',
      expiresAt: new Date(Date.now() + 60_000),
      intervalMs: 0,
    });
    const auth = buildAuthService({ deviceLinks });

    await auth.approveDeviceLink(CLAIMS, 'ABCD-1234');
    await expect(auth.approveDeviceLink(CLAIMS, 'ABCD-1234')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    } satisfies Partial<AppError>);
  });

  it('approveDeviceLink rejects an expired code', async () => {
    const deviceLinks = new DeviceLinkAttemptsService();
    deviceLinks.begin({
      deviceCode: 'devcode-1',
      userCode: 'ABCD1234',
      expiresAt: new Date(Date.now() - 1),
      intervalMs: 0,
    });
    const auth = buildAuthService({ deviceLinks });

    await expect(auth.approveDeviceLink(CLAIMS, 'ABCD-1234')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    } satisfies Partial<AppError>);
  });

  it('approveDeviceLink spends the per-caller, peer, and distributed rate-limit budgets', async () => {
    const deviceLinks = new DeviceLinkAttemptsService();
    deviceLinks.begin({
      deviceCode: 'devcode-1',
      userCode: 'ABCD1234',
      expiresAt: new Date(Date.now() + 60_000),
      intervalMs: 0,
    });
    const rateLimit = fakeRateLimit();
    const auth = buildAuthService({ deviceLinks, rateLimit });

    await auth.approveDeviceLink(CLAIMS, 'ABCD-1234');

    expect(rateLimit.consumePeer).toHaveBeenCalledWith('device_link_approve', undefined);
    expect(rateLimit.consume).toHaveBeenCalledWith('device_link_approve', CLAIMS.userId);
    expect(rateLimit.consumeDistributed).toHaveBeenCalledWith('device_link_approve', CLAIMS.userId);
  });

  it('approveDeviceLink propagates a rate-limit rejection before touching the pending link', async () => {
    const deviceLinks = new DeviceLinkAttemptsService();
    deviceLinks.begin({
      deviceCode: 'devcode-1',
      userCode: 'ABCD1234',
      expiresAt: new Date(Date.now() + 60_000),
      intervalMs: 0,
    });
    const rateLimit = fakeRateLimit();
    (rateLimit.consume as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new AppError('RATE_LIMITED', 'Too many attempts.');
    });
    const auth = buildAuthService({ deviceLinks, rateLimit });

    await expect(auth.approveDeviceLink(CLAIMS, 'ABCD-1234')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    } satisfies Partial<AppError>);
    // The rate limiter rejected before the link was ever touched — a retry (once the caller's
    // budget resets) must still be able to approve it.
    expect(deviceLinks.get('devcode-1')?.approvedUserId).toBeNull();
  });

  it('pollDeviceLink returns COMPLETE with a session for the approving account, and is single-use', async () => {
    const deviceLinks = new DeviceLinkAttemptsService();
    deviceLinks.begin({
      deviceCode: 'devcode-1',
      userCode: 'ABCD1234',
      expiresAt: new Date(Date.now() + 60_000),
      intervalMs: 0,
    });
    deviceLinks.approve('ABCD1234', 'user-1');

    const dataSource = fakeDataSource({
      user: { id: 'user-1', deletedAt: null, status: 'ACTIVE', actorId: 'actor-1' },
      actor: { id: 'actor-1', userId: 'user-1' },
    });
    const auth = buildAuthService({ deviceLinks, dataSource });

    const result = await auth.pollDeviceLink('devcode-1');
    expect(result.status).toBe('COMPLETE');

    // Single-use: a second poll of the same device_code must not resolve to a second session.
    await expect(auth.pollDeviceLink('devcode-1')).resolves.toEqual({ status: 'EXPIRED' });
  });
});
