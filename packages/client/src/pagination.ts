import type { PageInfo } from '@patches/proto/es';

/** The two fields `paginate` actually reads off a real `PageInfo` — narrowed from the
 * full generated message type (which carries a `$typeName` runtime tag) so plain fixture
 * objects satisfy this interface structurally in tests, while every real `PageInfo`
 * still satisfies it too (extra fields are fine). */
export type CursorPage = Pick<PageInfo, 'nextCursor' | 'hasMore'>;

/** Any `ListXxxResponse` shape: `repeated Xxx <name> = 1; PageInfo page = 2;` (spec §46,
 * `packages/proto/proto/patches/v1/common.proto`). The repeated field's name varies per
 * RPC (`posts`, `notifications`, `items`, ...), so callers supply an extractor. */
export interface CursorPageResponse {
  readonly page?: CursorPage | undefined;
}

export interface PaginateOptions {
  /** Cursor to start from. Omit (or `''`) to start from the newest item. */
  readonly startCursor?: string;
  /** Page size requested per call — the server clamps this to its own maximum. */
  readonly limit?: number;
}

const DEFAULT_LIMIT = 20;

/**
 * Turns a cursor-paginated `ListXxx` RPC into an async iterator over its items,
 * fetching one page at a time. Never offset pagination (spec §153) — `cursor` is always
 * the opaque value from the previous page's `page.nextCursor`, never a page number.
 *
 * ```ts
 * for await (const post of paginate(
 *   (cursor, limit) => api.feeds.listHomeFeed({ cursor, limit }, opts),
 *   (response) => response.posts,
 * )) { ... }
 * ```
 */
export async function* paginate<Item, Response extends CursorPageResponse>(
  fetchPage: (cursor: string, limit: number) => Promise<Response>,
  extractItems: (response: Response) => readonly Item[],
  options?: PaginateOptions,
): AsyncGenerator<Item, void, unknown> {
  let cursor = options?.startCursor ?? '';
  const limit = options?.limit ?? DEFAULT_LIMIT;

  for (;;) {
    const response = await fetchPage(cursor, limit);
    for (const item of extractItems(response)) {
      yield item;
    }
    const page = response.page;
    if (page === undefined || !page.hasMore || page.nextCursor.length === 0) return;
    cursor = page.nextCursor;
  }
}
