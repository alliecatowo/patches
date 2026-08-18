import { describe, expect, it } from 'vitest';
import { storageEnvSchema } from './storage.js';

describe('storageEnvSchema', () => {
  it('is entirely optional for R2 credentials (development-friendly)', () => {
    const result = storageEnvSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates R2_ENDPOINT as a URL when present', () => {
    expect(storageEnvSchema.safeParse({ R2_ENDPOINT: 'not-a-url' }).success).toBe(false);
    expect(storageEnvSchema.safeParse({ R2_ENDPOINT: 'http://127.0.0.1:9000' }).success).toBe(true);
  });

  it('defaults media limits per spec §28', () => {
    const result = storageEnvSchema.parse({});
    expect(result.MEDIA_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(result.MEDIA_MAX_PIXELS).toBe(20_000_000);
    expect(result.R2_REGION).toBe('auto');
    expect(result.R2_FORCE_PATH_STYLE).toBe(true);
  });

  it('coerces MEDIA_* numeric env vars from strings', () => {
    const result = storageEnvSchema.parse({
      MEDIA_MAX_BYTES: '5242880',
      MEDIA_PRESIGN_PUT_TTL_SECONDS: '120',
    });
    expect(result.MEDIA_MAX_BYTES).toBe(5242880);
    expect(result.MEDIA_PRESIGN_PUT_TTL_SECONDS).toBe(120);
  });

  it('accepts booleanish string forms for R2_FORCE_PATH_STYLE', () => {
    expect(storageEnvSchema.parse({ R2_FORCE_PATH_STYLE: 'false' }).R2_FORCE_PATH_STYLE).toBe(
      false,
    );
    expect(storageEnvSchema.parse({ R2_FORCE_PATH_STYLE: '0' }).R2_FORCE_PATH_STYLE).toBe(false);
  });
});
