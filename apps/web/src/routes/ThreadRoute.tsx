import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { PostCard } from '../components/PostCard.js';
import styles from './ThreadRoute.module.css';

/** `/p/:id` — the post plus one level of replies, with a manual "load more". */
export function ThreadRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const postId = id ?? '';

  const postQuery = useQuery({
    queryKey: ['post', postId],
    queryFn: () => api.post.getPost({ id: postId }),
    enabled: postId !== '',
  });

  const repliesQuery = useInfiniteQuery({
    queryKey: ['post', postId, 'replies'],
    queryFn: ({ pageParam }) =>
      api.post.listReplies({ postId, cursor: pageParam, limit: 20, maxDepth: 1 }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => (lastPage.page?.hasMore ? lastPage.page.nextCursor : undefined),
    enabled: postId !== '',
  });

  const replies = repliesQuery.data?.pages.flatMap((p) => p.posts) ?? [];

  if (postQuery.isPending) return <p>Loading…</p>;
  if (postQuery.isError || !postQuery.data.post) return <p>This post is gone.</p>;

  return (
    <div>
      <div className={styles['root']}>
        <PostCard post={postQuery.data.post} />
      </div>
      {replies.map((reply) => (
        <PostCard key={reply.id} post={reply} />
      ))}
      {repliesQuery.hasNextPage ? (
        <button
          type="button"
          className={styles['loadMore']}
          onClick={() => void repliesQuery.fetchNextPage()}
          disabled={repliesQuery.isFetchingNextPage}
        >
          {repliesQuery.isFetchingNextPage ? 'Loading…' : 'Load more replies'}
        </button>
      ) : null}
      {replies.length === 0 && !repliesQuery.isFetching ? (
        <p className={styles['loadMore']}>No replies yet.</p>
      ) : null}
    </div>
  );
}
