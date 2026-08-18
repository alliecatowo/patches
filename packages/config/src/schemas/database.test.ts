import { describe, expect, it } from 'vitest';
import { databaseEnvSchema } from './database.js';

describe('databaseEnvSchema', () => {
  it('requires a valid DATABASE_URL', () => {
    expect(databaseEnvSchema.safeParse({ DATABASE_URL: 'not-a-url' }).success).toBe(false);
    expect(
      databaseEnvSchema.safeParse({
        DATABASE_URL: 'postgres://patches:patches@127.0.0.1:5432/patches',
      }).success,
    ).toBe(true);
  });

  it('defaults DATABASE_SSL to false and DATABASE_POOL_MAX to 10', () => {
    const result = databaseEnvSchema.parse({ DATABASE_URL: 'postgres://localhost:5432/patches' });
    expect(result.DATABASE_SSL).toBe(false);
    expect(result.DATABASE_POOL_MAX).toBe(10);
  });

  it('coerces DATABASE_SSL and DATABASE_POOL_MAX from strings', () => {
    const result = databaseEnvSchema.parse({
      DATABASE_URL: 'postgres://localhost:5432/patches',
      DATABASE_SSL: 'true',
      DATABASE_POOL_MAX: '25',
    });
    expect(result.DATABASE_SSL).toBe(true);
    expect(result.DATABASE_POOL_MAX).toBe(25);
  });

  it('leaves TEST_DATABASE_URL optional', () => {
    const result = databaseEnvSchema.parse({ DATABASE_URL: 'postgres://localhost:5432/patches' });
    expect(result.TEST_DATABASE_URL).toBeUndefined();
  });
});
