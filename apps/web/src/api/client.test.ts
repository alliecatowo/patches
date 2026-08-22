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
