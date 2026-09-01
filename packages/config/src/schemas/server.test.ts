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

  it('rejects a GRPC_PORT outside the valid port range', () => {
    expect(serverEnvSchema.safeParse({ ...base, GRPC_PORT: '70000' }).success).toBe(false);
    expect(serverEnvSchema.safeParse({ ...base, GRPC_PORT: '0' }).success).toBe(false);
  });

  it('requires PUBLIC_ORIGIN to carry an http(s) scheme', () => {
    expect(serverEnvSchema.safeParse({ PUBLIC_ORIGIN: 'http://localhost:50051' }).success).toBe(
      true,
    );
    expect(serverEnvSchema.safeParse({ PUBLIC_ORIGIN: 'https://patches.example' }).success).toBe(
      true,
    );
    // Bare `host:port` reads as `scheme:opaque` to a URL parser — must be rejected, not
    // silently accepted as if `host` were the hostname.
    expect(serverEnvSchema.safeParse({ PUBLIC_ORIGIN: 'localhost:50051' }).success).toBe(false);
    expect(serverEnvSchema.safeParse({ PUBLIC_ORIGIN: 'ftp://patches.example' }).success).toBe(
      false,
    );
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

  it('defaults WEB_ORIGINS to an empty allow-list', () => {
    const result = serverEnvSchema.parse(base);
    expect(result.WEB_ORIGINS).toEqual([]);
    expect(result.PASSKEY_RP_ID).toBeUndefined();
    expect(result.PASSKEY_ORIGINS).toEqual([]);
  });

  it('accepts a bare passkey RP hostname and defaults origins to empty', () => {
    const result = serverEnvSchema.parse({ ...base, PASSKEY_RP_ID: 'app.example' });
    expect(result.PASSKEY_RP_ID).toBe('app.example');
    expect(result.PASSKEY_ORIGINS).toEqual([]);
  });

  it('parses and validates passkey origins like WEB_ORIGINS', () => {
    const result = serverEnvSchema.parse({
      ...base,
      PASSKEY_ORIGINS: ' https://app.example, https://second.example:8443 ',
    });
    expect(result.PASSKEY_ORIGINS).toEqual(['https://app.example', 'https://second.example:8443']);
    expect(
      serverEnvSchema.safeParse({ ...base, PASSKEY_RP_ID: 'https://app.example' }).success,
    ).toBe(false);
    expect(
      serverEnvSchema.safeParse({ ...base, PASSKEY_ORIGINS: 'https://app.example/path' }).success,
    ).toBe(false);
  });

  it('parses a comma-separated WEB_ORIGINS list, trimming whitespace', () => {
    const result = serverEnvSchema.parse({
      ...base,
      WEB_ORIGINS: ' https://app.example, https://second.example:8443 ',
    });
    expect(result.WEB_ORIGINS).toEqual(['https://app.example', 'https://second.example:8443']);
  });

  it('rejects a WEB_ORIGINS entry carrying a path', () => {
    expect(
      serverEnvSchema.safeParse({ ...base, WEB_ORIGINS: 'https://app.example/callback' }).success,
    ).toBe(false);
  });

  it('rejects a WEB_ORIGINS entry with a non-http(s) scheme', () => {
    expect(serverEnvSchema.safeParse({ ...base, WEB_ORIGINS: 'ftp://app.example' }).success).toBe(
      false,
    );
  });
});
