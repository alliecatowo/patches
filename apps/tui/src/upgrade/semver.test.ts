import { describe, expect, it } from 'vitest';

import { compareVersions, isNewerVersion, parseVersion } from './semver.js';

describe('parseVersion', () => {
  it('parses a plain dotted-triple version', () => {
    expect(parseVersion('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: [] });
  });

  it('parses a leading v and prerelease identifiers', () => {
    expect(parseVersion('v0.1.0-alpha.3')).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      prerelease: ['alpha', 3],
    });
  });

  it('discards build metadata', () => {
    expect(parseVersion('1.2.3+build.5')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
  });

  it('rejects a non-numeric leading-zero identifier as a string, not a number', () => {
    expect(parseVersion('1.0.0-01')?.prerelease).toEqual(['01']);
  });

  it('returns undefined for garbage', () => {
    expect(parseVersion('not-a-version')).toBeUndefined();
    expect(parseVersion('1.2')).toBeUndefined();
    expect(parseVersion('')).toBeUndefined();
  });
});

describe('compareVersions', () => {
  it('orders by major/minor/patch', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.2', '1.1.1')).toBeGreaterThan(0);
    expect(compareVersions('1.1.1', '1.1.1')).toBe(0);
  });

  it('ranks a prerelease below the same release version', () => {
    expect(compareVersions('0.1.0-alpha.3', '0.1.0')).toBeLessThan(0);
    expect(compareVersions('0.1.0', '0.1.0-alpha.3')).toBeGreaterThan(0);
  });

  it("orders alpha.2 before alpha.3 before the release, matching this repo's tags", () => {
    expect(compareVersions('0.1.0-alpha.2', '0.1.0-alpha.3')).toBeLessThan(0);
    expect(compareVersions('0.1.0-alpha.3', '0.1.0')).toBeLessThan(0);
    expect(compareVersions('0.1.0-alpha.2', '0.1.0')).toBeLessThan(0);
  });

  it('compares numeric prerelease identifiers numerically, not lexically', () => {
    expect(compareVersions('1.0.0-alpha.9', '1.0.0-alpha.10')).toBeLessThan(0);
  });

  it('ranks a numeric identifier below an alphanumeric one at the same position', () => {
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0);
  });

  it('a longer prerelease identifier set outranks a shorter equal prefix', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
  });

  it('throws on an unparseable input', () => {
    expect(() => compareVersions('nonsense', '1.0.0')).toThrow();
  });
});

describe('isNewerVersion', () => {
  it('is true when the candidate has greater precedence', () => {
    expect(isNewerVersion('0.1.0-alpha.2', '0.1.0-alpha.3')).toBe(true);
    expect(isNewerVersion('0.1.0-alpha.3', '0.1.0')).toBe(true);
  });

  it('is false for equal or older candidates', () => {
    expect(isNewerVersion('0.1.0-alpha.3', '0.1.0-alpha.3')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.1.0-alpha.3')).toBe(false);
  });
});
