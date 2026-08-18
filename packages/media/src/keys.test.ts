import { describe, expect, it } from 'vitest';
import { isMediaObjectKey, mediaOriginalKey, mediaVariantKey } from './keys.js';

describe('object key layout', () => {
  it('places the original under media/<id>/original', () => {
    expect(mediaOriginalKey('abc-123')).toBe('media/abc-123/original');
  });

  it('places each variant under media/<id>/v/<variant>', () => {
    expect(mediaVariantKey('abc-123', 'display')).toBe('media/abc-123/v/display');
    expect(mediaVariantKey('abc-123', 'thumb')).toBe('media/abc-123/v/thumb');
  });

  it('recognizes every key belonging to a media id, and no others', () => {
    expect(isMediaObjectKey('media/abc-123/original', 'abc-123')).toBe(true);
    expect(isMediaObjectKey('media/abc-123/v/display', 'abc-123')).toBe(true);
    expect(isMediaObjectKey('media/abc-123/v/thumb', 'abc-123')).toBe(true);

    expect(isMediaObjectKey('media/other-id/original', 'abc-123')).toBe(false);
    // A prefix collision (`abc-1234` starts with `abc-123`) must not match.
    expect(isMediaObjectKey('media/abc-1234/original', 'abc-123')).toBe(false);
  });
});
