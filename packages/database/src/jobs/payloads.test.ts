import { describe, expect, it } from 'vitest';
import {
  exportAccountPayloadSchema,
  processMediaPayloadSchema,
  purgeAccountPayloadSchema,
} from './payloads.js';

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

describe('exportAccountPayloadSchema', () => {
  const exportId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';

  it('accepts a valid exportId/actorId pair', () => {
    expect(exportAccountPayloadSchema.safeParse({ exportId, actorId }).success).toBe(true);
  });

  it('rejects a non-uuid exportId or actorId', () => {
    expect(exportAccountPayloadSchema.safeParse({ exportId: 'not-a-uuid', actorId }).success).toBe(
      false,
    );
    expect(exportAccountPayloadSchema.safeParse({ exportId, actorId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});

describe('purgeAccountPayloadSchema', () => {
  it('accepts a valid actorId', () => {
    expect(
      purgeAccountPayloadSchema.safeParse({ actorId: '22222222-2222-4222-8222-222222222222' })
        .success,
    ).toBe(true);
  });

  it('rejects a non-uuid actorId', () => {
    expect(purgeAccountPayloadSchema.safeParse({ actorId: 'nope' }).success).toBe(false);
  });
});
