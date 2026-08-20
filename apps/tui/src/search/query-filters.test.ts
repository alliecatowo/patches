import type { Post } from '../api/wire/types.js';
import { fromDate } from '../api/wire/time.js';
import { describe, expect, it } from 'vitest';

import { filterPostsLocally, hasLocalOnlyFilter, parseSearchQuery } from './query-filters.js';

function post(id: string, body: string, createdAt: Date): Post {
  return {
    id,
    author: undefined,
    body,
    postType: 0,
    linkUrl: '',
    visibility: 0,
    inReplyToId: '',
    rootPostId: id,
    media: [],
    createdAt: fromDate(createdAt),
    editedAt: undefined,
    deleted: false,
    counts: undefined,
    viewerState: undefined,
    contentWarning: '',
    quotedPost: undefined,
  } as unknown as Post;
}

describe('parseSearchQuery', () => {
  it('extracts since:, from:, and #tag, leaving the free text behind', () => {
    const parsed = parseSearchQuery('rust since:2026-01-15 from:@alice #patches release');
    expect(parsed.text).toBe('rust release');
    expect(parsed.sinceRaw).toBe('2026-01-15');
    expect(parsed.since).toEqual(new Date(Date.UTC(2026, 0, 15)));
    expect(parsed.fromHandle).toBe('alice');
    expect(parsed.tag).toBe('patches');
  });

  it('accepts from: without the @ sigil', () => {
    expect(parseSearchQuery('from:bob').fromHandle).toBe('bob');
  });

  it('rejects an impossible calendar date rather than silently rolling it forward', () => {
    const parsed = parseSearchQuery('since:2026-02-30');
    expect(parsed.since).toBeUndefined();
    expect(parsed.sinceRaw).toBe('2026-02-30');
  });

  it('never treats an all-digits token as a tag', () => {
    expect(parseSearchQuery('#2026 news').tag).toBeUndefined();
    expect(parseSearchQuery('#2026 news').text).toBe('#2026 news');
  });

  it('leaves plain free text untouched when no tokens are present', () => {
    const parsed = parseSearchQuery('just a plain query');
    expect(parsed.text).toBe('just a plain query');
    expect(parsed.since).toBeUndefined();
    expect(parsed.fromHandle).toBeUndefined();
    expect(parsed.tag).toBeUndefined();
  });
});

describe('hasLocalOnlyFilter', () => {
  it('is true only when since or tag is present — from: alone reaches the server', () => {
    expect(hasLocalOnlyFilter(parseSearchQuery('from:@alice'))).toBe(false);
    expect(hasLocalOnlyFilter(parseSearchQuery('since:2026-01-01'))).toBe(true);
    expect(hasLocalOnlyFilter(parseSearchQuery('#patches'))).toBe(true);
  });
});

describe('filterPostsLocally', () => {
  it('keeps only posts at or after since', () => {
    const early = post('1', 'old', new Date(Date.UTC(2025, 0, 1)));
    const late = post('2', 'new', new Date(Date.UTC(2026, 5, 1)));
    const parsed = parseSearchQuery('since:2026-01-01');
    expect(filterPostsLocally([early, late], parsed).map((p) => p.id)).toEqual(['2']);
  });

  it('keeps only posts whose body carries the tag', () => {
    const tagged = post('1', 'loving #patches', new Date());
    const untagged = post('2', 'no tag here', new Date());
    const parsed = parseSearchQuery('#patches');
    expect(filterPostsLocally([tagged, untagged], parsed).map((p) => p.id)).toEqual(['1']);
  });

  it('is a no-op when neither since nor tag is present', () => {
    const a = post('1', 'a', new Date());
    const b = post('2', 'b', new Date());
    expect(filterPostsLocally([a, b], parseSearchQuery('from:@alice'))).toHaveLength(2);
  });
});
