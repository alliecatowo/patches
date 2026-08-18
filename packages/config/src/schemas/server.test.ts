import { describe, expect, it } from 'vitest';
import { serverEnvSchema } from './server.js';

const base = { PUBLIC_ORIGIN: 'http://localhost:50051' };

describe('serverEnvSchema', () => {
  it('defaults GRPC_HOST/PORT and INVITE_ONLY', () => {
    const result = serverEnvSchema.parse(base);
    expect(result.GRPC_HOST).toBe('127.0.0.1');
    expect(result.GRPC_PORT).toBe(50051);
    expect(result.INVITE_ONLY).toBe(true);
  });

  it('allows missing JWT keys outside production', () => {
    expect(serverEnvSchema.safeParse({ ...base, NODE_ENV: 'development' }).success).toBe(true);
  });

  it('requires JWT_PRIVATE_KEY and JWT_PUBLIC_KEY in production', () => {
    const result = serverEnvSchema.safeParse({ ...base, NODE_ENV: 'production' });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const paths = result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('JWT_PRIVATE_KEY');
    expect(paths).toContain('JWT_PUBLIC_KEY');
  });

  it('passes in production once both JWT keys are set', () => {
    const result = serverEnvSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      JWT_PRIVATE_KEY: 'priv',
      JWT_PUBLIC_KEY: 'pub',
    });
    expect(result.success).toBe(true);
  });
});
