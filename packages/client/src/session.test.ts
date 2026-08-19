import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { AuthService } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { InMemoryCredentialStore, SessionManager } from './session.js';

function transportWithRefresh(
  refreshSession: (refreshToken: string) => { accessToken: string; refreshToken: string },
) {
  let calls = 0;
  const transport = createRouterTransport((router) => {
    router.service(AuthService, {
      refreshSession(request) {
        calls += 1;
        const session = refreshSession(request.refreshToken);
        return { session };
      },
    });
  });
  return { transport, callCount: () => calls };
}

describe('SessionManager', () => {
  it('retries once on Unauthenticated by refreshing, then succeeds with the new token', async () => {
    const { transport } = transportWithRefresh(() => ({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: 'expired-access-token', refreshToken: 'refresh-token-1' });
    const session = new SessionManager({ transport, credentialStore: store });

    let seenTokens: string[] = [];
    const result = await session.withSession((accessToken) => {
      seenTokens = [...seenTokens, accessToken];
      if (accessToken === 'expired-access-token') {
        throw new ConnectError('expired', Code.Unauthenticated);
      }
      return Promise.resolve(`ok:${accessToken}`);
    });

    expect(result).toBe('ok:new-access-token');
    expect(seenTokens).toEqual(['expired-access-token', 'new-access-token']);
    // Rotation: the new refresh token is persisted, not the original.
    await expect(store.load()).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
  });

  it('propagates a second Unauthenticated without refreshing again', async () => {
    const { transport, callCount } = transportWithRefresh(() => ({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: 'expired-access-token', refreshToken: 'refresh-token-1' });
    const session = new SessionManager({ transport, credentialStore: store });

    await expect(
      session.withSession(() => {
        throw new ConnectError('still unauthenticated', Code.Unauthenticated);
      }),
    ).rejects.toMatchObject({ code: Code.Unauthenticated });
    expect(callCount()).toBe(1);
  });

  it('does not retry a non-Unauthenticated error', async () => {
    const { transport, callCount } = transportWithRefresh(() => ({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: 'access-token', refreshToken: 'refresh-token-1' });
    const session = new SessionManager({ transport, credentialStore: store });

    await expect(
      session.withSession(() => {
        throw new ConnectError('nope', Code.PermissionDenied);
      }),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });
    expect(callCount()).toBe(0);
  });

  it('single-flights concurrent refreshes: two callers failing at once trigger one RefreshSession call', async () => {
    const { transport, callCount } = transportWithRefresh((refreshToken) => ({
      accessToken: `access-for-${refreshToken}`,
      refreshToken: 'rotated-refresh-token',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: 'expired', refreshToken: 'refresh-token-1' });
    const session = new SessionManager({ transport, credentialStore: store });

    const attempt = (label: string) =>
      session.withSession((accessToken) => {
        if (accessToken === 'expired') throw new ConnectError('expired', Code.Unauthenticated);
        return Promise.resolve(`${label}:${accessToken}`);
      });

    const [first, second] = await Promise.all([attempt('a'), attempt('b')]);

    expect(callCount()).toBe(1);
    expect(first).toBe('a:access-for-refresh-token-1');
    expect(second).toBe('b:access-for-refresh-token-1');
  });

  it('throws Unauthenticated from withSession when there is no session at all', async () => {
    const { transport } = transportWithRefresh(() => ({
      accessToken: 'unused',
      refreshToken: 'unused',
    }));
    const session = new SessionManager({ transport });

    await expect(session.withSession((token) => Promise.resolve(token))).rejects.toMatchObject({
      code: Code.Unauthenticated,
    });
  });
});
