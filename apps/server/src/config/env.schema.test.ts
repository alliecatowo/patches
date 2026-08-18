import { describe, expect, it } from 'vitest';

import { InvalidConfigurationError, validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('applies development defaults when nothing is set', () => {
    const env = validateEnv({});

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'log',
      GRPC_HOST: '127.0.0.1',
      GRPC_PORT: 50_051,
      INSTANCE_NAME: 'patches-dev',
    });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('coerces GRPC_PORT from its string environment form', () => {
    expect(validateEnv({ GRPC_PORT: '50052' }).GRPC_PORT).toBe(50_052);
  });

  it('refuses to boot on an out-of-range port', () => {
    expect(() => validateEnv({ GRPC_PORT: '70000' })).toThrow(InvalidConfigurationError);
  });

  it('refuses to boot on a non-numeric port', () => {
    expect(() => validateEnv({ GRPC_PORT: 'not-a-port' })).toThrow(InvalidConfigurationError);
  });

  it('refuses to boot on an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(InvalidConfigurationError);
  });

  it('refuses to boot on a malformed PUBLIC_ORIGIN', () => {
    expect(() => validateEnv({ PUBLIC_ORIGIN: 'localhost:3000' })).toThrow(InvalidConfigurationError);
  });

  it('names every offending variable in the failure message', () => {
    try {
      validateEnv({ NODE_ENV: 'staging', GRPC_PORT: '0' });
      expect.unreachable('expected validateEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigurationError);
      const issues = (error as InvalidConfigurationError).issues.join('\n');
      expect(issues).toContain('NODE_ENV');
      expect(issues).toContain('GRPC_PORT');
    }
  });

  it('ignores unrelated environment variables', () => {
    expect(() => validateEnv({ PATH: '/usr/bin', HOME: '/home/somebody' })).not.toThrow();
  });
});
