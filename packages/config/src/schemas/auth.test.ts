import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { authEnvSchema, authEnvShape } from './auth.js';

const base64Pem = (label: string): string =>
  Buffer.from(`-----BEGIN ${label}-----\nQUJD\n-----END ${label}-----\n`).toString('base64');

const PRIVATE_KEY = base64Pem('PRIVATE KEY');
const PUBLIC_KEY = base64Pem('PUBLIC KEY');

describe('authEnvSchema', () => {
  it('applies the documented defaults', () => {
    expect(authEnvSchema.parse({})).toEqual({
      ACCESS_TOKEN_TTL: 900,
      REFRESH_TOKEN_TTL: 2_592_000,
      NODE_DOMAIN: 'localhost',
      ARGON2_MEMORY_KIB: 19_456,
      ARGON2_TIME_COST: 2,
      ARGON2_PARALLELISM: 1,
    });
  });

  it('accepts base64-encoded PEM keys', () => {
    const parsed = authEnvSchema.parse({
      JWT_PRIVATE_KEY: PRIVATE_KEY,
      JWT_PUBLIC_KEY: PUBLIC_KEY,
    });
    expect(parsed.JWT_PRIVATE_KEY).toBe(PRIVATE_KEY);
    expect(Buffer.from(parsed.JWT_PUBLIC_KEY ?? '', 'base64').toString('utf8')).toContain(
      '-----BEGIN PUBLIC KEY-----',
    );
  });

  it('rejects a value that is not base64 at all', () => {
    expect(() => authEnvSchema.parse({ JWT_PRIVATE_KEY: 'not base64!!' })).toThrow(z.ZodError);
  });

  it('rejects base64 of something that is not a PEM block', () => {
    const notPem = Buffer.from('just some text').toString('base64');
    expect(() => authEnvSchema.parse({ JWT_PRIVATE_KEY: notPem })).toThrow(z.ZodError);
  });

  it('rejects a public key pasted into the private key variable, and vice versa', () => {
    expect(() => authEnvSchema.parse({ JWT_PRIVATE_KEY: PUBLIC_KEY })).toThrow(z.ZodError);
    expect(() => authEnvSchema.parse({ JWT_PUBLIC_KEY: PRIVATE_KEY })).toThrow(z.ZodError);
  });

  it('coerces the numeric knobs from their string environment form', () => {
    const parsed = authEnvSchema.parse({
      ACCESS_TOKEN_TTL: '300',
      REFRESH_TOKEN_TTL: '86400',
      ARGON2_MEMORY_KIB: '47104',
      ARGON2_TIME_COST: '3',
      ARGON2_PARALLELISM: '2',
    });
    expect(parsed).toMatchObject({
      ACCESS_TOKEN_TTL: 300,
      REFRESH_TOKEN_TTL: 86_400,
      ARGON2_MEMORY_KIB: 47_104,
      ARGON2_TIME_COST: 3,
      ARGON2_PARALLELISM: 2,
    });
  });

  it('refuses Argon2id parameters below the OWASP baseline (§34)', () => {
    expect(() => authEnvSchema.parse({ ARGON2_MEMORY_KIB: '1024' })).toThrow(z.ZodError);
    expect(() => authEnvSchema.parse({ ARGON2_TIME_COST: '1' })).toThrow(z.ZodError);
  });

  it('refuses a zero or negative token lifetime', () => {
    expect(() => authEnvSchema.parse({ ACCESS_TOKEN_TTL: '0' })).toThrow(z.ZodError);
    expect(() => authEnvSchema.parse({ REFRESH_TOKEN_TTL: '-1' })).toThrow(z.ZodError);
  });

  it('exports a plain shape other schemas can compose', () => {
    expect(Object.keys(authEnvShape)).toContain('NODE_DOMAIN');
    expect(z.object(authEnvShape).parse({}).NODE_DOMAIN).toBe('localhost');
  });
});
