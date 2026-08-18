import type { PageInfo, Post } from '@patches/proto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { describeGrpcError, type FriendlyError } from '../api/errors.js';

export interface PostPage {
  posts: readonly Post[];
  page: PageInfo | undefined;
}

/** One cursor-paginated `ListXxx` RPC (spec §46), e.g. `api.listLocalFeed`. */
export type FetchPostPage = (cursor: string) => Promise<PostPage>;

export interface UsePaginatedPostsResult {
  posts: readonly Post[];
  /** True only for the very first page of this feed. */
  loading: boolean;
  /** True while a `loadMore()` call is in flight. */
  loadingMore: boolean;
  hasMore: boolean;
  error: FriendlyError | undefined;
  /** No-op while a page is already loading, or when `hasMore` is false. */
  loadMore: () => void;
}

/**
 * Drives one cursor-paginated post list — the profile timeline and the local
 * feed both use this (spec §68: shared behaviour, not duplicated per screen).
 * Never offset-based (spec §46, §153): every page request carries the opaque
 * `next_cursor` from the previous response, never a page number.
 */
export function usePaginatedPosts(target: string, fetch: FetchPostPage): UsePaginatedPostsResult {
  const [posts, setPosts] = useState<readonly Post[]>([]);
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
        setPosts(result.posts);
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
        setPosts((previous) => [...previous, ...result.posts]);
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

  return { posts, loading, loadingMore, hasMore, error, loadMore };
}
