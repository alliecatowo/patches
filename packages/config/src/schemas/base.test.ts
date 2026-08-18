import { describe, expect, it } from 'vitest';
import { baseEnvSchema } from './base.js';

describe('baseEnvSchema', () => {
  it('defaults NODE_ENV and LOG_LEVEL', () => {
    expect(baseEnvSchema.parse({})).toEqual({ NODE_ENV: 'development', LOG_LEVEL: 'info' });
  });

  it('accepts explicit values', () => {
    expect(baseEnvSchema.parse({ NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toEqual({
      NODE_ENV: 'production',
      LOG_LEVEL: 'debug',
    });
  });

  it('rejects unknown NODE_ENV', () => {
    expect(baseEnvSchema.safeParse({ NODE_ENV: 'staging' }).success).toBe(false);
  });
});
