import type { PageInfo, Post } from '@patches/proto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { describeGrpcError, type FriendlyError } from '../api/errors.js';

export interface Page<T> {
  items: readonly T[];
  page: PageInfo | undefined;
}

/** One cursor-paginated `ListXxx` RPC (spec §46), e.g. `api.listLocalFeed`. */
export type FetchPage<T> = (cursor: string) => Promise<Page<T>>;

export interface UsePaginatedListResult<T> {
  items: readonly T[];
  /** True only for the very first page of this list. */
  loading: boolean;
  /** True while a `loadMore()` call is in flight. */
  loadingMore: boolean;
  hasMore: boolean;
  error: FriendlyError | undefined;
  /** No-op while a page is already loading, or when `hasMore` is false. */
  loadMore: () => void;
}

/**
 * Drives one cursor-paginated list — posts (profile timeline, local/home feed,
 * thread replies, bookmarks) and notifications all use this (spec §68: shared
 * behaviour, not duplicated per screen). Never offset-based (spec §46, §153):
 * every page request carries the opaque `next_cursor` from the previous
 * response, never a page number.
 */
export function usePaginatedList<T>(
  target: string,
  fetch: FetchPage<T>,
): UsePaginatedListResult<T> {
  const [items, setItems] = useState<readonly T[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FriendlyError | undefined>(undefined);
  // Guards against `loadMore()` firing twice before the first response lands —
  // state updates from the in-flight request wouldn't be visible yet.
  const fetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchingRef.current = true;
    fetch('')
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setCursor(result.page?.nextCursor ?? '');
        setHasMore(result.page?.hasMore ?? false);
      })
      .catch((thrown: unknown) => {
        if (!cancelled) setError(describeGrpcError(thrown, target));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        fetchingRef.current = false;
      });
    return () => {
      cancelled = true;
    };
    // Re-runs only when the caller passes a new `fetch` (a new feed/actor), not
    // on every render — screens memoize `fetch` with `useCallback`.
  }, [fetch, target]);

  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    fetch(cursor)
      .then((result) => {
        setItems((previous) => [...previous, ...result.items]);
        setCursor(result.page?.nextCursor ?? '');
        setHasMore(result.page?.hasMore ?? false);
      })
      .catch((thrown: unknown) => {
        setError(describeGrpcError(thrown, target));
      })
      .finally(() => {
        setLoadingMore(false);
        fetchingRef.current = false;
      });
  }, [cursor, fetch, hasMore, target]);

  return { items, loading, loadingMore, hasMore, error, loadMore };
}

// ---------------------------------------------------------------------------
// Post-specific wrapper — kept so existing `posts`/`PostPage` call sites
// (profile timeline, local/home feed, thread replies) don't need to change.
// ---------------------------------------------------------------------------

export interface PostPage {
  posts: readonly Post[];
  page: PageInfo | undefined;
}

/** One cursor-paginated `ListXxx` RPC (spec §46), e.g. `api.listLocalFeed`. */
export type FetchPostPage = (cursor: string) => Promise<PostPage>;

export interface UsePaginatedPostsResult {
  posts: readonly Post[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: FriendlyError | undefined;
  loadMore: () => void;
}

export function usePaginatedPosts(target: string, fetch: FetchPostPage): UsePaginatedPostsResult {
  const fetchItems = useCallback(
    (cursor: string): Promise<Page<Post>> =>
      fetch(cursor).then((result) => ({ items: result.posts, page: result.page })),
    [fetch],
  );
  const { items, loading, loadingMore, hasMore, error, loadMore } = usePaginatedList<Post>(
    target,
    fetchItems,
  );
  return { posts: items, loading, loadingMore, hasMore, error, loadMore };
}
