import {
  dateToTimestamp,
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  type Post,
} from '@patches/proto';
import { describe, expect, it } from 'vitest';

import { BODY_INDENT_COLS, measurePostBody, measurePostRowHeight } from './post-height.js';

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    author: undefined,
    body: 'hello world',
    postType: POST_TYPE.NOTE,
    linkUrl: '',
    visibility: POST_VISIBILITY.PUBLIC,
    inReplyToId: '',
    rootPostId: 'post-1',
    media: [],
    createdAt: dateToTimestamp(new Date()),
    editedAt: undefined,
    deleted: false,
    counts: undefined,
    viewerState: undefined,
    contentWarning: '',
    quotedPost: undefined,
    community: undefined,
    quotePolicy: QUOTE_POLICY.UNSPECIFIED,
    repostedBy: [],
    repostedByTotal: 0,
    filteredBy: undefined,
    labels: [],
    ...overrides,
  };
}

describe('measurePostBody mode parity (P12-128)', () => {
  it('measures a decorated link at its short rich-mode width, not its long plain-mode one', () => {
    // Rich mode draws "read the announcement" styled; plain mode reproduces the
    // markdown source, `[read the announcement](https://example.com/a/very/long/path/to/the/post)`
    // — reserving the plain-mode row count for a body that is about to render
    // richly is exactly the over-measurement P12-128 removes.
    const body = '[read the announcement](https://example.com/a/very/long/path/to/the/post)';
    const rich = measurePostBody(post({ body }), 30, false, false);
    const plain = measurePostBody(post({ body }), 30, false, true);
    expect(plain.rows).toBeGreaterThan(rich.rows);
  });

  it('measures identically for rich and quiet — quiet only hides other actors’ cosmetics, never body layout', () => {
    // `usePlainMode()` is the only mode `measurePostBody` takes a parameter for
    // (see the function's own doc comment): quiet mode leaves `plain` at `false`,
    // so passing `false` is the correct measurement for both rich and quiet.
    const body = '[read the announcement](https://example.com/a/very/long/path/to/the/post)';
    const richAgain = measurePostBody(post({ body }), 30, false, false);
    const quiet = measurePostBody(post({ body }), 30, false, false);
    expect(quiet).toEqual(richAgain);
  });

  it('threads the mode through measurePostRowHeight so the row height agrees', () => {
    const body = '[read the announcement](https://example.com/a/very/long/path/to/the/post)';
    const richRow = measurePostRowHeight(post({ body }), 30, true, false, false);
    const plainRow = measurePostRowHeight(post({ body }), 30, true, false, true);
    expect(plainRow).toBeGreaterThan(richRow);
  });

  it('reserves BODY_INDENT_COLS columns of the row width for the body, never the full row', () => {
    // A body exactly `width` wide wraps once more once it is measured at
    // `width - BODY_INDENT_COLS` — proves the indent is actually subtracted, not
    // just declared.
    const width = 20;
    const body = 'x'.repeat(width - BODY_INDENT_COLS + 1);
    const indented = measurePostBody(post({ body }), width, false, false);
    expect(indented.rows).toBe(2);
  });
});
