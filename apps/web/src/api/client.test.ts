import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P15-007: `authInterceptor` must discriminate per-RPC, not per-service — attaching a
 * bearer token to `BeginGitHubLogin`/`BeginOidcLogin`/`ListCredentials`/etc. when signed
 * in (so GitHub/OIDC linking and credential management actually authenticate), while
 * never attaching one to `Login`/`Register`/`RefreshSession` (which must stay
 * unauthenticated by protocol design, and `RefreshSession` specifically to avoid
 * recursing through `sessionManager.withSession`).
 */
describe('authInterceptor', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(): { headers: Headers[]; restoreFetch: () => void } {
    const headers: Headers[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      headers.push(new Headers(init?.headers));
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    global.fetch = fetchMock;
    return { headers, restoreFetch: () => (global.fetch = originalFetch) };
  }

  it('never attaches a token to Login even when signed in', async () => {
    const { headers } = mockFetch();
    const { api, sessionManager } = await import('./client.js');
    await sessionManager.setSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    await api.auth.login({ emailOrHandle: 'allie', password: 'x' }).catch(() => undefined);

    expect(headers).toHaveLength(1);
    expect(headers[0]?.get('authorization')).toBeNull();
  });

  it('attaches the bearer token to BeginGitHubLogin when signed in (linking)', async () => {
    const { headers } = mockFetch();
    const { api, sessionManager } = await import('./client.js');
    await sessionManager.setSession({ accessToken: 'access-2', refreshToken: 'refresh-2' });

    await api.auth.beginGitHubLogin({}).catch(() => undefined);

    expect(headers).toHaveLength(1);
    expect(headers[0]?.get('authorization')).toBe('Bearer access-2');
  });

  it('calls BeginGitHubLogin anonymously (no token) when signed out', async () => {
    const { headers } = mockFetch();
    const { api } = await import('./client.js');

    await api.auth.beginGitHubLogin({}).catch(() => undefined);

    expect(headers).toHaveLength(1);
    expect(headers[0]?.get('authorization')).toBeNull();
  });

  it('attaches the bearer token to ListCredentials when signed in', async () => {
    const { headers } = mockFetch();
    const { api, sessionManager } = await import('./client.js');
    await sessionManager.setSession({ accessToken: 'access-3', refreshToken: 'refresh-3' });

    await api.auth.listCredentials({}).catch(() => undefined);

    expect(headers).toHaveLength(1);
    expect(headers[0]?.get('authorization')).toBe('Bearer access-3');
  });

  it('attaches the bearer token to profile reads on a closed node', async () => {
    const { headers } = mockFetch();
    const { api, sessionManager } = await import('./client.js');
    await sessionManager.setSession({ accessToken: 'access-profile', refreshToken: 'refresh-4' });

    await api.actors.getActorByHandle({ handle: 'allie' }).catch(() => undefined);

    expect(headers).toHaveLength(1);
    expect(headers[0]?.get('authorization')).toBe('Bearer access-profile');
  });
});

/**
 * B-161: `signOut()` alone left the UI showing stale signed-in state with no feedback
 * until the user happened to navigate. When a refresh attempt itself comes back
 * Unauthenticated (the refresh token is dead, not just the access token), the app must
 * both surface a toast and leave the login route as the next place the user lands.
 */
describe('session expiry', () => {
  const originalFetch = global.fetch;
  const mockToastError = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
    mockToastError.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('toasts and redirects to /login when the refresh token itself is Unauthenticated', async () => {
    vi.doMock('sonner', () => ({ toast: { error: mockToastError } }));
    const assignMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign: assignMock });
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 'unauthenticated', message: 'token expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const { api, sessionManager } = await import('./client.js');
    await sessionManager.setSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    await api.actors.getActorByHandle({ handle: 'allie' }).catch(() => undefined);

    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('session') as string);
    expect(assignMock).toHaveBeenCalledWith('/login');
    expect(await sessionManager.getAccessToken()).toBeUndefined();
  });
});

describe('session expiry vs transient failures', () => {
  const originalFetch = global.fetch;
  const mockToastError = vi.fn();
  const assignMock = vi.fn();

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
    mockToastError.mockReset();
    assignMock.mockReset();
    vi.doMock('sonner', () => ({ toast: { error: mockToastError } }));
    vi.stubGlobal('location', { ...window.location, assign: assignMock });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  async function signedIn() {
    const client = await import('./client.js');
    const { getActorSession } = await import('./session.js');
    await client.sessionManager.setSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const { setActorSession } = await import('./session.js');
    setActorSession({ id: 'a1', handle: 'allie' } as never);
    return { ...client, getActorSession };
  }

  it.each([503, 502])(
    'keeps tokens and the actor when refresh fails with HTTP %i (cold start)',
    async (status) => {
      global.fetch = vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input instanceof Request ? input.url : input).includes('RefreshSession')
            ? json(status, { code: 'unavailable', message: 'cold' })
            : json(401, { code: 'unauthenticated', message: 'expired' }),
        ),
      );
      const { api, sessionManager, getActorSession } = await signedIn();

      await expect(api.actors.getActorByHandle({ handle: 'allie' })).rejects.toBeDefined();

      expect(await sessionManager.getAccessToken()).toBe('access-1');
      expect(getActorSession()).not.toBeNull();
      expect(mockToastError).not.toHaveBeenCalled();
      expect(assignMock).not.toHaveBeenCalled();
    },
  );

  it('clears tokens AND the cached actor when the refresh token is definitively dead', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(json(401, { code: 'unauthenticated', message: 'dead' })),
    );
    const { api, sessionManager, getActorSession } = await signedIn();

    await api.actors.getActorByHandle({ handle: 'allie' }).catch(() => undefined);

    expect(await sessionManager.getAccessToken()).toBeUndefined();
    expect(getActorSession()).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it('does not sign out when a call answers Unauthenticated for a bad argument (wrong current password)', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input instanceof Request ? input.url : input).includes('RefreshSession')
          ? json(200, {
              session: { accessToken: 'access-2', refreshToken: 'refresh-2' },
            })
          : json(401, { code: 'unauthenticated', message: 'wrong password' }),
      ),
    );
    const { api, sessionManager, getActorSession } = await signedIn();

    await expect(
      api.auth.changePassword({ currentPassword: 'nope', newPassword: 'x'.repeat(12) }),
    ).rejects.toBeDefined();

    expect(await sessionManager.getAccessToken()).toBe('access-2');
    expect(getActorSession()).not.toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });
});

describe('logoutCurrentSession', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('sends the refresh token to Logout and clears it locally', async () => {
    const { headers } = (() => {
      const headers: Headers[] = [];
      global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        headers.push(new Headers(init?.headers));
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });
      return { headers };
    })();
    const { logoutCurrentSession, sessionManager } = await import('./client.js');
    await sessionManager.setSession({
      accessToken: 'access-logout',
      refreshToken: 'refresh-logout',
    });

    await logoutCurrentSession();

    expect(headers).toHaveLength(1);
    expect(headers[0]?.get('authorization')).toBe('Bearer access-logout');
    expect(await sessionManager.getAccessToken()).toBeUndefined();
  });
});
