import type { Post } from '@patches/proto';

import { present } from '../api/present.js';
import { measureMarkupHeight } from '../format/markup.js';

/** Rows the spec §75 fallback box occupies (`buildFallbackBox` returns three lines),
 * plus the `marginTop={1}` the attachment block carries. */
const MEDIA_BOX_ROWS = 3;
export const COLLAPSED_BODY_ROWS = 8;

export interface PostBodyMeasurement {
  rows: number;
  folded: boolean;
}

/**
 * Body-only row budget shared by render and viewport measurement, computed from the
 * shared markup grammar so it counts exactly the lines `RichBody` will draw.
 *
 * Measured in *plain* mode deliberately: plain reproduces the source markers
 * (`**bold**`, `[text](href)`), which can only ever be wider than the decorated form,
 * so this is an upper bound for both modes. Over-measuring costs at most a blank row;
 * under-measuring is what overflows the frame and smears Ink's line diff.
 */
export function measurePostBody(post: Post, width: number, expanded: boolean): PostBodyMeasurement {
  const body = post.body === '' ? post.linkUrl : post.body;
  const fullRows = measureMarkupHeight(body, Math.max(1, width), { plain: true });
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
 *   1  author · relative time      (hard-clipped, never wraps)
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
): number {
  const usable = Math.max(1, width);
  let height = 1; // header
  if (post.repostedBy.length > 0) height += 1;
  const hasWarning = !post.deleted && post.contentWarning !== '';

  if (post.deleted) {
    height += 1;
  } else if (hasWarning && !revealed) {
    height += 1; // "⚠ … — press v to reveal"
  } else {
    if (hasWarning) height += 1;
    const body = measurePostBody(post, usable, expanded);
    height += body.rows + (body.folded ? 1 : 0);
    if (post.media.length > 0) height += 1 + MEDIA_BOX_ROWS * post.media.length;
    if (present(post.quotedPost)) height += 4; // marginTop + fixed three-row quote preview
  }

  if (present(post.counts)) height += 1;
  height += 1; // marginBottom
  return height;
}
