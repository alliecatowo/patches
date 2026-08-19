import { ConfigError } from '@patches/config';
import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

/**
 * Minimal valid keys for the production checks below. Real values come from
 * `pnpm keys:generate`; these are only ever parsed for their PEM label, never used to sign.
 */
const JWT_KEYS = {
  JWT_PRIVATE_KEY: Buffer.from(
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA==\n-----END PRIVATE KEY-----\n',
  ).toString('base64'),
  JWT_PUBLIC_KEY: Buffer.from(
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----\n',
  ).toString('base64'),
};

describe('validateEnv', () => {
  it('applies development defaults when nothing is set', () => {
    const env = validateEnv({});

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'log',
      GRPC_HOST: '127.0.0.1',
      GRPC_PORT: 50_051,
      INSTANCE_NAME: 'patches-dev',
      PUBLIC_ORIGIN: 'http://localhost:3000',
      INVITE_ONLY: true,
      GRPC_REFLECTION: false,
    });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('coerces GRPC_PORT from its string environment form', () => {
    expect(validateEnv({ GRPC_PORT: '50052' }).GRPC_PORT).toBe(50_052);
  });

  it('parses GRPC_REFLECTION as a boolean-ish env value (B-006, dev-only default off)', () => {
    expect(validateEnv({ GRPC_REFLECTION: 'true' }).GRPC_REFLECTION).toBe(true);
    expect(validateEnv({ GRPC_REFLECTION: '1' }).GRPC_REFLECTION).toBe(true);
    expect(validateEnv({}).GRPC_REFLECTION).toBe(false);
  });

  it('refuses to boot on an out-of-range port', () => {
    expect(() => validateEnv({ GRPC_PORT: '70000' })).toThrow(ConfigError);
  });

  it('refuses to boot on a non-numeric port', () => {
    expect(() => validateEnv({ GRPC_PORT: 'not-a-port' })).toThrow(ConfigError);
  });

  it('refuses to boot on an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(ConfigError);
  });

  it('refuses to boot on a malformed PUBLIC_ORIGIN', () => {
    expect(() => validateEnv({ PUBLIC_ORIGIN: 'localhost:3000' })).toThrow(ConfigError);
  });

  it('refuses to boot on a PUBLIC_ORIGIN with a non-http(s) scheme', () => {
    expect(() => validateEnv({ PUBLIC_ORIGIN: 'ftp://patches.example' })).toThrow(ConfigError);
  });

  it('accepts an explicit https PUBLIC_ORIGIN', () => {
    expect(validateEnv({ PUBLIC_ORIGIN: 'https://patches.example' }).PUBLIC_ORIGIN).toBe(
      'https://patches.example',
    );
  });

  it('leaves DATABASE_URL optional outside production', () => {
    expect(validateEnv({ NODE_ENV: 'development' }).DATABASE_URL).toBeUndefined();
    expect(validateEnv({ NODE_ENV: 'test' }).DATABASE_URL).toBeUndefined();
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(ConfigError);
  });

  it('accepts a valid DATABASE_URL in production', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://patches:patches@127.0.0.1:5432/patches',
      ...JWT_KEYS,
    });
    expect(env.DATABASE_URL).toBe('postgres://patches:patches@127.0.0.1:5432/patches');
  });

  it('requires the JWT signing keys in production', () => {
    try {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://patches:patches@127.0.0.1:5432/patches',
      });
      expect.unreachable('expected validateEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const paths = (error as ConfigError).issues.map((issue) => issue.path);
      expect(paths).toContain('JWT_PRIVATE_KEY');
      expect(paths).toContain('JWT_PUBLIC_KEY');
    }
  });

  it('rejects a JWT key that is not base64-encoded PEM', () => {
    expect(() => validateEnv({ JWT_PRIVATE_KEY: 'not base64 pem' })).toThrow(ConfigError);
    // Right shape, wrong PEM label: a public key pasted into the private key variable.
    expect(() => validateEnv({ JWT_PRIVATE_KEY: JWT_KEYS.JWT_PUBLIC_KEY })).toThrow(ConfigError);
  });

  it('defaults the auth knobs to their documented values', () => {
    const env = validateEnv({});
    expect(env).toMatchObject({
      ACCESS_TOKEN_TTL: 900,
      REFRESH_TOKEN_TTL: 2_592_000,
      NODE_DOMAIN: 'localhost',
      ARGON2_MEMORY_KIB: 19_456,
      ARGON2_TIME_COST: 2,
      ARGON2_PARALLELISM: 1,
    });
  });

  it('defaults Amendment B social capabilities and parses operator overrides', () => {
    expect(validateEnv({})).toMatchObject({
      DM_ENABLED: true,
      DM_RETENTION_DAYS: 0,
      MAX_POST_CHARS: 5000,
      CAN_CREATE_COMMUNITY: false,
      LIKE_GLYPH_ALLOW_LIST: [],
    });
    expect(
      validateEnv({
        DM_ENABLED: 'false',
        DM_RETENTION_DAYS: '30',
        MAX_POST_CHARS: '7500',
        CAN_CREATE_COMMUNITY: 'true',
        LIKE_GLYPH_ALLOW_LIST: '♥, ★',
      }),
    ).toMatchObject({
      DM_ENABLED: false,
      DM_RETENTION_DAYS: 30,
      MAX_POST_CHARS: 7500,
      CAN_CREATE_COMMUNITY: true,
      LIKE_GLYPH_ALLOW_LIST: ['♥', '★'],
    });
  });

  it('rejects a post limit above the node ceiling', () => {
    expect(() => validateEnv({ MAX_POST_CHARS: '10001' })).toThrow(ConfigError);
  });

  it('rejects a malformed DATABASE_URL even when optional', () => {
    expect(() => validateEnv({ DATABASE_URL: 'not-a-url' })).toThrow(ConfigError);
  });

  it('names every offending variable in the failure message', () => {
    try {
      validateEnv({ NODE_ENV: 'staging', GRPC_PORT: '0' });
      expect.unreachable('expected validateEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const paths = (error as ConfigError).issues.map((issue) => issue.path);
      expect(paths).toContain('NODE_ENV');
      expect(paths).toContain('GRPC_PORT');
    }
  });

  it('ignores unrelated environment variables', () => {
    expect(() => validateEnv({ PATH: '/usr/bin', HOME: '/home/somebody' })).not.toThrow();
  });
});
