import type { Post } from '@patches/proto/es';
import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useSession } from '../hooks/useSession.js';
import { formatCount, formatRelativeTime } from '../lib/format.js';
import { MediaImage } from './MediaImage.js';
import { Nameplate } from './Nameplate.js';
import styles from './PostCard.module.css';
import { RichBody } from './RichBody.js';

export interface PostCardProps {
  post: Post;
  focused?: boolean;
}

/**
 * One post in a timeline or thread. Likes/bookmarks/reposts are optimistic
 * (flip immediately, roll back on error) but — per Amendment B §194 — never
 * change this post's position in whatever list it's rendered in; that's
 * enforced by the parent list never re-sorting on mutation, not here.
 */
export function PostCard({ post, focused = false }: PostCardProps): JSX.Element {
  const session = useSession();
  const onError = useErrorToast();
  const [viewerState, setViewerState] = useState(post.viewerState);
  const [counts, setCounts] = useState(post.counts);

  const requireAuth = (): boolean => {
    if (session === null) {
      onError(new Error('Sign in to do that.'));
      return false;
    }
    return true;
  };

  const toggleLike = async (): Promise<void> => {
    if (!requireAuth()) return;
    const wasLiked = viewerState?.liked ?? false;
    setViewerState((v) => (v ? { ...v, liked: !wasLiked } : v));
    setCounts((c) => (c ? { ...c, likes: c.likes + (wasLiked ? -1 : 1) } : c));
    try {
      const response = wasLiked
        ? await api.reactions.unlikePost({ postId: post.id })
        : await api.reactions.likePost({ postId: post.id });
      if (response.viewerState) setViewerState(response.viewerState);
      if (response.counts) setCounts(response.counts);
    } catch (error) {
      setViewerState((v) => (v ? { ...v, liked: wasLiked } : v));
      setCounts((c) => (c ? { ...c, likes: c.likes + (wasLiked ? 1 : -1) } : c));
      onError(error);
    }
  };

  const toggleBookmark = async (): Promise<void> => {
    if (!requireAuth()) return;
    const wasBookmarked = viewerState?.bookmarked ?? false;
    setViewerState((v) => (v ? { ...v, bookmarked: !wasBookmarked } : v));
    try {
      const response = wasBookmarked
        ? await api.reactions.unbookmarkPost({ postId: post.id })
        : await api.reactions.bookmarkPost({ postId: post.id });
      if (response.viewerState) setViewerState(response.viewerState);
    } catch (error) {
      setViewerState((v) => (v ? { ...v, bookmarked: wasBookmarked } : v));
      onError(error);
    }
  };

  const toggleRepost = async (): Promise<void> => {
    if (!requireAuth()) return;
    const wasReposted = viewerState?.reposted ?? false;
    setViewerState((v) => (v ? { ...v, reposted: !wasReposted } : v));
    setCounts((c) => (c ? { ...c, reposts: c.reposts + (wasReposted ? -1 : 1) } : c));
    try {
      const response = wasReposted
        ? await api.reactions.unrepostPost({ postId: post.id })
        : await api.reactions.repostPost({ postId: post.id });
      if (response.viewerState) setViewerState(response.viewerState);
      if (response.counts) setCounts(response.counts);
    } catch (error) {
      setViewerState((v) => (v ? { ...v, reposted: wasReposted } : v));
      setCounts((c) => (c ? { ...c, reposts: c.reposts + (wasReposted ? 1 : -1) } : c));
      onError(error);
    }
  };

  useKeyboardShortcuts({ l: () => void toggleLike() }, focused);

  const [cwOpen, setCwOpen] = useState(post.contentWarning === '');

  return (
    <article
      className={`${styles['card']} ${focused ? styles['focused'] : ''}`}
      data-post-id={post.id}
      aria-label={`Post by @${post.author?.handle ?? 'unknown'}`}
    >
      <img
        className={styles['avatar']}
        src={post.author?.avatar?.url ?? ''}
        alt=""
        aria-hidden="true"
      />
      <div className={styles['body']}>
        {post.repostedByTotal > 0 ? (
          <div className={styles['repostedBy']}>
            Reposted by{' '}
            {post.repostedBy.map((actor, index) => (
              <span key={actor.id}>
                {index > 0 ? ', ' : ''}
                <Link to={`/@${actor.handle}`}>@{actor.handle}</Link>
              </span>
            ))}
          </div>
        ) : null}
        <div className={styles['headerRow']}>
          <Link to={`/@${post.author?.handle ?? ''}`} className={styles['displayName']}>
            {post.author?.displayName || post.author?.handle}
          </Link>
          <Link to={`/@${post.author?.handle ?? ''}`}>
            <Nameplate handle={post.author?.handle ?? ''} nameplate={post.author?.nameplate} />
          </Link>
          <Link to={`/p/${post.id}`} className={styles['time']}>
            {formatRelativeTime(post.createdAt)}
            {post.editedAt ? ' · edited' : ''}
          </Link>
        </div>
        {post.contentWarning !== '' && !cwOpen ? (
          <button type="button" className={styles['cwButton']} onClick={() => setCwOpen(true)}>
            Content warning: {post.contentWarning} — click to show
          </button>
        ) : (
          <>
            <div className={styles['text']}>
              <RichBody source={post.body} />
            </div>
            {post.media.length > 0 ? (
              <div className={styles['mediaGrid']}>
                {post.media.map((media) => (
                  <MediaImage key={media.mediaId} mediaId={media.mediaId} altText={media.altText} />
                ))}
              </div>
            ) : null}
            {post.quotedPost ? (
              <div className={styles['quoted']}>
                <strong>@{post.quotedPost.author?.handle}</strong>
                <div className={styles['text']}>
                  <RichBody source={post.quotedPost.body} />
                </div>
              </div>
            ) : null}
          </>
        )}
        <div className={styles['actions']}>
          <Link to={`/p/${post.id}`} className={styles['actionButton']}>
            {formatCount(counts?.replies ?? 0)} replies
          </Link>
          <button
            type="button"
            className={`${styles['actionButton']} ${viewerState?.reposted ? styles['on'] : ''}`}
            onClick={() => void toggleRepost()}
          >
            {formatCount(counts?.reposts ?? 0)} repost
          </button>
          <button
            type="button"
            className={`${styles['actionButton']} ${viewerState?.liked ? styles['on'] : ''}`}
            onClick={() => void toggleLike()}
          >
            {formatCount(counts?.likes ?? 0)} like
          </button>
          <button
            type="button"
            className={`${styles['actionButton']} ${viewerState?.bookmarked ? styles['on'] : ''}`}
            onClick={() => void toggleBookmark()}
          >
            bookmark
          </button>
        </div>
      </div>
    </article>
  );
}
