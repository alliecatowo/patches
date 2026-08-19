import { FilterAction } from '@patches/proto/es';
import { describe, expect, it } from 'vitest';

import { humanizeEnumValue } from './enumLabels.js';

describe('humanizeEnumValue', () => {
  it('title-cases a single-word protobuf-es enum member', () => {
    expect(humanizeEnumValue(FilterAction.HIDE, FilterAction)).toBe('Hide');
  });

  it('title-cases each word of a multi-word member', () => {
    // No multi-word FilterAction member exists; simulate one with a plain enum-shaped object.
    const Fake = { 0: 'FOO_BAR', FOO_BAR: 0 };
    expect(humanizeEnumValue(0, Fake)).toBe('Foo Bar');
  });

  it('returns Unknown for an out-of-range value', () => {
    expect(humanizeEnumValue(999, FilterAction)).toBe('Unknown');
  });
});
