import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './relative-time.js';

const NOW = new Date('2026-08-17T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('says "just now" for anything under a minute', () => {
    expect(formatRelativeTime(new Date('2026-08-17T11:59:31.000Z'), NOW)).toBe('just now');
  });

  it('pluralizes correctly across units', () => {
    expect(formatRelativeTime(new Date('2026-08-17T11:58:00.000Z'), NOW)).toBe('2 minutes ago');
    expect(formatRelativeTime(new Date('2026-08-17T11:59:00.000Z'), NOW)).toBe('1 minute ago');
    expect(formatRelativeTime(new Date('2026-08-17T01:00:00.000Z'), NOW)).toBe('11 hours ago');
    expect(formatRelativeTime(new Date('2026-08-10T12:00:00.000Z'), NOW)).toBe('1 week ago');
  });
});
