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

// --- background-snapshot cache (B-043) ----------------------------------------------
// A palette/help overlay freezes the screen behind it by mounting a *second*,
// independent copy of it through `renderToString` (`components/Overlay.tsx`) — a fresh
// component instance with no memory of what the live one already fetched. Left alone,
// that copy starts from `loading: true`, and the frozen snapshot is captured before its
// own request round-trips, so opening the palette showed "Loading" over a feed that had
// been sitting on screen, fully loaded, for minutes (owner report, 2026-08-19). A
// caller that supplies a stable `cacheKey` gets the most recent page seeded as this
// hook's *initial* state, so a second mount with the same key renders the
// already-loaded page on its very first pass and never re-fetches behind it.
const listCache = new Map<
  string,
  { items: readonly unknown[]; cursor: string; hasMore: boolean }
>();

function readListCache<T>(
  key: string,
): { items: readonly T[]; cursor: string; hasMore: boolean } | undefined {
  const cached = listCache.get(key);
  // One assertion at the cache's generic boundary: each key is owned by exactly one
  // caller (screens namespace their own keys), so a given key only ever stores one `T`.
  return cached === undefined
    ? undefined
    : (cached as { items: readonly T[]; cursor: string; hasMore: boolean });
}

function writeListCache<T>(
  key: string | undefined,
  value: { items: readonly T[]; cursor: string; hasMore: boolean },
): void {
  if (key !== undefined) listCache.set(key, value);
}

/**
 * Drops every cached page. The cache is deliberately module-level/shared (that is what
 * lets a second, independent mount find it) so it must be cleared explicitly wherever a
 * key could otherwise be read by a session it doesn't belong to: on sign-out (`App.tsx`
 * clears it alongside the optimistic reaction overlay, the same "stale session data
 * must not survive a session boundary" reasoning), and by tests — `test/harness.tsx`'s
 * `renderApp()` calls this before every render so one test's fake API never seeds
 * another's, since `target` strings repeat across fakes.
 */
export function clearListCache(): void {
  listCache.clear();
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
  /** B-043's background-snapshot cache key — omitted (the default) is byte-identical
   * to the old always-fetch behaviour. Screens that can sit under an overlay pass one
   * that changes whenever a real refetch is wanted (e.g. `home:${target}:${feedNonce}`). */
  cacheKey?: string,
): UsePaginatedListResult<T> {
  const cached = cacheKey === undefined ? undefined : readListCache<T>(cacheKey);
  const [items, setItems] = useState<readonly T[]>(() => cached?.items ?? []);
  const [cursor, setCursor] = useState(() => cached?.cursor ?? '');
  const [hasMore, setHasMore] = useState(() => cached?.hasMore ?? true);
  const [loading, setLoading] = useState(() => cached === undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FriendlyError | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [newCount, setNewCount] = useState(0);
  // Guards against `loadMore()` firing twice before the first response lands —
  // state updates from the in-flight request wouldn't be visible yet.
  const fetchingRef = useRef(false);

  useEffect(() => {
    // Already warm for this key — a second mount with the same `cacheKey` (the
    // palette's frozen background snapshot) renders the cached page and never issues
    // a second request behind it.
    if (cacheKey !== undefined && listCache.has(cacheKey)) return;
    let cancelled = false;
    fetchingRef.current = true;
    fetch('')
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setCursor(result.page?.nextCursor ?? '');
        setHasMore(result.page?.hasMore ?? false);
        writeListCache(cacheKey, {
          items: result.items,
          cursor: result.page?.nextCursor ?? '',
          hasMore: result.page?.hasMore ?? false,
        });
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
    // Re-runs only when the caller passes a new `fetch` (a new feed/actor) or
    // `cacheKey`, not on every render — screens memoize `fetch` with `useCallback`.
  }, [fetch, target, cacheKey]);

  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    fetch(cursor)
      .then((result) => {
        setItems((previous) => {
          const next = [...previous, ...result.items];
          writeListCache(cacheKey, {
            items: next,
            cursor: result.page?.nextCursor ?? '',
            hasMore: result.page?.hasMore ?? false,
          });
          return next;
        });
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
  }, [cacheKey, cursor, fetch, hasMore, target]);

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
        writeListCache(cacheKey, {
          items: result.items,
          cursor: result.page?.nextCursor ?? '',
          hasMore: result.page?.hasMore ?? false,
        });
      })
      .catch((thrown: unknown) => {
        setError(describeGrpcError(thrown, target));
      })
      .finally(() => {
        setRefreshing(false);
        fetchingRef.current = false;
      });
  }, [cacheKey, fetch, identify, target]);

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

export function usePaginatedPosts(
  target: string,
  fetch: FetchPostPage,
  /** B-043's background-snapshot cache key — see `usePaginatedList`. */
  cacheKey?: string,
): UsePaginatedPostsResult {
  const fetchItems = useCallback(
    (cursor: string): Promise<Page<Post>> =>
      fetch(cursor).then((result) => ({ items: result.posts, page: result.page })),
    [fetch],
  );
  const { items, loading, loadingMore, hasMore, error, loadMore, refresh, refreshing, newCount } =
    usePaginatedList<Post>(target, fetchItems, postId, cacheKey);
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
