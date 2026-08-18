import { describe, expect, it } from 'vitest';

import { sanitizeForTerminal } from './sanitize.js';

describe('sanitizeForTerminal', () => {
  it('leaves ordinary text untouched', () => {
    expect(sanitizeForTerminal('Finally finished the synth rack.')).toBe(
      'Finally finished the synth rack.',
    );
  });

  it('keeps newlines for multi-line bodies', () => {
    expect(sanitizeForTerminal('line one\nline two')).toBe('line one\nline two');
  });

  it('turns tabs into a single space', () => {
    expect(sanitizeForTerminal('a\tb')).toBe('a b');
  });

  it('strips a raw escape sequence rather than passing it through', () => {
    // A cursor-move / alternate-screen-toggle attempt smuggled in a bio/handle/body —
    // written with explicit \x escapes so no literal control byte lives in this file.
    const withEscapes = `\x1b[2J\x1b[Hhijacked`;
    expect(sanitizeForTerminal(withEscapes)).toBe('[2J[Hhijacked');
  });

  it('strips C0 and C1 control characters, including DEL', () => {
    const withControls = `a\x01\x07b\x7f\x9fc`;
    expect(sanitizeForTerminal(withControls)).toBe('abc');
  });

  it('is a no-op on emoji and other multi-byte code points', () => {
    expect(sanitizeForTerminal('hello 👋 world')).toBe('hello 👋 world');
  });
});
