import { dateToTimestamp, type Actor, type Session } from '@patches/proto';
import { describe, expect, it, vi } from 'vitest';

import { MemoryCredentialStore } from './credential-store.js';
import { SessionExpiredError, SessionManager, type SessionAuthApi } from './session.js';

const NODE = 'patches.example:443';

function actor(id: string, handle: string): Actor {
  return {
    id,
    handle,
    displayName: handle,
    bio: '',
    locationText: '',
    websiteUrl: '',
    avatar: undefined,
    isLocal: true,
    joinedAt: dateToTimestamp(new Date('2026-01-01T00:00:00.000Z')),
    counts: undefined,
    nameplate: undefined,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    accessToken: 'access-1',
    accessExpiresAt: dateToTimestamp(new Date(Date.now() + 15 * 60 * 1000)),
    refreshToken: 'refresh-1',
    refreshExpiresAt: dateToTimestamp(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    actor: actor('user-1', 'alice'),
    emailVerified: false,
    node: NODE,
    ...overrides,
  };
}

function fakeApi(overrides: Partial<SessionAuthApi> = {}): SessionAuthApi {
  return {
    register: vi.fn().mockResolvedValue({ session: session() }),
    login: vi.fn().mockResolvedValue({ session: session() }),
    refreshSession: vi.fn().mockResolvedValue({ session: session() }),
    logout: vi.fn().mockResolvedValue({}),
    beginSshLogin: vi.fn(),
    completeSshLogin: vi.fn(),
    ...overrides,
  };
}

describe('SessionManager.register / loginWithPassword', () => {
  it('applies the returned session and persists the refresh token', async () => {
    const store = new MemoryCredentialStore();
    const api = fakeApi();
    const manager = new SessionManager({ api, store, nodeOrigin: NODE });

    const active = await manager.loginWithPassword('alice', 'hunter2');
    expect(active.accessToken).toBe('access-1');
    expect(manager.session?.accessToken).toBe('access-1');

    const stored = await store.get(NODE, 'user-1');
    expect(stored?.refreshToken).toBe('refresh-1');
    expect(stored?.actorHandle).toBe('alice');
  });

  it('registration flows through the same session application as login', async () => {
    const store = new MemoryCredentialStore();
    const api = fakeApi({
      register: vi.fn().mockResolvedValue({ session: session({ emailVerified: false }) }),
    });
    const manager = new SessionManager({ api, store, nodeOrigin: NODE });

    const active = await manager.register({
      email: '',
      handle: 'alice',
      displayName: 'Alice',
      password: 'hunter2',
      inviteCode: 'invite',
      clientRequestId: 'req-1',
      sshPublicKey: '',
    });
    expect(active.emailVerified).toBe(false);
  });
});

describe('SessionManager.restore', () => {
  it('exchanges a stored refresh token for a fresh session', async () => {
    const store = new MemoryCredentialStore();
    await store.set({
      nodeOrigin: NODE,
      userId: 'user-1',
      actorHandle: 'alice',
      refreshToken: 'stored-refresh',
      refreshExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const refreshSession = vi.fn().mockResolvedValue({ session: session() });
    const manager = new SessionManager({
      api: fakeApi({ refreshSession }),
      store,
      nodeOrigin: NODE,
    });

    const active = await manager.restore();
    expect(active?.accessToken).toBe('access-1');
    expect(refreshSession).toHaveBeenCalledWith({ refreshToken: 'stored-refresh' });
  });

  it('resolves to undefined (never rejects) when nothing is stored', async () => {
    const store = new MemoryCredentialStore();
    const manager = new SessionManager({ api: fakeApi(), store, nodeOrigin: NODE });
    await expect(manager.restore()).resolves.toBeUndefined();
  });

  it('resolves to undefined when the stored refresh token no longer works', async () => {
    const store = new MemoryCredentialStore();
    await store.set({
      nodeOrigin: NODE,
      userId: 'user-1',
      actorHandle: 'alice',
      refreshToken: 'dead-refresh',
      refreshExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const refreshSession = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('nope'), { code: 16 }));
    const manager = new SessionManager({
      api: fakeApi({ refreshSession }),
      store,
      nodeOrigin: NODE,
    });

    await expect(manager.restore()).resolves.toBeUndefined();
  });
});

describe('SessionManager.ensureAccessToken / auto-refresh', () => {
  it('returns the current token when it is not near expiry', async () => {
    const store = new MemoryCredentialStore();
    const refreshSession = vi.fn();
    const manager = new SessionManager({
      api: fakeApi({ refreshSession }),
      store,
      nodeOrigin: NODE,
    });
    await manager.loginWithPassword('alice', 'x');

    await expect(manager.ensureAccessToken()).resolves.toBe('access-1');
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes proactively when within the skew window of expiry', async () => {
    const store = new MemoryCredentialStore();
    const almostExpired = session({
      accessExpiresAt: dateToTimestamp(new Date(Date.now() + 5_000)),
    });
    const refreshed = session({
      accessToken: 'access-2',
      accessExpiresAt: dateToTimestamp(new Date(Date.now() + 15 * 60 * 1000)),
    });
    const login = vi.fn().mockResolvedValue({ session: almostExpired });
    const refreshSession = vi.fn().mockResolvedValue({ session: refreshed });
    const manager = new SessionManager({
      api: fakeApi({ login, refreshSession }),
      store,
      nodeOrigin: NODE,
      refreshSkewMs: 30_000,
    });
    await manager.loginWithPassword('alice', 'x');

    await expect(manager.ensureAccessToken()).resolves.toBe('access-2');
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('throws SessionExpiredError when nothing has ever been logged in', async () => {
    const store = new MemoryCredentialStore();
    const manager = new SessionManager({ api: fakeApi(), store, nodeOrigin: NODE });
    await expect(manager.ensureAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
  });
});

describe('SessionManager.withAuth', () => {
  it('passes the access token straight through on success', async () => {
    const store = new MemoryCredentialStore();
    const manager = new SessionManager({ api: fakeApi(), store, nodeOrigin: NODE });
    await manager.loginWithPassword('alice', 'x');

    const result = await manager.withAuth((token) => Promise.resolve(`used:${token}`));
    expect(result).toBe('used:access-1');
  });

  it('refreshes once and retries on UNAUTHENTICATED, then succeeds', async () => {
    const store = new MemoryCredentialStore();
    const refreshSession = vi.fn().mockResolvedValue({
      session: session({ accessToken: 'access-2' }),
    });
    const manager = new SessionManager({
      api: fakeApi({ refreshSession }),
      store,
      nodeOrigin: NODE,
    });
    await manager.loginWithPassword('alice', 'x');

    let calls = 0;
    const call = vi.fn().mockImplementation((token: string) => {
      calls += 1;
      if (calls === 1) return Promise.reject(Object.assign(new Error('unauth'), { code: 16 }));
      return Promise.resolve(token);
    });

    const result = await manager.withAuth(call);
    expect(result).toBe('access-2');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('surfaces "session expired, run patches login" when the retry also fails', async () => {
    const store = new MemoryCredentialStore();
    const refreshSession = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('nope'), { code: 16 }));
    const manager = new SessionManager({
      api: fakeApi({ refreshSession }),
      store,
      nodeOrigin: NODE,
    });
    await manager.loginWithPassword('alice', 'x');

    const call = vi.fn().mockRejectedValue(Object.assign(new Error('unauth'), { code: 16 }));
    await expect(manager.withAuth(call)).rejects.toThrow('session expired, run patches login');
    expect(manager.session).toBeUndefined();
  });

  it('does not swallow non-auth errors', async () => {
    const store = new MemoryCredentialStore();
    const manager = new SessionManager({ api: fakeApi(), store, nodeOrigin: NODE });
    await manager.loginWithPassword('alice', 'x');

    const call = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(manager.withAuth(call)).rejects.toThrow('boom');
  });
});

describe('SessionManager.logout', () => {
  it('revokes server-side, clears the store, and clears in-memory state', async () => {
    const store = new MemoryCredentialStore();
    const logout = vi.fn().mockResolvedValue({});
    const manager = new SessionManager({ api: fakeApi({ logout }), store, nodeOrigin: NODE });
    await manager.loginWithPassword('alice', 'x');

    await manager.logout();

    expect(logout).toHaveBeenCalledWith({ refreshToken: 'refresh-1' });
    expect(manager.session).toBeUndefined();
    await expect(store.get(NODE, 'user-1')).resolves.toBeUndefined();
  });

  it('is a no-op when nothing is logged in', async () => {
    const store = new MemoryCredentialStore();
    const logout = vi.fn();
    const manager = new SessionManager({ api: fakeApi({ logout }), store, nodeOrigin: NODE });
    await manager.logout();
    expect(logout).not.toHaveBeenCalled();
  });
});
