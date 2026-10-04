import { describe, expect, it } from 'vitest';

import { formatRemaining } from './DemoBanner.js';

describe('formatRemaining', () => {
  it('rounds up to whole minutes', () => {
    expect(formatRemaining(60 * 60_000)).toBe('60 minutes');
    expect(formatRemaining(57 * 60_000 - 1)).toBe('57 minutes');
    expect(formatRemaining(2 * 60_000 - 5_000)).toBe('2 minutes');
  });

  it('never says "1 minutes" and never goes negative', () => {
    expect(formatRemaining(60_000)).toBe('under a minute');
    expect(formatRemaining(1_000)).toBe('under a minute');
    expect(formatRemaining(-5_000)).toBe('under a minute');
  });
});
