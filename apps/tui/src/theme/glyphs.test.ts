import { describe, expect, it } from 'vitest';

import { GLYPH_NAMES, glyph, resolveGlyphSet } from './glyphs.js';

describe('glyph', () => {
  it('has all three sets for every meaning, and ascii never depends on a glyph the others do not have a word for', () => {
    for (const name of GLYPH_NAMES) {
      expect(glyph(name, 'unicode')).not.toBe('');
      expect(glyph(name, 'ascii')).not.toBe('');
    }
  });

  it('never requires Nerd Font — every meaning has a unicode fallback', () => {
    for (const name of GLYPH_NAMES) {
      expect(glyph(name, 'unicode').length).toBeGreaterThan(0);
    }
  });
});

describe('resolveGlyphSet', () => {
  it('gives PATCHES_GLYPHS the highest precedence', () => {
    expect(
      resolveGlyphSet({ envGlyphSet: 'ascii', preferredGlyphSet: 'nerd', locale: 'en_US.UTF-8' }),
    ).toBe('ascii');
  });

  it('falls back to the persisted preference when there is no env override', () => {
    expect(resolveGlyphSet({ preferredGlyphSet: 'nerd', locale: 'en_US.UTF-8' })).toBe('nerd');
  });

  it('auto-selects unicode on a UTF-8 locale with nothing configured', () => {
    expect(resolveGlyphSet({ locale: 'en_US.UTF-8' })).toBe('unicode');
    expect(resolveGlyphSet({})).toBe('unicode');
  });

  it('auto-selects ascii when the locale is not UTF-8 — never nerd, which is never auto-detected', () => {
    expect(resolveGlyphSet({ locale: 'C' })).toBe('ascii');
    expect(resolveGlyphSet({ locale: 'POSIX' })).toBe('ascii');
  });

  it('ignores a blank or unrecognized env value', () => {
    expect(resolveGlyphSet({ envGlyphSet: '', preferredGlyphSet: 'ascii' })).toBe('ascii');
    expect(resolveGlyphSet({ envGlyphSet: 'wingdings', preferredGlyphSet: 'ascii' })).toBe('ascii');
  });
});
