import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConfigError } from './errors.js';
import { loadEnv } from './load-env.js';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(1234),
  SECRET: z.string().min(8),
});

describe('loadEnv', () => {
  it('returns typed, coerced config on success', () => {
    const config = loadEnv(schema, { PORT: '8080', SECRET: 'longenoughsecret' });
    expect(config).toEqual({ NODE_ENV: 'development', PORT: 8080, SECRET: 'longenoughsecret' });
  });

  it('applies defaults for missing optional variables', () => {
    const config = loadEnv(schema, { SECRET: 'longenoughsecret' });
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(1234);
  });

  it('throws ConfigError listing every invalid variable, not just the first', () => {
    let caught: unknown;
    try {
      loadEnv(schema, { NODE_ENV: 'bogus', PORT: 'not-a-number', SECRET: 'short' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const error = caught as ConfigError;
    expect(error.issues).toHaveLength(3);
    expect(error.issues.map((i) => i.path).sort()).toEqual(['NODE_ENV', 'PORT', 'SECRET']);
  });

  it('never includes the offending value in the error', () => {
    let caught: unknown;
    try {
      loadEnv(schema, {
        SECRET: 'super-secret-received-value-should-not-leak' + '!'.repeat(0),
        NODE_ENV: 'nope',
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const message = (caught as Error).message;
    expect(message).not.toContain('super-secret-received-value-should-not-leak');
  });

  it('reads from process.env by default', () => {
    process.env.SECRET = 'longenoughsecret';
    try {
      const config = loadEnv(schema);
      expect(config.SECRET).toBe('longenoughsecret');
    } finally {
      delete process.env.SECRET;
    }
  });
});
