import { describe, expect, it } from 'vitest';

import { extractTagCandidates, parseTags } from './tag-grammar.js';

describe('tag-grammar (spec §181, §192)', () => {
  it('extracts a simple hashtag', () => {
    expect(parseTags('hello #world')).toEqual(['world']);
  });

  it('normalization is the identity: two spellings collapse to one tag', () => {
    // NFKC composition: "e" + combining acute accent (U+0301) canonically composes to "é".
    const precomposed = parseTags('#café');
    const decomposed = parseTags('#café');
    expect(precomposed).toEqual(['café']);
    expect(decomposed).toEqual(['café']);
  });

  it('casing collapses to the same canonical tag', () => {
    expect(parseTags('#TypeScript #typescript')).toEqual(['typescript']);
  });

  it('an all-digit token is a year, not a tag', () => {
    expect(parseTags('see you in #2026')).toEqual([]);
  });

  it('rejects a tag with no letters even mixed with underscores', () => {
    expect(parseTags('#123_456')).toEqual([]);
  });

  it('rejects a whole candidate containing a control character', () => {
    const withControl = `#foo\x00bar`;
    expect(parseTags(withControl)).toEqual([]);
  });

  it('rejects a whole candidate containing a bidirectional override', () => {
    const withBidi = `#foo\u202Ebar`;
    expect(parseTags(withBidi)).toEqual([]);
  });

  it('rejects a whole candidate containing a zero-width character', () => {
    const withZeroWidth = `#foo\u200Bbar`;
    expect(parseTags(withZeroWidth)).toEqual([]);
  });

  it('treats ordinary line and tab whitespace as delimiters', () => {
    expect(parseTags('#alpha\n#beta\t#gamma')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('a combining-mark pileup (zalgo text) is rejected outright', () => {
    // Many combining marks stacked on one base character have no precomposed form, so after
    // NFKC they remain bare `\p{M}` code points — outside the `\p{L}\p{N}_` grammar.
    const zalgo = `#ź̂̃̄̅̆̇̈algo`;
    expect(parseTags(zalgo)).toEqual([]);
  });

  it('does not extract a hashtag glued to a preceding word (URL/code fragment)', () => {
    expect(parseTags('see foo#bar here')).toEqual([]);
  });

  it('dedupes and preserves first-appearance order', () => {
    expect(parseTags('#alpha #beta #alpha')).toEqual(['alpha', 'beta']);
  });

  it('throws INVALID_ARGUMENT-mapped VALIDATION_ERROR for an 11th tag', () => {
    const body = Array.from({ length: 11 }, (_, index) => `#tag${String(index)}`).join(' ');
    expect(() => parseTags(body)).toThrow('at most 10 tags');
  });

  it('allows exactly 10 tags', () => {
    const body = Array.from({ length: 10 }, (_, index) => `#tag${String(index)}`).join(' ');
    expect(parseTags(body)).toHaveLength(10);
  });

  it('extractTagCandidates keeps the original display casing', () => {
    const [candidate] = extractTagCandidates('#TypeScript');
    expect(candidate).toEqual({ name: 'typescript', displayName: 'TypeScript' });
  });

  it('counts Unicode code points rather than UTF-16 code units for the 30-character cap', () => {
    const astralLetter = '\u{10400}';
    expect(parseTags(`#${astralLetter.repeat(30)}`)).toHaveLength(1);
    expect(parseTags(`#${astralLetter.repeat(31)}`)).toEqual([]);
  });
});
