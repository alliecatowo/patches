import { ConfigError } from '@patches/config';
import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

const DATABASE_URL = 'postgres://patches:patches@127.0.0.1:5432/patches';

describe('validateEnv', () => {
  it('applies development defaults given a valid DATABASE_URL', () => {
    const env = validateEnv({ DATABASE_URL, EMAIL_FROM: 'Patches <no-reply@patches.local>' });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      EMAIL_PROVIDER: 'console',
      WORKER_CONCURRENCY: 2,
      WORKER_POLL_MS: 1000,
      WORKER_IDLE_BACKOFF_MAX_MS: 10_000,
    });
    expect(env.WORKER_ID.length).toBeGreaterThan(0);
  });

  it('requires DATABASE_URL unconditionally (unlike apps/server)', () => {
    expect(() => validateEnv({ EMAIL_FROM: 'a@b.c' })).toThrow(ConfigError);
  });

  it('requires EMAIL_FROM', () => {
    expect(() => validateEnv({ DATABASE_URL })).toThrow(ConfigError);
  });

  it('requires SMTP_HOST/SMTP_PORT when EMAIL_PROVIDER=smtp', () => {
    expect(() =>
      validateEnv({ DATABASE_URL, EMAIL_FROM: 'a@b.c', EMAIL_PROVIDER: 'smtp' }),
    ).toThrow(ConfigError);
  });

  it('accepts a fully configured smtp provider', () => {
    const env = validateEnv({
      DATABASE_URL,
      EMAIL_FROM: 'a@b.c',
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
    });
    expect(env.SMTP_PORT).toBe(1025);
  });

  it('requires RESEND_API_KEY when EMAIL_PROVIDER=resend', () => {
    expect(() =>
      validateEnv({ DATABASE_URL, EMAIL_FROM: 'a@b.c', EMAIL_PROVIDER: 'resend' }),
    ).toThrow(ConfigError);
  });

  it('coerces WORKER_CONCURRENCY/WORKER_POLL_MS from their string form', () => {
    const env = validateEnv({
      DATABASE_URL,
      EMAIL_FROM: 'a@b.c',
      WORKER_CONCURRENCY: '5',
      WORKER_POLL_MS: '250',
    });
    expect(env.WORKER_CONCURRENCY).toBe(5);
    expect(env.WORKER_POLL_MS).toBe(250);
  });

  it('honours an explicit WORKER_ID', () => {
    const env = validateEnv({ DATABASE_URL, EMAIL_FROM: 'a@b.c', WORKER_ID: 'worker-1' });
    expect(env.WORKER_ID).toBe('worker-1');
  });
});
