import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import { parseInput, SEARCH_QUERY_MAX_LENGTH, searchPostsInputSchema } from './validation.js';

/**
 * `SearchPosts` (spec §194) input validation — the part of `PostService.searchPosts` that is
 * cheap to unit test on its own, independent of the Postgres full-text query itself (covered
 * by `test/posts.integration.test.ts`'s `SearchPosts` suite).
 */
describe('searchPostsInputSchema (§194)', () => {
  it('trims and accepts a normal query with no author filter', () => {
    const parsed = parseInput(searchPostsInputSchema, { query: '  hello world  ' });
    expect(parsed.query).toBe('hello world');
    expect(parsed.authorHandle).toBeUndefined();
  });

  it.each(['', '   ', '\t\n'])('rejects an empty/whitespace-only query %j', (query) => {
    expect(() => parseInput(searchPostsInputSchema, { query })).toThrow(AppError);
  });

  it(`accepts a query at exactly ${String(SEARCH_QUERY_MAX_LENGTH)} characters`, () => {
    const query = 'x'.repeat(SEARCH_QUERY_MAX_LENGTH);
    expect(parseInput(searchPostsInputSchema, { query }).query).toBe(query);
  });

  it(`rejects a query over ${String(SEARCH_QUERY_MAX_LENGTH)} characters`, () => {
    const query = 'x'.repeat(SEARCH_QUERY_MAX_LENGTH + 1);
    expect(() => parseInput(searchPostsInputSchema, { query })).toThrow(AppError);
  });

  it('accepts a well-formed author_handle', () => {
    const parsed = parseInput(searchPostsInputSchema, {
      query: 'hello',
      authorHandle: 'techno_rat',
    });
    expect(parsed.authorHandle).toBe('techno_rat');
  });

  it.each(['ab', 'a'.repeat(31), 'has space', 'dash-not-allowed'])(
    'rejects a malformed author_handle %j',
    (authorHandle) => {
      expect(() => parseInput(searchPostsInputSchema, { query: 'hello', authorHandle })).toThrow(
        AppError,
      );
    },
  );
});
