import { describe, expect, it } from 'vitest';

import { parseSearchQuery } from './searchQuery.js';

describe('parseSearchQuery', () => {
  it('extracts from: into authorHandle and strips it from the free text', () => {
    const result = parseSearchQuery('hello from:allie world');
    expect(result.authorHandle).toBe('allie');
    expect(result.text).toBe('hello world');
  });

  it('strips a leading @ from from:', () => {
    expect(parseSearchQuery('from:@allie').authorHandle).toBe('allie');
  });

  it('extracts since: into a millisecond timestamp', () => {
    const result = parseSearchQuery('since:2026-01-01 patches');
    expect(result.sinceMs).toBe(Date.parse('2026-01-01'));
    expect(result.text).toBe('patches');
  });

  it('ignores an unparseable since: value', () => {
    const result = parseSearchQuery('since:not-a-date patches');
    expect(result.sinceMs).toBeUndefined();
    expect(result.text).toBe('patches');
  });

  it('leaves #tag tokens in the free text', () => {
    const result = parseSearchQuery('#patches from:allie');
    expect(result.text).toBe('#patches');
    expect(result.authorHandle).toBe('allie');
  });

  it('returns no filters for plain text', () => {
    const result = parseSearchQuery('just some words');
    expect(result).toEqual({ text: 'just some words', authorHandle: '', sinceMs: undefined });
  });
});
