import { describe, expect, it } from 'vitest';
import { ACCEPTED_MEDIA_CONTENT_TYPES, isAcceptedMediaContentType } from './limits.js';

describe('media content-type allowlist (v0, spec §28)', () => {
  it('accepts exactly jpeg, png, webp', () => {
    expect(ACCEPTED_MEDIA_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('rejects gif and other formats not in the v0 allowlist', () => {
    for (const rejected of [
      'image/gif',
      'image/svg+xml',
      'image/tiff',
      'application/pdf',
      'video/mp4',
    ]) {
      expect(isAcceptedMediaContentType(rejected)).toBe(false);
    }
  });

  it('accepts every allowlisted type', () => {
    for (const accepted of ACCEPTED_MEDIA_CONTENT_TYPES) {
      expect(isAcceptedMediaContentType(accepted)).toBe(true);
    }
  });
});
