import { describe, expect, it } from 'vitest';

import { cellWidth, fitHints, truncateToWidth, wrappedRowCount } from './measure.js';

describe('cellWidth', () => {
  it('counts terminal cells, not code units', () => {
    expect(cellWidth('hello')).toBe(5);
    // A wide emoji is two cells even though it is one grapheme; `String.length`
    // would say 2 for the surrogate pair and be right by accident, but ZWJ
    // sequences and CJK are where the naive count starts producing the off-by-one
    // that corrupts a frame.
    expect(cellWidth('か')).toBe(2);
    expect(cellWidth('👩‍💻')).toBe(2);
  });
});

describe('wrappedRowCount', () => {
  it('is 1 for a line that fits', () => {
    expect(wrappedRowCount('short', 20)).toBe(1);
  });

  it('counts the rows a wrapped paragraph really takes', () => {
    // 4 words of 5 cells each, width 11 → "aaaaa bbbbb" / "ccccc ddddd"
    expect(wrappedRowCount('aaaaa bbbbb ccccc ddddd', 11)).toBe(2);
  });

  it('breaks a word longer than the line', () => {
    expect(wrappedRowCount('a'.repeat(25), 10)).toBe(3);
  });

  it('counts hard newlines', () => {
    expect(wrappedRowCount('one\ntwo\nthree', 40)).toBe(3);
  });

  it('never under-counts wide characters', () => {
    // Ten double-width glyphs = 20 cells, so they need two rows at width 10.
    expect(wrappedRowCount('か'.repeat(10), 10)).toBe(2);
  });
});

describe('truncateToWidth', () => {
  it('leaves a string that fits alone', () => {
    expect(truncateToWidth('abc', 10)).toBe('abc');
  });

  it('clips and marks the cut', () => {
    expect(truncateToWidth('abcdefgh', 5)).toBe('abcd…');
    expect(cellWidth(truncateToWidth('abcdefgh', 5))).toBeLessThanOrEqual(5);
  });

  it('never exceeds the budget with wide glyphs', () => {
    expect(cellWidth(truncateToWidth('かかかかか', 5))).toBeLessThanOrEqual(5);
  });
});

describe('fitHints', () => {
  it('drops the lowest-priority hints rather than wrapping', () => {
    const hints = ['j next', 'Enter thread', 'c compose', '/ search', '? help', 'Esc back'];
    const line = fitHints(hints, 40);
    expect(cellWidth(line)).toBeLessThanOrEqual(40);
    expect(line.startsWith('j next · Enter thread')).toBe(true);
    // The "how do I get out of here" hint is pinned and survives the squeeze.
    expect(line).toContain('Esc back');
    expect(line).not.toContain('? help');
  });

  it('keeps everything when there is room', () => {
    expect(fitHints(['a b', 'c d'], 80)).toBe('a b · c d');
  });
});
