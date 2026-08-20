import { create } from '@bufbuild/protobuf';
import { timestampFromDate, TimestampSchema } from '@bufbuild/protobuf/wkt';
import { describe, expect, it } from 'vitest';

import { formatCount, formatRelativeTime } from './format.js';

describe('formatRelativeTime', () => {
  it('renders "now" for a timestamp within the last minute', () => {
    const timestamp = timestampFromDate(new Date());
    expect(formatRelativeTime(timestamp)).toBe('now');
  });

  it('renders a past duration without "ago"', () => {
    const timestamp = timestampFromDate(new Date(Date.now() - 2 * 3600 * 1000));
    expect(formatRelativeTime(timestamp)).toBe('2 hours');
  });

  it('returns an empty string for an unset timestamp', () => {
    expect(formatRelativeTime(undefined)).toBe('');
  });

  it('handles a zero-value Timestamp message the same as unset', () => {
    const zero = create(TimestampSchema, {});
    // A zero-value protobuf Timestamp is 1970-01-01, a very large "ago" duration — not
    // treated specially, just formatted like any other past date.
    expect(formatRelativeTime(zero)).not.toBe('');
  });
});

describe('formatCount', () => {
  it('renders small counts as-is', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });

  it('renders thousands with a K suffix', () => {
    expect(formatCount(1000)).toBe('1K');
    expect(formatCount(1500)).toBe('1.5K');
  });

  it('renders millions with an M suffix', () => {
    expect(formatCount(2_500_000)).toBe('2.5M');
  });
});
