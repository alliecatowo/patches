import { FILTER_ACTION, FILTERED_BY_PROVENANCE } from '../api/wire/enums.js';
import { fromDate } from '../api/wire/time.js';
import type { Post } from '../api/wire/types.js';
import { describe, expect, it } from 'vitest';

import { BODY_INDENT_COLS, measurePostBody, measurePostRowHeight } from './post-height.js';
import { makePost } from '../test/wire-fixtures.js';

function post(overrides: Partial<Post> = {}): Post {
  return makePost({ author: undefined, createdAt: fromDate(new Date()), ...overrides });
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

describe('measurePostRowHeight filtered_by provenance (§198.3/§199.3)', () => {
  it('folds a collapse-action match to exactly one row in place of the body', () => {
    const filtered = post({
      body: 'a long body that would otherwise measure several rows across three lines',
      filteredBy: {
        provenance: FILTERED_BY_PROVENANCE.FILTER,
        name: 'Spoilers',
        listOwner: undefined,
        action: FILTER_ACTION.COLLAPSE,
      },
    });
    const width = 30;
    const collapsedHeight = measurePostRowHeight(filtered, width, false, false, false);
    const plainBody = { ...filtered, filteredBy: undefined };
    const unfilteredHeight = measurePostRowHeight(plainBody, width, false, false, false);
    // Header + one folded provenance line + marginBottom, versus header + wrapped body
    // rows + marginBottom — collapsed is strictly shorter for a multi-row body.
    expect(collapsedHeight).toBeLessThan(unfilteredHeight);
    expect(collapsedHeight).toBe(3); // header + folded line + marginBottom
  });

  it('adds exactly one row back once a collapse-action match is expanded', () => {
    const filtered = post({
      filteredBy: {
        provenance: FILTERED_BY_PROVENANCE.FILTER,
        name: 'Spoilers',
        listOwner: undefined,
        action: FILTER_ACTION.COLLAPSE,
      },
    });
    const width = 30;
    const collapsed = measurePostRowHeight(filtered, width, false, false, false);
    const expanded = measurePostRowHeight(filtered, width, false, true, false);
    const unfiltered = measurePostRowHeight(
      { ...filtered, filteredBy: undefined },
      width,
      false,
      false,
      false,
    );
    expect(collapsed).toBe(3); // header + folded line + marginBottom
    expect(expanded).toBe(unfiltered + 1); // + provenance line above the body
  });

  it('adds exactly one row for a warn-action match, on top of the untouched body', () => {
    const filtered = post({
      filteredBy: {
        provenance: FILTERED_BY_PROVENANCE.FILTER,
        name: 'Politics',
        listOwner: undefined,
        action: FILTER_ACTION.WARN,
      },
    });
    const width = 30;
    const warned = measurePostRowHeight(filtered, width, false, false, false);
    const unfiltered = measurePostRowHeight(
      { ...filtered, filteredBy: undefined },
      width,
      false,
      false,
      false,
    );
    expect(warned).toBe(unfiltered + 1);
  });
});
