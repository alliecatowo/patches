import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import type { DataSource, EntityManager } from 'typeorm';
import { beforeAll, describe, expect, it } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service.js';
import { hashRefreshToken, refreshTokenHashesMatch, TokenService } from './token.service.js';

/**
 * Covers the stateless half of `TokenService` — signing, verification and refresh-token
 * material. Rotation and reuse detection need real rows and are exercised end-to-end in
 * `test/auth.integration.test.ts` against PostgreSQL, where the conditional `UPDATE` that
 * makes them race-safe actually runs.
 */

let privatePem: string;
let publicPem: string;
let otherPublicPem: string;

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  privatePem = await exportPKCS8(pair.privateKey);
  publicPem = await exportSPKI(pair.publicKey);
  const other = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  otherPublicPem = await exportSPKI(other.publicKey);
});

interface StubConfig {
  nodeDomain: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  jwtPrivateKeyPem: string | undefined;
  jwtPublicKeyPem: string | undefined;
}

/**
 * `AppConfigService` reads from Nest's `ConfigService`; standing one up here would test
 * `@nestjs/config` rather than this class. The double implements exactly the members
 * `TokenService` uses, so the cast is checked by the `StubConfig` shape above it.
 */
function tokenService(overrides: Partial<StubConfig> = {}): TokenService {
  const config: StubConfig = {
    nodeDomain: 'patches.test',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 3600,
    jwtPrivateKeyPem: privatePem,
    jwtPublicKeyPem: publicPem,
    ...overrides,
  };
  // The DataSource is only touched by reuse detection, which is covered end-to-end in the
  // integration suite; issuance never reaches it.
  const dataSource = {} as unknown as DataSource;
  return new TokenService(dataSource, config as unknown as AppConfigService);
}

/** Records what would have been persisted, so issuance can be tested without a database. */
function stubManager(): { manager: EntityManager; saved: { tokenHash: string }[] } {
  const saved: { tokenHash: string }[] = [];
  const repository = {
    create: (values: { tokenHash: string }) => values,
    save: (values: { tokenHash: string }) => {
      saved.push(values);
      return Promise.resolve(values);
    },
  };
  return { manager: { getRepository: () => repository } as unknown as EntityManager, saved };
}

describe('access tokens', () => {
  it('round-trips the session claims', async () => {
    const service = tokenService();
    const { manager } = stubManager();

    const issued = await service.issueSession(manager, { userId: 'user-1', actorId: 'actor-1' });
    const claims = await service.verifyAccessToken(issued.accessToken);

    expect(claims).toMatchObject({
      userId: 'user-1',
      actorId: 'actor-1',
      sessionId: issued.sessionId,
    });
    expect(claims.expiresAt.getTime()).toBe(
      Math.floor(issued.accessExpiresAt.getTime() / 1000) * 1000,
    );
  });

  it('expires roughly ACCESS_TOKEN_TTL from now', async () => {
    const service = tokenService({ accessTokenTtlSeconds: 60 });
    const { manager } = stubManager();
    const issued = await service.issueSession(manager, { userId: 'u', actorId: 'a' });
    const remainingMs = issued.accessExpiresAt.getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan(50_000);
    expect(remainingMs).toBeLessThanOrEqual(60_000);
  });

  it('rejects a token signed by a different key', async () => {
    const issuer = tokenService();
    const { manager } = stubManager();
    const issued = await issuer.issueSession(manager, { userId: 'u', actorId: 'a' });

    const verifier = tokenService({ jwtPublicKeyPem: otherPublicPem });
    await expect(verifier.verifyAccessToken(issued.accessToken)).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
  });

  it('rejects a token issued by another node (§163 issuer binding)', async () => {
    const issuer = tokenService({ nodeDomain: 'other.example' });
    const { manager } = stubManager();
    const issued = await issuer.issueSession(manager, { userId: 'u', actorId: 'a' });

    await expect(tokenService().verifyAccessToken(issued.accessToken)).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
  });

  it('rejects an expired token as AUTH_SESSION_EXPIRED', async () => {
    // A negative-but-valid TTL is not reachable through config validation; it is set here to
    // produce an already-expired token without making the test wait.
    const service = tokenService({ accessTokenTtlSeconds: -60 });
    const { manager } = stubManager();
    const issued = await service.issueSession(manager, { userId: 'u', actorId: 'a' });

    await expect(service.verifyAccessToken(issued.accessToken)).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
    });
  });

  it('rejects a tampered token', async () => {
    const service = tokenService();
    const { manager } = stubManager();
    const issued = await service.issueSession(manager, { userId: 'u', actorId: 'a' });
    const [header, , signature] = issued.accessToken.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'someone-else' })).toString('base64url');

    await expect(
      service.verifyAccessToken(`${String(header)}.${forged}.${String(signature)}`),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  it('fails loudly when no signing key is configured', async () => {
    const service = tokenService({ jwtPrivateKeyPem: undefined });
    const { manager } = stubManager();
    await expect(service.issueSession(manager, { userId: 'u', actorId: 'a' })).rejects.toThrow(
      /JWT_PRIVATE_KEY/,
    );
  });
});

describe('refresh tokens', () => {
  it('stores only a hash, never the token itself', async () => {
    const service = tokenService();
    const { manager, saved } = stubManager();

    const issued = await service.issueSession(manager, { userId: 'u', actorId: 'a' });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.tokenHash).toBe(hashRefreshToken(issued.refreshToken));
    expect(JSON.stringify(saved)).not.toContain(issued.refreshToken);
  });

  it('issues a distinct high-entropy token every time', async () => {
    const service = tokenService();
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const { manager } = stubManager();
      const issued = await service.issueSession(manager, { userId: 'u', actorId: 'a' });
      // 32 bytes base64url — no padding, 43 characters.
      expect(issued.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      tokens.add(issued.refreshToken);
    }
    expect(tokens.size).toBe(20);
  });

  it('compares hashes in constant time', () => {
    const hash = hashRefreshToken('a-token');
    expect(refreshTokenHashesMatch(hash, hashRefreshToken('a-token'))).toBe(true);
    expect(refreshTokenHashesMatch(hash, hashRefreshToken('another-token'))).toBe(false);
    expect(refreshTokenHashesMatch(hash, 'ab')).toBe(false);
  });
});
