import { describe, expect, it } from 'vitest';

import { isWidthOneGlyph, parseActorFlairDocument, validateLikeGlyph } from './validation.js';

describe('actor flair validation', () => {
  it('accepts every supported field and preserves the page-theme shape', () => {
    expect(
      parseActorFlairDocument(
        JSON.stringify({
          post_accent: '#ff8800',
          border_style: 'round',
          like_glyph: '+',
          wall_theme: { accent: '#ff8800', border: 'double', avatarStyle: 'square' },
        }),
        ['+'],
      ),
    ).toEqual({
      post_accent: '#ff8800',
      border_style: 'round',
      like_glyph: '+',
      wall_theme: { accent: '#ff8800', border: 'double', avatarStyle: 'square' },
    });
  });

  it('enforces the 1 KiB serialized budget', () => {
    expect(() => parseActorFlairDocument(' '.repeat(1025), [])).toThrow(/1024 bytes/);
  });

  it.each(['triple', 'shadow', 'image'])('rejects unsupported border style %s', (style) => {
    expect(() => parseActorFlairDocument(JSON.stringify({ border_style: style }), [])).toThrow();
  });

  it('rejects unknown upload/image fields', () => {
    expect(() =>
      parseActorFlairDocument(JSON.stringify({ image_url: 'https://example.test/flair.png' }), []),
    ).toThrow();
  });

  it('rejects accents below the contrast floor', () => {
    expect(() => parseActorFlairDocument(JSON.stringify({ post_accent: '#111111' }), [])).toThrow(
      /contrast/,
    );
  });

  it('strips terminal controls, bidi overrides, and zero-width text from wall themes', () => {
    expect(
      parseActorFlairDocument(
        JSON.stringify({
          wall_theme: {
            accent: '\u001b[31mred\u001b[0m',
            background: 'left\u202Eright',
            avatarStyle: 'a\u200db',
          },
        }),
        [],
      ),
    ).toEqual({
      wall_theme: { accent: 'red', background: 'leftright', avatarStyle: 'ab' },
    });
  });

  it.each(['🩹', '界', '\u0301', '\u200d', '\u001b'])('rejects non-width-1 glyph %j', (glyph) => {
    expect(isWidthOneGlyph(glyph)).toBe(false);
    expect(() => validateLikeGlyph(glyph, [glyph])).toThrow(/width-1/);
  });

  it('rejects a safe glyph that is not in the node allow-list', () => {
    expect(isWidthOneGlyph('+')).toBe(true);
    expect(() => validateLikeGlyph('+', ['*'])).toThrow(/allow-list/);
  });
});
