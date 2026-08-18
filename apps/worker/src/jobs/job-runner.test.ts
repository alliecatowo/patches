import { describe, expect, it } from 'vitest';

import { nextIdleDelayMs } from './job-runner.js';

describe('nextIdleDelayMs', () => {
  it('doubles the current delay', () => {
    expect(nextIdleDelayMs(1000, 10_000)).toBe(2000);
    expect(nextIdleDelayMs(2000, 10_000)).toBe(4000);
  });

  it('caps at the max delay', () => {
    expect(nextIdleDelayMs(8000, 10_000)).toBe(10_000);
    expect(nextIdleDelayMs(20_000, 10_000)).toBe(10_000);
  });

  it('handles a zero max (always caps at zero)', () => {
    expect(nextIdleDelayMs(1000, 0)).toBe(0);
  });
});
