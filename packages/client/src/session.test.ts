import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { AuthService } from '@patches/proto/es';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  InMemoryCredentialStore,
  SESSION_REFRESHED_EVENT,
  SessionManager,
  decodeJwtExpiry,
  type SessionRefreshedDetail,
} from './session.js';

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

/** base64url-encodes an arbitrary string (UTF-8 safe) — the inverse of the decoder
 * under test, so tests never hard-code fragile literals. */
function b64url(value: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.sig`;
}

/**
 * Node-environment stand-in for a browser `window`: a real `EventTarget` is enough for
 * the manager's `storage` listener and `CustomEvent` dispatch (both globals exist in
 * Node ≥19), so the package needs no jsdom dev-dependency for these tests.
 */
class FakeStorageEvent extends Event {
  readonly key: string | null;
  constructor(key: string | null) {
    super('storage');
    this.key = key;
  }
}

function stubWindow(): EventTarget {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  return target;
}

function collectRefreshedEvents(target: EventTarget): Array<CustomEvent<SessionRefreshedDetail>> {
  const events: Array<CustomEvent<SessionRefreshedDetail>> = [];
  target.addEventListener(SESSION_REFRESHED_EVENT, (event) => {
    events.push(event as CustomEvent<SessionRefreshedDetail>);
  });
  return events;
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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

describe('decodeJwtExpiry', () => {
  it('returns exp as ms since epoch', () => {
    expect(decodeJwtExpiry(makeJwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  it('decodes non-ASCII payloads (UTF-8, not latin1)', () => {
    const token = makeJwt({ sub: 'ällie·ünïcode', exp: 123 });
    expect(decodeJwtExpiry(token)).toBe(123_000);
  });

  it('returns undefined for malformed or non-JWT tokens', () => {
    expect(decodeJwtExpiry('')).toBeUndefined();
    expect(decodeJwtExpiry('not-a-jwt')).toBeUndefined();
    expect(decodeJwtExpiry('two.segments')).toBeUndefined();
    expect(decodeJwtExpiry('a.b.c.d')).toBeUndefined();
    expect(decodeJwtExpiry(`h.${b64url('!!not base64!!')}.s`)).toBeUndefined();
    expect(decodeJwtExpiry(`h.${b64url('not json')}.s`)).toBeUndefined();
  });

  it('returns undefined when exp is missing, non-numeric, or infinite', () => {
    expect(decodeJwtExpiry(makeJwt({ sub: 'x' }))).toBeUndefined();
    expect(decodeJwtExpiry(makeJwt({ exp: '1700000000' }))).toBeUndefined();
    expect(decodeJwtExpiry(makeJwt({ exp: null }))).toBeUndefined();
    expect(decodeJwtExpiry(`h.${b64url('{"exp":1e999}')}.s`)).toBeUndefined();
  });
});

describe('SessionManager snapshot (B-169)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts signed-out with a stable snapshot reference', () => {
    const { transport } = transportWithRefresh(() => ({ accessToken: 'a', refreshToken: 'r' }));
    const session = new SessionManager({ transport });

    expect(session.getSnapshot()).toBe(session.getSnapshot());
    expect(session.getSnapshot()).toEqual({ signedIn: false, expiresAt: undefined });
  });

  it('reflects setSession/clear and notifies subscribers', async () => {
    const { transport } = transportWithRefresh(() => ({ accessToken: 'a', refreshToken: 'r' }));
    const session = new SessionManager({ transport });
    const listener = vi.fn();
    session.subscribe(listener);

    await session.setSession({ accessToken: makeJwt({ exp: 500 }), refreshToken: 'r' });
    expect(session.getSnapshot()).toEqual({ signedIn: true, expiresAt: 500_000 });
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    await session.clear();
    expect(session.getSnapshot()).toEqual({ signedIn: false, expiresAt: undefined });
    expect(listener).toHaveBeenCalled();
    expect(await session.getExpiresAt()).toBeUndefined();
  });

  it('exposes expiresAt from the persisted store without any RPC', async () => {
    const { transport, callCount } = transportWithRefresh(() => ({
      accessToken: 'a',
      refreshToken: 'r',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: makeJwt({ exp: 42 }), refreshToken: 'r' });
    const session = new SessionManager({ transport, credentialStore: store });
    expect(session.getSnapshot().signedIn).toBe(false);

    const listener = vi.fn();
    session.subscribe(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    expect(session.getSnapshot()).toEqual({ signedIn: true, expiresAt: 42_000 });
    expect(await session.getExpiresAt()).toBe(42_000);
    expect(callCount()).toBe(0);
  });
});

describe('SessionManager session-refreshed event (B-169)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits exactly one event with the new expiry when withSession refreshes', async () => {
    const target = stubWindow();
    const refreshed = collectRefreshedEvents(target);
    const oldToken = makeJwt({ exp: 1_000 });
    const newToken = makeJwt({ exp: 2_000_000 });
    const { transport } = transportWithRefresh(() => ({
      accessToken: newToken,
      refreshToken: 'r2',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: oldToken, refreshToken: 'r1' });
    const session = new SessionManager({ transport, credentialStore: store });

    const result = await session.withSession((token) =>
      token === oldToken
        ? Promise.reject(new ConnectError('expired', Code.Unauthenticated))
        : Promise.resolve('ok'),
    );

    expect(result).toBe('ok');
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]?.type).toBe(SESSION_REFRESHED_EVENT);
    expect(refreshed[0]?.detail).toEqual({ expiresAt: 2_000_000_000 });
  });

  it('single-flights one event for concurrent callers sharing a refresh', async () => {
    const target = stubWindow();
    const refreshed = collectRefreshedEvents(target);
    const { transport, callCount } = transportWithRefresh((refreshToken) => ({
      accessToken: `access-for-${refreshToken}`,
      refreshToken: 'r2',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: 'expired', refreshToken: 'r1' });
    const session = new SessionManager({ transport, credentialStore: store });

    const attempt = () =>
      session.withSession((token) =>
        token === 'expired'
          ? Promise.reject(new ConnectError('expired', Code.Unauthenticated))
          : Promise.resolve('ok'),
      );
    await Promise.all([attempt(), attempt()]);

    expect(callCount()).toBe(1);
    expect(refreshed).toHaveLength(1);
  });

  it('emits when adopting another tab’s rotation, without calling RefreshSession', async () => {
    const target = stubWindow();
    const refreshed = collectRefreshedEvents(target);
    const { transport, callCount } = transportWithRefresh(() => ({
      accessToken: 'should-not-be-called',
      refreshToken: 'should-not-be-called',
    }));
    const store = new InMemoryCredentialStore();
    const oldToken = makeJwt({ exp: 1_000 });
    await store.save({ accessToken: oldToken, refreshToken: 'r1' });
    const session = new SessionManager({ transport, credentialStore: store });
    await expect(session.getAccessToken()).resolves.toBe(oldToken);

    // The "other tab" rotates and persists first.
    const adopted = { accessToken: makeJwt({ exp: 3_000 }), refreshToken: 'r2' };
    await store.save(adopted);

    const result = await session.withSession((token) =>
      token === adopted.accessToken
        ? Promise.resolve('adopted')
        : Promise.reject(new ConnectError('expired', Code.Unauthenticated)),
    );

    expect(result).toBe('adopted');
    expect(callCount()).toBe(0);
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]?.detail).toEqual({ expiresAt: 3_000_000 });
  });

  it('emits no event when the first attempt succeeds or fails non-Unauthenticated', async () => {
    const target = stubWindow();
    const refreshed = collectRefreshedEvents(target);
    const { transport, callCount } = transportWithRefresh(() => ({
      accessToken: 'a',
      refreshToken: 'r',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: makeJwt({ exp: 9 }), refreshToken: 'r' });
    const session = new SessionManager({ transport, credentialStore: store });

    await expect(session.withSession(() => Promise.resolve('fine'))).resolves.toBe('fine');
    await expect(
      session.withSession(() => Promise.reject(new ConnectError('nope', Code.PermissionDenied))),
    ).rejects.toMatchObject({ code: Code.PermissionDenied });

    expect(callCount()).toBe(0);
    expect(refreshed).toHaveLength(0);
  });

  it('does not throw without a window (TUI/Node runtime)', async () => {
    const oldToken = makeJwt({ exp: 1 });
    const { transport } = transportWithRefresh(() => ({
      accessToken: makeJwt({ exp: 7 }),
      refreshToken: 'r2',
    }));
    const store = new InMemoryCredentialStore();
    await store.save({ accessToken: oldToken, refreshToken: 'r1' });
    const session = new SessionManager({ transport, credentialStore: store });

    await expect(
      session.withSession((token) =>
        token === oldToken
          ? Promise.reject(new ConnectError('expired', Code.Unauthenticated))
          : Promise.resolve('ok'),
      ),
    ).resolves.toBe('ok');
  });
});

describe('SessionManager cross-tab storage sync (B-169)', () => {
  const KEY = 'patches.web.credentials.test-node.v1';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function managerOver(store: InMemoryCredentialStore): SessionManager {
    const { transport } = transportWithRefresh(() => ({ accessToken: 'a', refreshToken: 'r' }));
    return new SessionManager({ transport, credentialStore: store, storageKey: KEY });
  }

  it('re-reads and notifies when another tab writes our key (foreign login)', async () => {
    const target = stubWindow();
    const store = new InMemoryCredentialStore();
    const session = managerOver(store);
    const listener = vi.fn();
    session.subscribe(listener);
    await vi.waitFor(() => expect(session.getSnapshot().signedIn).toBe(false));
    listener.mockClear();

    const foreignToken = makeJwt({ exp: 60 });
    await store.save({ accessToken: foreignToken, refreshToken: 'foreign-r' });
    target.dispatchEvent(new FakeStorageEvent(KEY));

    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(session.getSnapshot()).toEqual({ signedIn: true, expiresAt: 60_000 });
    expect(await session.getAccessToken()).toBe(foreignToken);
  });

  it('re-reads and notifies when another tab clears our key (foreign logout)', async () => {
    const target = stubWindow();
    const store = new InMemoryCredentialStore();
    const session = managerOver(store);
    await session.setSession({ accessToken: makeJwt({ exp: 5 }), refreshToken: 'r' });
    const listener = vi.fn();
    session.subscribe(listener);
    listener.mockClear();

    await store.clear();
    target.dispatchEvent(new FakeStorageEvent(KEY));

    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(session.getSnapshot()).toEqual({ signedIn: false, expiresAt: undefined });
  });

  it('ignores storage events for other keys', async () => {
    const target = stubWindow();
    const store = new InMemoryCredentialStore();
    const session = managerOver(store);
    const listener = vi.fn();
    session.subscribe(listener);
    await tick();
    listener.mockClear();

    await store.save({ accessToken: makeJwt({ exp: 60 }), refreshToken: 'foreign-r' });
    target.dispatchEvent(new FakeStorageEvent('some-other-key'));
    target.dispatchEvent(new FakeStorageEvent(null));
    await tick();

    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual({ signedIn: false, expiresAt: undefined });
  });
});
