import { ConfigError } from '@patches/config';
import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

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
    });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('coerces GRPC_PORT from its string environment form', () => {
    expect(validateEnv({ GRPC_PORT: '50052' }).GRPC_PORT).toBe(50_052);
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
    });
    expect(env.DATABASE_URL).toBe('postgres://patches:patches@127.0.0.1:5432/patches');
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
