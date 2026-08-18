import { describe, expect, it } from 'vitest';

import { MAX_PLACEHOLDER_INDEX, ROW_COLUMN_DIACRITICS, diacritic } from './diacritics.js';

/**
 * The first 40 entries as transcribed in `docs/research/ink-kitty-graphics.md` §2.
 * If this ever fails, the table was reordered and every placement on screen is wrong.
 */
const RESEARCH_DOC_FIRST_40 = [
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346, 0x034a, 0x034b, 0x034c,
  0x0350, 0x0351, 0x0352, 0x0357, 0x035b, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369,
  0x036a, 0x036b, 0x036c, 0x036d, 0x036e, 0x036f, 0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592,
  0x0593, 0x0594, 0x0595, 0x0597,
];

describe('ROW_COLUMN_DIACRITICS', () => {
  it('has the 297 entries kitty ships', () => {
    expect(ROW_COLUMN_DIACRITICS).toHaveLength(297);
    expect(MAX_PLACEHOLDER_INDEX).toBe(296);
  });

  it('matches the first 40 entries recorded in the research doc', () => {
    expect(ROW_COLUMN_DIACRITICS.slice(0, 40)).toEqual(RESEARCH_DOC_FIRST_40);
  });

  it('ends on U+1D244, the last entry of gen/rowcolumn-diacritics.txt', () => {
    expect(ROW_COLUMN_DIACRITICS.at(-1)).toBe(0x1d244);
  });

  it('contains no duplicates and no NFC-composing marks', () => {
    expect(new Set(ROW_COLUMN_DIACRITICS).size).toBe(ROW_COLUMN_DIACRITICS.length);
    // 0x0301 (combining acute) composes with a base char, so kitty excludes it.
    expect(ROW_COLUMN_DIACRITICS).not.toContain(0x0301);
  });
});

describe('diacritic', () => {
  it('returns the canonical 2x2 example marks from the protocol spec', () => {
    expect(diacritic(0)).toBe(String.fromCodePoint(0x0305)); // COMBINING OVERLINE
    expect(diacritic(1)).toBe(String.fromCodePoint(0x030d)); // COMBINING VERTICAL LINE ABOVE
    expect(diacritic(2)).toBe(String.fromCodePoint(0x030e));
  });

  it('returns a single codepoint of zero display width', () => {
    expect([...diacritic(296)]).toHaveLength(1);
  });

  it('throws for coordinates outside the table', () => {
    expect(() => diacritic(297)).toThrow(RangeError);
    expect(() => diacritic(-1)).toThrow(RangeError);
  });
});
