import { describe, expect, it } from 'vitest';

import { compareSemver, parseSemver } from './version.js';

describe('parseSemver', () => {
  it('parses a plain triple', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('ignores pre-release and build metadata', () => {
    expect(parseSemver('0.1.0-rc.4')).toEqual({ major: 0, minor: 1, patch: 0 });
    expect(parseSemver('0.1.0+build.7')).toEqual({ major: 0, minor: 1, patch: 0 });
  });

  it('returns undefined for anything that is not a version', () => {
    for (const value of ['', 'v1.2.3', '1.2', '1.2.3.4', 'banana', '  ']) {
      expect(parseSemver(value)).toBeUndefined();
    }
  });
});

describe('compareSemver', () => {
  it('orders by major, then minor, then patch', () => {
    const cmp = (a: string, b: string): number => compareSemver(parseSemver(a)!, parseSemver(b)!);

    expect(cmp('1.0.0', '2.0.0')).toBe(-1);
    expect(cmp('1.9.9', '1.10.0')).toBe(-1);
    expect(cmp('1.2.3', '1.2.4')).toBe(-1);
    expect(cmp('1.2.3', '1.2.3')).toBe(0);
    expect(cmp('2.0.0', '1.99.99')).toBe(1);
  });
});
