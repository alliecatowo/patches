import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService, OidcProviderConfig } from '../../config/app-config.service.js';
import { OidcDeviceFlowService } from './oidc-device-flow.service.js';

/** Stands in for `AppConfigService`; only `oidcHttpTimeoutMs` is read. */
function config(): AppConfigService {
  return { oidcHttpTimeoutMs: 1000 } as unknown as AppConfigService;
}

function provider(overrides: Partial<OidcProviderConfig> = {}): OidcProviderConfig {
  return {
    id: 'gitlab',
    displayName: 'GitLab',
    deviceAuthorizationUrl: 'https://gitlab.test/oauth/authorize_device',
    tokenUrl: 'https://gitlab.test/oauth/token',
    userinfoUrl: 'https://gitlab.test/oauth/userinfo',
    clientId: 'client-abc',
    clientSecret: 'secret-xyz',
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('OidcDeviceFlowService', () => {
  // Typed rather than a bare `vi.fn()`: an untyped mock infers a void-returning signature, so
  // the timeout test's `mockImplementationOnce` returning a Promise trips no-misused-promises.
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('beginDeviceFlow', () => {
    it('posts client_id, client_secret and scope to the provider-specific URL', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          device_code: 'devcode-1',
          user_code: 'ABCD-1234',
          verification_uri: 'https://gitlab.test/login/device',
          expires_in: 600,
          interval: 5,
        }),
      );

      const service = new OidcDeviceFlowService(config());
      const result = await service.beginDeviceFlow(provider());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://gitlab.test/oauth/authorize_device');
      expect(init.method).toBe('POST');
      const body = new URLSearchParams(init.body as string);
      expect(body.get('client_id')).toBe('client-abc');
      expect(body.get('client_secret')).toBe('secret-xyz');
      expect(body.get('scope')).toBe('openid');

      expect(result.deviceCode).toBe('devcode-1');
      expect(result.userCode).toBe('ABCD-1234');
      expect(result.intervalSeconds).toBe(5);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('accepts verification_url as a fallback for verification_uri', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          device_code: 'devcode-1',
          user_code: 'ABCD-1234',
          verification_url: 'https://gitlab.test/login/device',
          expires_in: 600,
        }),
      );

      const result = await new OidcDeviceFlowService(config()).beginDeviceFlow(provider());
      expect(result.verificationUri).toBe('https://gitlab.test/login/device');
      // Missing `interval` defaults rather than throwing — not every provider echoes one.
      expect(result.intervalSeconds).toBe(5);
    });

    it('throws when the provider answers with a non-OK status', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 404));
      await expect(
        new OidcDeviceFlowService(config()).beginDeviceFlow(provider()),
      ).rejects.toThrow();
    });

    it('throws when the response is missing a required field', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ device_code: 'only-this' }));
      await expect(
        new OidcDeviceFlowService(config()).beginDeviceFlow(provider()),
      ).rejects.toThrow();
    });

    it('sends each configured provider to its own URLs, never a mixed-up one', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          device_code: 'd',
          user_code: 'u',
          verification_uri: 'https://codeberg.test/device',
          expires_in: 600,
          interval: 5,
        }),
      );
      const codeberg = provider({
        id: 'codeberg',
        displayName: 'Codeberg',
        deviceAuthorizationUrl: 'https://codeberg.test/login/oauth/device',
        clientId: 'codeberg-client',
        clientSecret: 'codeberg-secret',
      });
      await new OidcDeviceFlowService(config()).beginDeviceFlow(codeberg);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://codeberg.test/login/oauth/device');
      const body = new URLSearchParams(init.body as string);
      expect(body.get('client_id')).toBe('codeberg-client');
    });
  });

  describe('pollAccessToken', () => {
    it.each([
      ['authorization_pending', 'PENDING'],
      ['slow_down', 'SLOW_DOWN'],
      ['expired_token', 'EXPIRED'],
      ['access_denied', 'DENIED'],
    ] as const)('maps provider error "%s" to %s', async (providerError, expectedKind) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: providerError }));
      const result = await new OidcDeviceFlowService(config()).pollAccessToken(
        provider(),
        'devcode-1',
      );
      expect(result.kind).toBe(expectedKind);
    });

    it('treats an unrecognized error as still pending', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'something_new' }));
      const result = await new OidcDeviceFlowService(config()).pollAccessToken(
        provider(),
        'devcode-1',
      );
      expect(result.kind).toBe('PENDING');
    });

    it('returns SUCCESS with the access token', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'glpat-abc123' }));
      const result = await new OidcDeviceFlowService(config()).pollAccessToken(
        provider(),
        'devcode-1',
      );
      expect(result).toEqual({ kind: 'SUCCESS', accessToken: 'glpat-abc123' });
    });
  });

  describe('fetchSubject', () => {
    it('reads only the OIDC sub claim, never a username or email', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ sub: '123456', preferred_username: 'octocat', email: 'a@b.test' }),
      );
      const sub = await new OidcDeviceFlowService(config()).fetchSubject(
        provider(),
        'glpat-abc123',
      );
      expect(sub).toBe('123456');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://gitlab.test/oauth/userinfo');
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer glpat-abc123');
    });

    it('throws on a non-OK response', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
      await expect(
        new OidcDeviceFlowService(config()).fetchSubject(provider(), 'bad-token'),
      ).rejects.toThrow();
    });
  });

  describe('outbound request timeout (spec §176)', () => {
    it('aborts the request once the configured timeout elapses', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init.signal;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      });

      const service = new OidcDeviceFlowService(config());
      const pending = service.beginDeviceFlow(provider());
      const assertion = expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      vi.useRealTimers();
    });
  });
});
