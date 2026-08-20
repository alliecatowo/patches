import { describe, expect, it } from 'vitest';

import { fromDate, toDate } from './time.js';

describe('toDate', () => {
  it('accepts string seconds (ts-proto/proto-loader shape)', () => {
    expect(toDate({ seconds: '1735689600', nanos: 0 })).toEqual(
      new Date('2025-01-01T00:00:00.000Z'),
    );
  });

  it('accepts number seconds', () => {
    expect(toDate({ seconds: 1735689600, nanos: 0 })).toEqual(new Date('2025-01-01T00:00:00.000Z'));
  });

  it('accepts bigint seconds (protobuf-es shape)', () => {
    expect(toDate({ seconds: 1735689600n, nanos: 0 })).toEqual(
      new Date('2025-01-01T00:00:00.000Z'),
    );
  });

  it('folds nanos into the millisecond component for all three shapes', () => {
    expect(toDate({ seconds: '1735689600', nanos: 500_000_000 })).toEqual(
      new Date('2025-01-01T00:00:00.500Z'),
    );
    expect(toDate({ seconds: 1735689600, nanos: 500_000_000 })).toEqual(
      new Date('2025-01-01T00:00:00.500Z'),
    );
    expect(toDate({ seconds: 1735689600n, nanos: 500_000_000 })).toEqual(
      new Date('2025-01-01T00:00:00.500Z'),
    );
  });

  it('returns undefined for null - proto-loader (defaults: true) yields null, not undefined', () => {
    expect(toDate(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(toDate(undefined)).toBeUndefined();
  });

  it('returns undefined instead of a corrupted Date when seconds overflow what Date can represent', () => {
    // Date can represent roughly +-8.64e12 seconds from the epoch; anything far beyond that
    // must not silently become a plausible-looking wrong date.
    const farBeyondDateRange = BigInt(Number.MAX_SAFE_INTEGER) * 1_000_000n;
    expect(toDate({ seconds: farBeyondDateRange, nanos: 0 })).toBeUndefined();
  });

  it('returns undefined for a non-numeric seconds string', () => {
    expect(toDate({ seconds: 'not-a-number', nanos: 0 })).toBeUndefined();
  });

  it('round-trips a Date at the boundary of Date-representable seconds without precision loss', () => {
    // 8.64e12 seconds is within Date's representable range and well within
    // Number.MAX_SAFE_INTEGER (9.007e15), so bigint -> Number conversion is lossless here.
    const boundarySeconds = 8_640_000_000_000n;
    const date = toDate({ seconds: boundarySeconds, nanos: 0 });
    expect(date).toBeInstanceOf(Date);
    expect(date?.getTime()).toBe(Number(boundarySeconds) * 1000);
  });
});

describe('fromDate', () => {
  it('produces the ts-proto/proto-loader wire shape', () => {
    expect(fromDate(new Date('2025-01-01T00:00:00.500Z'))).toEqual({
      seconds: '1735689600',
      nanos: 500_000_000,
    });
  });

  it('round-trips through toDate', () => {
    const original = new Date('2026-03-14T09:26:53.589Z');
    expect(toDate(fromDate(original))).toEqual(original);
  });

  it('round-trips a date before the epoch', () => {
    const original = new Date('1969-12-31T23:59:00.000Z');
    expect(toDate(fromDate(original))).toEqual(original);
  });
});
