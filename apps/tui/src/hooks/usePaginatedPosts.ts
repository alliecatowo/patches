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
  /**
   * Re-reads the first page from the server and replaces what is held, discarding
   * any extra pages already loaded (a refresh means "back to newest"). Two reasons
   * this exists: the `↑ N new` marker, and viewer state — a like made in a previous
   * session only shows as liked once the *server's* `viewer_state` is re-read, so a
   * refresh has to replace rows rather than merge into them (owner feedback
   * 2026-08-18: "posts I liked, after starting a new session, showed not liked").
   */
  refresh: () => void;
  /** True while `refresh()` is in flight. */
  refreshing: boolean;
  /** How many items the last `refresh()` brought in that weren't already held. */
  newCount: number;
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
  /** Stable identity for an item, so `refresh()` can count what is genuinely new.
   * Omitted (no identity) means a refresh reports `newCount: 0`. */
  identify?: (item: T) => string,
): UsePaginatedListResult<T> {
  const [items, setItems] = useState<readonly T[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FriendlyError | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [newCount, setNewCount] = useState(0);
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

  const refresh = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setRefreshing(true);
    fetch('')
      .then((result) => {
        setItems((previous) => {
          if (identify !== undefined) {
            const known = new Set(previous.map(identify));
            setNewCount(result.items.filter((item) => !known.has(identify(item))).length);
          }
          return result.items;
        });
        setCursor(result.page?.nextCursor ?? '');
        setHasMore(result.page?.hasMore ?? false);
        setError(undefined);
      })
      .catch((thrown: unknown) => {
        setError(describeGrpcError(thrown, target));
      })
      .finally(() => {
        setRefreshing(false);
        fetchingRef.current = false;
      });
  }, [fetch, identify, target]);

  return { items, loading, loadingMore, hasMore, error, loadMore, refresh, refreshing, newCount };
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
  refresh: () => void;
  refreshing: boolean;
  newCount: number;
}

/** Module-level (not inline) so its identity is stable across renders and
 * `usePaginatedList`'s `refresh` callback doesn't change every render. */
function postId(post: Post): string {
  return post.id;
}

export function usePaginatedPosts(target: string, fetch: FetchPostPage): UsePaginatedPostsResult {
  const fetchItems = useCallback(
    (cursor: string): Promise<Page<Post>> =>
      fetch(cursor).then((result) => ({ items: result.posts, page: result.page })),
    [fetch],
  );
  const { items, loading, loadingMore, hasMore, error, loadMore, refresh, refreshing, newCount } =
    usePaginatedList<Post>(target, fetchItems, postId);
  return {
    posts: items,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    refreshing,
    newCount,
  };
}
