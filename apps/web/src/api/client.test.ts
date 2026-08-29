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
