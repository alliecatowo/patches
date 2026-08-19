import { type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service.js';
import type { AuthGuard } from '../../modules/auth/auth.guard.js';
import { AppError } from '../errors/app-error.js';
import { PublicReadGuard } from './public-read.guard.js';

interface FakeContextOptions {
  type?: 'rpc' | 'http';
  /** Simulated grpc-js `call.getPath()`; omitted to exercise the controller/handler fallback. */
  path?: string;
  className?: string;
  handlerName?: string;
}

function fakeContext(options: FakeContextOptions = {}): ExecutionContext {
  const {
    type = 'rpc',
    path,
    className = 'FeedController',
    handlerName = 'listLocalFeed',
  } = options;
  return {
    getType: () => type,
    getArgByIndex: (index: number) =>
      index === 2 && path !== undefined ? { getPath: () => path } : undefined,
    getClass: () => ({ name: className }),
    getHandler: () => ({ name: handlerName }),
  } as unknown as ExecutionContext;
}

function configWithPublicRead(publicRead: boolean): AppConfigService {
  return { publicRead } as AppConfigService;
}

/** A local, non-method-bound spy is returned alongside the fake `AuthGuard` — asserting on
 * `fake.canActivate` directly trips `@typescript-eslint/unbound-method` (it looks like an
 * unbound class method access even though this is a plain object literal). */
function authGuardResolving(result: boolean | Error): { guard: AuthGuard; spy: () => unknown } {
  const spy = vi.fn(() =>
    result instanceof Error ? Promise.reject<boolean>(result) : Promise.resolve(result),
  );
  return { guard: { canActivate: spy } as unknown as AuthGuard, spy };
}

describe('PublicReadGuard (owner decision 2026-08-19, PUBLIC_READ)', () => {
  it('is a no-op when PUBLIC_READ is true, regardless of the RPC or auth state', async () => {
    const { guard: authGuard, spy } = authGuardResolving(
      new AppError('AUTH_INVALID_CREDENTIALS', 'nope'),
    );
    const guard = new PublicReadGuard(configWithPublicRead(true), authGuard);

    await expect(
      guard.canActivate(fakeContext({ path: 'patches.v1.FeedService/ListLocalFeed' })),
    ).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('always allows a non-rpc context (/healthz, the federation HTTP surface)', async () => {
    const guard = new PublicReadGuard(configWithPublicRead(false), authGuardResolving(true).guard);

    await expect(guard.canActivate(fakeContext({ type: 'http' }))).resolves.toBe(true);
  });

  it.each([
    'patches.v1.SystemService/GetServerInfo',
    'patches.v1.AuthService/Login',
    'patches.v1.NodeService/GetNodeInfo',
    'patches.v1.NodeService/GetNodePolicy',
  ])('allows %s unauthenticated even when PUBLIC_READ is false', async (path) => {
    const { guard: authGuard, spy } = authGuardResolving(
      new AppError('AUTH_INVALID_CREDENTIALS', 'nope'),
    );
    const guard = new PublicReadGuard(configWithPublicRead(false), authGuard);

    await expect(guard.canActivate(fakeContext({ path }))).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('falls back to controller/handler names when the call has no getPath()', async () => {
    const guard = new PublicReadGuard(
      configWithPublicRead(false),
      authGuardResolving(new AppError('AUTH_INVALID_CREDENTIALS', 'nope')).guard,
    );

    await expect(
      guard.canActivate(fakeContext({ className: 'NodeController', handlerName: 'getNodeInfo' })),
    ).resolves.toBe(true);
  });

  it('delegates to AuthGuard for everything else and allows a valid session', async () => {
    const { guard: authGuard, spy } = authGuardResolving(true);
    const guard = new PublicReadGuard(configWithPublicRead(false), authGuard);

    await expect(
      guard.canActivate(fakeContext({ path: 'patches.v1.FeedService/ListLocalFeed' })),
    ).resolves.toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('reports SIGN_IN_REQUIRED instead of the underlying AuthGuard failure code', async () => {
    const { guard: authGuard } = authGuardResolving(
      new AppError('AUTH_SESSION_EXPIRED', 'Your session is no longer valid.'),
    );
    const guard = new PublicReadGuard(configWithPublicRead(false), authGuard);

    const error: unknown = await guard
      .canActivate(fakeContext({ path: 'patches.v1.FeedService/ListLocalFeed' }))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('SIGN_IN_REQUIRED');
  });

  it('leaves ACCOUNT_SUSPENDED unchanged — a suspended caller is already signed in', async () => {
    const { guard: authGuard } = authGuardResolving(
      new AppError('ACCOUNT_SUSPENDED', 'This account has been suspended.'),
    );
    const guard = new PublicReadGuard(configWithPublicRead(false), authGuard);

    const error: unknown = await guard
      .canActivate(fakeContext({ path: 'patches.v1.FeedService/ListLocalFeed' }))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('ACCOUNT_SUSPENDED');
  });
});
