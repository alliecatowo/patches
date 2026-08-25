import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RemoteObjectFetchError, RemoteObjectService } from './remote-object.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import { defaultSafeFetchPolicy, safeFetch, SafeFetchError } from './security/safe-fetch.js';
import type { SafeFetchResult } from './security/safe-fetch.js';
import type * as SafeFetchModule from './security/safe-fetch.js';
import { PeerRateLimiterService } from './security/peer-rate-limiter.service.js';

/**
 * `safeFetch` itself is unit-tested (URL policy, IP guard, redirect/size/timeout caps) in
 * `security/safe-fetch`'s own tests — here it is mocked so every case is deterministic and
 * offline. What this file covers is RemoteObjectService's own logic: caching (positive and
 * negative), the per-origin budget, content-type/shape validation, DM-path refusal, and the
 * single-error-type contract (`SafeFetchError` is always wrapped into `RemoteObjectFetchError`).
 */
vi.mock('./security/safe-fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SafeFetchModule>();
  return { ...actual, safeFetch: vi.fn() };
});

const safeFetchMock = vi.mocked(safeFetch);

function makeConfig(overrides: Partial<{ isProduction: boolean }> = {}): AppConfigService {
  const base = {
    isProduction: overrides.isProduction ?? true,
    federationEnabled: true,
    nodeEnv: 'test',
    publicOrigin: 'https://test.example',
    nodeDomain: 'test.example',
    logLevel: 'info',
    grpcUrl: 'localhost:50051',
    instanceName: 'test',
    grpcReflection: false,
    e2eeUnreviewedDevMode: false,
    trustProxyHeaders: false,
    databaseUrl: undefined,
    databaseSsl: false,
    databasePoolMax: 10,
    databaseStatementTimeout: '30s',
    authCodeDeliveryKeys: [],
    authCodeDeliveryActiveKeyId: '',
    inviteOnly: false,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604800,
    jwtPrivateKeyPem: undefined,
    jwtPublicKeyPem: undefined,
    argon2Options: { memoryCost: 19456, timeCost: 2, parallelism: 1 },
    storageAccountId: undefined,
    storageAccessKeyId: undefined,
    storageSecretAccessKey: undefined,
    storageBucket: undefined,
    storageEndpoint: undefined,
    storageRegion: 'auto',
    storageForcePathStyle: false,
    mediaMaxBytes: 10485760,
    mediaMaxPixels: 8000000,
    mediaPresignPutTtlSeconds: 3600,
    mediaPresignGetTtlSeconds: 3600,
    githubClientId: undefined,
    githubDeviceCodeUrl: '',
    githubTokenUrl: '',
    githubUserApiUrl: '',
    githubHttpTimeoutMs: 10000,
    oidcProviders: [],
    oidcHttpTimeoutMs: 10000,
    httpPort: 3000,
    webOrigins: [],
    federationKeyEncryptionKey: undefined,
    dmEnabled: false,
    dmRetentionDays: 0,
    maxPostChars: 3000,
    canCreateCommunity: false,
    likeGlyphAllowList: [],
    labelVocabulary: [],
    nodePolicyUrl: '',
    privacyNoticeSummary: '',
  };
  return {
    ...base,
    config: undefined,
    get: (() => undefined) as <K extends keyof typeof base>(key: K) => (typeof base)[K],
  } as unknown as AppConfigService;
}

function okResponse(body: unknown, contentType = 'application/activity+json'): SafeFetchResult {
  return {
    status: 200,
    headers: { 'content-type': contentType },
    body: Buffer.from(JSON.stringify(body), 'utf8'),
    finalUrl: 'https://remote.example/object',
  };
}

