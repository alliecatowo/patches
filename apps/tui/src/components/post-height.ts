import { FILTER_ACTION, type Post } from '@patches/proto';

import { present } from '../api/present.js';
import { describeFilteredBy } from '../format/filtered-by.js';
import { measureMarkupHeight } from '../format/markup.js';

/** Rows the spec §75 fallback box occupies (`buildFallbackBox` returns three lines),
 * plus the `marginTop={1}` the attachment block carries. */
const MEDIA_BOX_ROWS = 3;
export const COLLAPSED_BODY_ROWS = 8;

/** Columns the body is indented under the flush-left header/attribution/quote lines
 * — the row's own rhythm (P12-104), not the thread-reply indent `VirtualList`
 * applies via `indentOf`. Kept as one exported constant so `PostRow`'s JSX and this
 * measurement agree on exactly how many columns the body actually gets. */
export const BODY_INDENT_COLS = 2;

export interface PostBodyMeasurement {
  rows: number;
  folded: boolean;
}

/**
 * Body-only row budget shared by render and viewport measurement, computed from the
 * shared markup grammar so it counts exactly the lines `RichBody` will draw.
 *
 * `plain` must be the *viewer's actual* mode (P12-128) — rich and quiet both wrap
 * through `layoutMarkup`'s non-plain branch and always measure identically to what
 * `RichBody` draws (quiet only hides other actors' nameplate cosmetics, never the
 * body's own layout), while plain mode reproduces the source markers (`**bold**`,
 * `[text](href)`), which wrap differently. Measuring rich content as if it were
 * plain reserved rows a decorated body was never going to draw; measuring plain
 * content as rich would under-count and overflow the frame — either way the caller
 * must pass the mode it is actually about to render.
 */
export function measurePostBody(
  post: Post,
  width: number,
  expanded: boolean,
  plain: boolean,
): PostBodyMeasurement {
  const body = post.body === '' ? post.linkUrl : post.body;
  const bodyWidth = Math.max(1, width - BODY_INDENT_COLS);
  const fullRows = measureMarkupHeight(body, bodyWidth, { plain });
  if (expanded || fullRows <= COLLAPSED_BODY_ROWS) return { rows: fullRows, folded: false };
  return { rows: COLLAPSED_BODY_ROWS, folded: true };
}

/**
 * Exactly how many terminal rows `PostRow` will occupy at `width` columns.
 *
 * This has to agree with `PostRow`'s JSX line for line: the viewport decides what to
 * render from these numbers, and an under-count is what lets a frame grow taller than
 * the terminal and smear Ink's line diff (see `format/measure.ts`).
 *
 * Layout being measured:
 *   1  author · relative time      (hard-clipped, never wraps — label chips share this row)
 *   1  filtered-by provenance     (collapsed-and-folded, or warn — see below)
 *   n  body                        (wraps)
 *   1  content warning             (when present)
 *   1+ media fallback box          (marginTop + three box rows per attachment)
 *   1  counts                      (hard-clipped, when counts are present)
 *   1  marginBottom
 */
export function measurePostRowHeight(
  post: Post,
  width: number,
  revealed: boolean,
  expanded = false,
  plain = false,
): number {
  const usable = Math.max(1, width);
  let height = 1; // header (label chips draw inline here, no extra row)
  if (post.repostedBy.length > 0) height += 1;
  const hasWarning = !post.deleted && post.contentWarning !== '';
  // §198.3/§199.3: `hide` never reaches the client. `collapse` folds the body behind
  // one muted line until `v` expands it (the row's existing fold-toggle); `warn`
  // always shows the provenance line above the untouched body — mirrors `PostRow`.
  const filteredByLine = describeFilteredBy(post.filteredBy);
  const filterAction = present(post.filteredBy) ? post.filteredBy.action : undefined;
  const isFilterCollapsed = filteredByLine !== undefined && filterAction === FILTER_ACTION.COLLAPSE;
  const isFilterWarned = filteredByLine !== undefined && filterAction === FILTER_ACTION.WARN;
  const showProvenanceLine = filteredByLine !== undefined && (isFilterWarned || isFilterCollapsed);

  if (post.deleted) {
    height += 1;
  } else if (isFilterCollapsed && !expanded) {
    height += 1; // "filtered: <name> … — press v to expand"
  } else if (hasWarning && !revealed) {
    height += 1; // "⚠ … — press v to reveal"
  } else {
    if (showProvenanceLine) height += 1;
    if (hasWarning) height += 1;
    const body = measurePostBody(post, usable, expanded, plain);
    height += body.rows + (body.folded ? 1 : 0);
    if (post.media.length > 0) height += 1 + MEDIA_BOX_ROWS * post.media.length;
    if (present(post.quotedPost)) height += 4; // marginTop + fixed three-row quote preview
  }

  if (present(post.counts)) height += 1;
  height += 1; // marginBottom
  return height;
}
