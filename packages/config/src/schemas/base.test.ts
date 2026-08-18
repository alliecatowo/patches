import { describe, expect, it } from 'vitest';
import { baseEnvSchema } from './base.js';

describe('baseEnvSchema', () => {
  it('normalises Nest log-level names to the shared vocabulary', () => {
    expect(baseEnvSchema.parse({ LOG_LEVEL: 'log' }).LOG_LEVEL).toBe('info');
    expect(baseEnvSchema.parse({ LOG_LEVEL: 'verbose' }).LOG_LEVEL).toBe('debug');
  });

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