describe('RemoteObjectService', () => {
  let service: RemoteObjectService;
  const peerRateLimiter = new PeerRateLimiterService();

  beforeEach(() => {
    safeFetchMock.mockReset();
    service = new RemoteObjectService(makeConfig({ isProduction: true }), peerRateLimiter);
  });

  describe('fetchObject - policy passthrough', () => {
    it('passes the production policy to safeFetch (no http, no private networks)', async () => {
      safeFetchMock.mockResolvedValue(okResponse({ id: 'https://r/o', type: 'Note' }));
      await service.fetchObject('https://remote.example/object');
      expect(safeFetchMock).toHaveBeenCalledWith(
        'https://remote.example/object',
        expect.objectContaining({ policy: defaultSafeFetchPolicy(true) }),
      );
      expect(defaultSafeFetchPolicy(true)).toEqual({
        allowHttp: false,
        allowPrivateNetworks: false,
      });
    });

    it('passes the lab policy when not in production', async () => {
      const labService = new RemoteObjectService(
        makeConfig({ isProduction: false }),
        peerRateLimiter,
      );
      safeFetchMock.mockResolvedValue(okResponse({ id: 'https://r/o', type: 'Note' }));
      await labService.fetchObject('https://remote.example/object');
      expect(safeFetchMock).toHaveBeenCalledWith(
        'https://remote.example/object',
        expect.objectContaining({ policy: defaultSafeFetchPolicy(false) }),
      );
    });
  });

  describe('fetchObject - valid fetch', () => {
    it('returns the parsed ActivityPub object', async () => {
      safeFetchMock.mockResolvedValue(okResponse({ id: 'https://r/o', type: 'Note' }));
      await expect(service.fetchObject('https://remote.example/object')).resolves.toEqual({
        id: 'https://r/o',
        type: 'Note',
      });
    });

    it('rejects a non-ActivityPub Content-Type', async () => {
      safeFetchMock.mockResolvedValue(okResponse({ id: 'x', type: 'Note' }, 'text/html'));
      await expect(service.fetchObject('https://remote.example/object')).rejects.toThrow(
        RemoteObjectFetchError,
      );
    });

    it('rejects a body that is not JSON', async () => {
      const response = {
        status: 200,
        headers: { 'content-type': 'application/activity+json' },
        body: Buffer.from('not json', 'utf8'),
        finalUrl: 'https://remote.example/object',
      } satisfies SafeFetchResult;
      safeFetchMock.mockResolvedValue(response);
      await expect(service.fetchObject('https://remote.example/object')).rejects.toThrow(
        RemoteObjectFetchError,
      );
    });

    it('rejects JSON missing id or type', async () => {
      safeFetchMock.mockResolvedValue(okResponse({ summary: 'no id, no type' }));
      await expect(service.fetchObject('https://remote.example/object')).rejects.toThrow(
        RemoteObjectFetchError,
      );
    });
  });

  describe('fetchObject - error wrapping', () => {
    it('wraps SafeFetchError into RemoteObjectFetchError', async () => {
      safeFetchMock.mockRejectedValue(
        new SafeFetchError('"10.0.0.1" resolves to a disallowed address.'),
      );
      await expect(service.fetchObject('https://remote.example/object')).rejects.toThrow(
        RemoteObjectFetchError,
      );
    });

    it('surfaces non-safeFetch errors from other status codes as RemoteObjectFetchError', async () => {
      const response = {
        status: 403,
        headers: {},
        body: Buffer.alloc(0),
        finalUrl: 'https://remote.example/object',
      } satisfies SafeFetchResult;
      safeFetchMock.mockResolvedValue(response);
      await expect(service.fetchObject('https://remote.example/object')).rejects.toThrow(
        RemoteObjectFetchError,
      );
    });
  });

  describe('fetchObject - negative cache (404/410)', () => {
    it('returns null on 404 and does not refetch while cached', async () => {
      const response = {
        status: 404,
        headers: {},
        body: Buffer.alloc(0),
        finalUrl: 'https://remote.example/gone',
      } satisfies SafeFetchResult;
      safeFetchMock.mockResolvedValue(response);

      await expect(service.fetchObject('https://remote.example/gone')).resolves.toBeNull();
      await expect(service.fetchObject('https://remote.example/gone')).resolves.toBeNull();
      expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns null on 410 and does not refetch while cached', async () => {
      const response = {
        status: 410,
        headers: {},
        body: Buffer.alloc(0),
        finalUrl: 'https://remote.example/dead',
      } satisfies SafeFetchResult;
      safeFetchMock.mockResolvedValue(response);

      await expect(service.fetchObject('https://remote.example/dead')).resolves.toBeNull();
      await expect(service.fetchObject('https://remote.example/dead')).resolves.toBeNull();
      expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });

    it('refetches after clearCaches', async () => {
      const response = {
        status: 404,
        headers: {},
        body: Buffer.alloc(0),
        finalUrl: 'https://remote.example/gone',
      } satisfies SafeFetchResult;
      safeFetchMock.mockResolvedValue(response);

      await expect(service.fetchObject('https://remote.example/gone')).resolves.toBeNull();
      service.clearCaches();
      await expect(service.fetchObject('https://remote.example/gone')).resolves.toBeNull();
      expect(safeFetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchObject - positive cache', () => {
    it('serves a repeat fetch from cache without calling safeFetch again', async () => {
      safeFetchMock.mockResolvedValue(okResponse({ id: 'https://r/o', type: 'Note' }));
      await service.fetchObject('https://remote.example/object');
      await service.fetchObject('https://remote.example/object');
      expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchObject - origin budget', () => {
    it('exhausts after the per-window limit', async () => {
      safeFetchMock.mockResolvedValue(okResponse({ id: 'https://r/o', type: 'Note' }));
      const origin = 'https://budget.example';
      for (let i = 0; i < 30; i++) {
        await service.fetchObject(`${origin}/object-${String(i)}`);
      }
      const rejected = service.fetchObject(`${origin}/object-31`);
      await expect(rejected).rejects.toThrow(RemoteObjectFetchError);
      await expect(rejected).rejects.toThrow('Origin budget exceeded');
      expect(safeFetchMock).toHaveBeenCalledTimes(30);
    });

    it('separates budgets by origin', async () => {
      safeFetchMock.mockResolvedValue(okResponse({ id: 'https://r/o', type: 'Note' }));
      for (let i = 0; i < 30; i++) {
        await service.fetchObject(`https://origin-a.example/object-${String(i)}`);
      }
      await expect(service.fetchObject('https://origin-b.example/object')).resolves.toBeDefined();
    });
  });

  describe('fetchObject - DM path refusal', () => {
    it('rejects URIs with a /direct-messages path without fetching', async () => {
      await expect(service.fetchObject('https://example.com/direct-messages/123')).rejects.toThrow(
        'Remote object fetch must not be used for DM paths',
      );
      expect(safeFetchMock).not.toHaveBeenCalled();
    });

    it('rejects URIs with a /dm/ path without fetching', async () => {
      await expect(service.fetchObject('https://example.com/dm/123')).rejects.toThrow(
        'Remote object fetch must not be used for DM paths',
      );
      expect(safeFetchMock).not.toHaveBeenCalled();
    });
  });
});
