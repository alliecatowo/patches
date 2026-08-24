import { describe, expect, it } from 'vitest';

import { shakeMagnitudeForTest } from './useShakeToReport.js';

describe('shake threshold math', () => {
  it('classifies gravity-only readings as calm', () => {
    expect(shakeMagnitudeForTest({ x: 0, y: 0, z: 9.81 })).toBeLessThan(18);
  });
  it('classifies a hard shake as above threshold', () => {
    expect(shakeMagnitudeForTest({ x: 15, y: 4, z: 12 })).toBeGreaterThan(18);
  });
});
