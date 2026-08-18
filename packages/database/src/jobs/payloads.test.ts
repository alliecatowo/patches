import { describe, expect, it } from 'vitest';
import { processMediaPayloadSchema } from './payloads.js';

describe('processMediaPayloadSchema', () => {
  it('accepts a mediaId with no expectedSha256', () => {
    const result = processMediaPayloadSchema.safeParse({ mediaId: 'm-1' });
    expect(result.success).toBe(true);
  });

  it('accepts a valid lowercase-hex expectedSha256', () => {
    const result = processMediaPayloadSchema.safeParse({
      mediaId: 'm-1',
      expectedSha256: '0'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an expectedSha256 that is not 64 lowercase hex characters', () => {
    expect(
      processMediaPayloadSchema.safeParse({ mediaId: 'm-1', expectedSha256: 'ABCD' }).success,
    ).toBe(false);
    expect(
      processMediaPayloadSchema.safeParse({
        mediaId: 'm-1',
        // uppercase — not accepted, matches only [0-9a-f]
        expectedSha256: 'A'.repeat(64),
      }).success,
    ).toBe(false);
  });
});
