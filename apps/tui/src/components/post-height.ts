import type { Post } from '@patches/proto';

import { present } from '../api/present.js';
import { wrappedRowCount } from '../format/measure.js';
import { sanitizeForTerminal } from '../format/sanitize.js';

/** Rows the spec §75 fallback box occupies (`buildFallbackBox` returns three lines),
 * plus the `marginTop={1}` the attachment block carries. */
const MEDIA_BOX_ROWS = 3;

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
export function measurePostRowHeight(post: Post, width: number, revealed: boolean): number {
  const usable = Math.max(1, width);
  let height = 1; // header
  const hasWarning = !post.deleted && post.contentWarning !== '';

  if (post.deleted) {
    height += 1;
  } else if (hasWarning && !revealed) {
    height += 1; // "⚠ … — press v to reveal"
  } else {
    if (hasWarning) height += 1;
    const body = sanitizeForTerminal(post.body === '' ? post.linkUrl : post.body);
    height += wrappedRowCount(body, usable);
    if (post.media.length > 0) height += 1 + MEDIA_BOX_ROWS * post.media.length;
  }

  if (present(post.counts)) height += 1;
  height += 1; // marginBottom
  return height;
}
