import type { PageInfo, Post } from '@patches/proto/es';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type JSX } from 'react';

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { PostCard } from './PostCard.js';
import { PullToRefresh } from './ui/PullToRefresh.js';
import styles from './PostTimeline.module.css';

export interface PostPage {
  posts: Post[];
  page?: PageInfo | undefined;
}

export interface PostTimelineProps {
  /** Unique TanStack Query key for this feed (e.g. `['feed', 'home']`). */
  queryKey: readonly unknown[];
  fetchPage: (cursor: string) => Promise<PostPage>;
  emptyMessage: string;
}

/**
 * Cursor-paginated, chronological post list (spec §46 — never offset
 * pagination, never re-sorted client-side).
 * Features:
 * - Mobile pull-to-refresh
 * - Infinite scroll via IntersectionObserver sentinel
 * - New posts pill notification
 * - Fluid theme-aware shimmer skeleton loading
 * - j/k keyboard navigation
 */
export function PostTimeline({
  queryKey,
  fetchPage,
  emptyMessage,
}: PostTimelineProps): JSX.Element {
  const query = useInfiniteQuery({
    queryKey: [...queryKey],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: '',
    getNextPageParam: (lastPage) => (lastPage.page?.hasMore ? lastPage.page.nextCursor : undefined),
  });

  const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];
  const [focusedIndex, setFocusedIndex] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [hasNewer, setHasNewer] = useState(false);
  const topId = query.data?.pages[0]?.posts[0]?.id;

  // Poll the newest page's leading edge separately from the infinite query
  useEffect(() => {
    if (topId === undefined) return;
    const interval = setInterval(() => {
      void fetchPage('').then((page) => {
        const latestId = page.posts[0]?.id;
        if (latestId !== undefined && latestId !== topId) setHasNewer(true);
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, [topId, fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, query]);

  useKeyboardShortcuts(
    {
      j: () => setFocusedIndex((i) => Math.min(i + 1, posts.length - 1)),
      k: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
    },
    posts.length > 0,
  );

  const handleRefresh = async (): Promise<void> => {
    setHasNewer(false);
    await query.refetch();
  };

  if (query.isPending) {
    return (
      <div className={styles['container']}>
        {[0, 1, 2, 3, 4].map((n) => (
          <div className={styles['skeleton']} key={n}>
            <div className={`${styles['skeletonAvatar']} skeleton-shimmer`} />
            <div className={styles['skeletonLines']}>
              <div
                className={`${styles['skeletonLine']} skeleton-shimmer`}
                style={{ width: '35%' }}
              />
              <div
                className={`${styles['skeletonLine']} skeleton-shimmer`}
                style={{ width: '85%' }}
              />
              <div
                className={`${styles['skeletonLine']} skeleton-shimmer`}
                style={{ width: '60%' }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className={styles['empty']}>
        <p>Couldn&apos;t load this timeline.</p>
        <button
          type="button"
          className={styles['retryButton']}
          onClick={() => void query.refetch()}
        >
          Try refreshing
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <div className={styles['empty']}>{emptyMessage}</div>
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className={styles['container']}>
        {hasNewer ? (
          <div className={styles['pillWrap']}>
            <button
              type="button"
              className={styles['pill']}
              onClick={() => {
                setHasNewer(false);
                void query.refetch();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              ↑ New posts
            </button>
          </div>
        ) : null}

        {posts.map((post, index) => (
          <PostCard key={post.id} post={post} focused={index === focusedIndex} />
        ))}

        <div ref={sentinelRef} className={styles['sentinel']} />

        {query.isFetchingNextPage ? (
          <div className={styles['loadingMore']}>
            <div className={styles['smallSpinner']} />
            <span>Loading more…</span>
          </div>
        ) : null}
      </div>
    </PullToRefresh>
  );
}
