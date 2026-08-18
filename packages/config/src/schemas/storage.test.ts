import { describe, expect, it } from 'vitest';
import { storageEnvSchema } from './storage.js';

describe('storageEnvSchema', () => {
  it('is entirely optional (development-friendly)', () => {
    expect(storageEnvSchema.safeParse({}).success).toBe(true);
  });

  it('validates R2_ENDPOINT as a URL when present', () => {
    expect(storageEnvSchema.safeParse({ R2_ENDPOINT: 'not-a-url' }).success).toBe(false);
    expect(storageEnvSchema.safeParse({ R2_ENDPOINT: 'http://127.0.0.1:9000' }).success).toBe(true);
  });
});
