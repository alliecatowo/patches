import type { Metadata } from '@grpc/grpc-js';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import { AuthGuard } from './auth.guard.js';
import { setSessionClaims } from './session-context.js';
import type { TokenService } from './token.service.js';

function contextFor(call: Metadata): ExecutionContext {
  return { switchToRpc: () => ({ getContext: () => call }) } as unknown as ExecutionContext;
}

describe('AuthGuard double-authentication guard (S-M4)', () => {
  it('does no token verification or DB lookup when claims are already set for the call', async () => {
    const verifyAccessToken = vi.fn();
    const findOne = vi.fn();
    const guard = new AuthGuard(
      { verifyAccessToken } as unknown as TokenService,
      {
        getRepository: () => ({ findOne }),
      } as unknown as DataSource,
    );
    const call = { get: () => [] } as unknown as Metadata;
    setSessionClaims(call, {
      userId: 'u',
      actorId: 'a',
      sessionId: 's',
      expiresAt: new Date(),
    });

    await expect(guard.canActivate(contextFor(call))).resolves.toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('still rejects a call with no bearer token and no prior claims', async () => {
    const guard = new AuthGuard(
      { verifyAccessToken: vi.fn() } as unknown as TokenService,
      {
        getRepository: () => ({ findOne: vi.fn() }),
      } as unknown as DataSource,
    );
    const call = { get: () => [] } as unknown as Metadata;
    await expect(guard.canActivate(contextFor(call))).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
  });
});
