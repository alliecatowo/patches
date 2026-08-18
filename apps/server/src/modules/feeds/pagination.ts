import { AppError } from '../../common/errors/app-error.js';

/**
 * Keyset (cursor) pagination shared by every list RPC (spec §46, §153 — never offset
 * pagination). Canonical ordering across the whole API is `created_at DESC, id DESC`
 * (`packages/proto/proto/patches/v1/common.proto`'s `PageInfo` doc), so one cursor shape
 * serves posts here and would serve any other `(created_at, id)`-ordered list later.
 *
 * Lives in `modules/feeds` because `FeedService` is the module with the most list RPCs, but
 * `PostService.ListReplies` (`modules/posts`) reuses it rather than duplicating the codec —
 * both modules are within this task's owned file set.
 */

export interface Cursor {
  createdAt: Date;
  id: string;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** Clamps a client-supplied page size: `0` (unset) becomes the default, never an OFFSET. */
export function clampLimit(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.trunc(requested), MAX_PAGE_SIZE);
}

/**
 * Opaque to clients by construction (spec §46): a `base64url`-encoded JSON pair, not a
 * predictable offset or raw id. `undefined` means "start from the newest item".
 */
export function decodeCursor(raw: string): Cursor | undefined {
  if (raw.length === 0) return undefined;

  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      c: unknown;
      i: unknown;
    };
    if (typeof decoded.c !== 'string' || typeof decoded.i !== 'string' || decoded.i.length === 0) {
      throw new Error('malformed cursor payload');
    }
    const createdAt = new Date(decoded.c);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('malformed cursor timestamp');
    }
    return { createdAt, id: decoded.i };
  } catch (error) {
    throw AppError.validation('Invalid pagination cursor.', { cause: error });
  }
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id })).toString(
    'base64url',
  );
}

/**
 * Builds a `PageInfo` from one page of results fetched with `limit + 1` rows: the extra row
 * (dropped from what's returned) is how `has_more` is known without a second `COUNT` query.
 * `rows` must already be sliced back down to `limit` by the caller.
 */
export function pageInfoFor<Row>(
  rows: readonly Row[],
  fetchedExtra: boolean,
  cursorOf: (row: Row) => Cursor,
): { nextCursor: string; hasMore: boolean } {
  const last = rows.at(-1);
  return {
    nextCursor: fetchedExtra && last !== undefined ? encodeCursor(cursorOf(last)) : '',
    hasMore: fetchedExtra,
  };
}
