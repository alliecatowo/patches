import type { PageInfo, Post } from '@patches/proto/es';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type JSX } from 'react';

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { PostCard } from './PostCard.js';
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
 * pagination, never re-sorted client-side). Infinite-scrolls via an
 * IntersectionObserver sentinel, shows a "new posts" pill when the feed's
 * first page changes without disturbing scroll position, and supports the
 * `j`/`k` timeline navigation keys (mirroring the TUI).
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

  // Poll the newest page's leading edge separately from the infinite query so
  // scrolling further down never gets interrupted by a background refetch.
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

  if (query.isPending) {
    return (
      <div>
        {[0, 1, 2, 3].map((n) => (
          <div className={styles['skeleton']} key={n}>
            <div className={styles['skeletonAvatar']} />
            <div className={styles['skeletonLines']}>
              <div className={styles['skeletonLine']} style={{ width: '40%' }} />
              <div className={styles['skeletonLine']} />
              <div className={styles['skeletonLine']} style={{ width: '60%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <div className={styles['empty']}>Couldn&apos;t load this timeline. Try refreshing.</div>;
  }

  if (posts.length === 0) {
    return <div className={styles['empty']}>{emptyMessage}</div>;
  }

  return (
    <div>
      {hasNewer ? (
        <div className={styles['pillWrap']}>
          <button
            type="button"
            className={styles['pill']}
            onClick={() => {
              setHasNewer(false);
              void query.refetch();
            }}
          >
            New posts
          </button>
        </div>
      ) : null}
      {posts.map((post, index) => (
        <PostCard key={post.id} post={post} focused={index === focusedIndex} />
      ))}
      <div ref={sentinelRef} className={styles['sentinel']} />
      {query.isFetchingNextPage ? <div className={styles['empty']}>Loading more…</div> : null}
    </div>
  );
}
