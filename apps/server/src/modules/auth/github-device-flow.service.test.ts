import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service.js';
import { GitHubDeviceFlowService } from './github-device-flow.service.js';

/** Stands in for `AppConfigService`; only the GitHub-related getters are read. */
function config(): AppConfigService {
  return {
    githubDeviceCodeUrl: 'https://github.test/login/device/code',
    githubTokenUrl: 'https://github.test/login/oauth/access_token',
    githubUserApiUrl: 'https://github.test/user',
    githubHttpTimeoutMs: 1000,
  } as unknown as AppConfigService;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('GitHubDeviceFlowService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('beginDeviceFlow', () => {
    it('posts client_id and scope, and parses the device-code response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          device_code: 'devcode-1',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.test/login/device',
          expires_in: 600,
          interval: 5,
        }),
      );

      const service = new GitHubDeviceFlowService(config());
      const result = await service.beginDeviceFlow('client-abc');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://github.test/login/device/code');
      expect(init.method).toBe('POST');
      const body = new URLSearchParams(init.body as string);
      expect(body.get('client_id')).toBe('client-abc');
      expect(body.get('scope')).toBe('read:user');

      expect(result.deviceCode).toBe('devcode-1');
      expect(result.userCode).toBe('ABCD-1234');
      expect(result.intervalSeconds).toBe(5);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('throws when GitHub answers with a non-OK status', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 404));
      await expect(
        new GitHubDeviceFlowService(config()).beginDeviceFlow('client-abc'),
      ).rejects.toThrow();
    });

    it('throws when the response is missing a required field', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ device_code: 'only-this' }));
      await expect(
        new GitHubDeviceFlowService(config()).beginDeviceFlow('client-abc'),
      ).rejects.toThrow();
    });
  });

  describe('pollAccessToken', () => {
    it.each([
      ['authorization_pending', 'PENDING'],
      ['slow_down', 'SLOW_DOWN'],
      ['expired_token', 'EXPIRED'],
      ['access_denied', 'DENIED'],
    ] as const)('maps GitHub error "%s" to %s', async (githubError, expectedKind) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: githubError }));
      const result = await new GitHubDeviceFlowService(config()).pollAccessToken(
        'client-abc',
        'devcode-1',
      );
      expect(result.kind).toBe(expectedKind);
    });

    it('treats an unrecognized error as still pending', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'something_new' }));
      const result = await new GitHubDeviceFlowService(config()).pollAccessToken(
        'client-abc',
        'devcode-1',
      );
      expect(result.kind).toBe('PENDING');
    });

    it('returns SUCCESS with the access token', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'gho_abc123' }));
      const result = await new GitHubDeviceFlowService(config()).pollAccessToken(
        'client-abc',
        'devcode-1',
      );
      expect(result).toEqual({ kind: 'SUCCESS', accessToken: 'gho_abc123' });
    });
  });

  describe('fetchNumericAccountId', () => {
    it('reads only the numeric id, never the login name', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 123_456, login: 'octocat' }));
      const id = await new GitHubDeviceFlowService(config()).fetchNumericAccountId('gho_abc123');
      expect(id).toBe('123456');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://github.test/user');
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer gho_abc123');
    });

    it('throws on a non-OK response', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
      await expect(
        new GitHubDeviceFlowService(config()).fetchNumericAccountId('bad-token'),
      ).rejects.toThrow();
    });
  });
});
