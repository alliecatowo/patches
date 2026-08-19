import { FilterAction, type Post } from '@patches/proto/es';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useSession } from '../hooks/useSession.js';
import { formatAbsoluteTime, formatCount, formatRelativeTime } from '../lib/format.js';
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
  const queryClient = useQueryClient();
  const [viewerState, setViewerState] = useState(post.viewerState);
  const [counts, setCounts] = useState(post.counts);
  const isOwn = session?.actor.id === post.author?.id;
  const [pinned, setPinned] = useState(post.author?.pinnedPostIds.includes(post.id) ?? false);
  const [deleted, setDeleted] = useState(post.deleted);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  const togglePin = async (): Promise<void> => {
    const wasPinned = pinned;
    setPinned(!wasPinned);
    try {
      if (wasPinned) await api.posts.unpinPost({ postId: post.id });
      else await api.posts.pinPost({ postId: post.id, position: 0 });
    } catch (error) {
      setPinned(wasPinned);
      onError(error);
    }
  };

  const deletePost = async (): Promise<void> => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api.posts.deletePost({ id: post.id });
      setDeleted(true);
    } catch (error) {
      onError(error);
    }
  };

  useKeyboardShortcuts({ l: () => void toggleLike() }, focused);

  const [cwOpen, setCwOpen] = useState(post.contentWarning === '');
  const filteredBy = post.filteredBy;
  const [filterExpanded, setFilterExpanded] = useState(false);

  const editsQuery = useQuery({
    queryKey: ['post-edits', post.id],
    queryFn: () => api.posts.listPostEdits({ postId: post.id, cursor: '', limit: 20 }),
    enabled: historyOpen,
  });

  if (deleted) {
    return (
      <article className={styles['card']} data-post-id={post.id}>
        <div className={styles['body']}>
          <p style={{ color: 'var(--fg-muted)' }}>This post was deleted.</p>
        </div>
      </article>
    );
  }

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
        {pinned ? <div className={styles['repostedBy']}>Pinned</div> : null}
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
        {post.labels.length > 0 ? (
          <div className={styles['repostedBy']}>
            {post.labels.map((label) => (
              <span key={label.id} className={styles['cwButton']} style={{ marginRight: '0.4rem' }}>
                {label.value}
              </span>
            ))}
          </div>
        ) : null}
        {filteredBy && filteredBy.action === FilterAction.COLLAPSE && !filterExpanded ? (
          <button
            type="button"
            className={styles['cwButton']}
            onClick={() => setFilterExpanded(true)}
          >
            Filtered: {filteredBy.name}
            {filteredBy.listOwner ? ` (via @${filteredBy.listOwner.handle})` : ''} — click to show
          </button>
        ) : (
          <>
            {filteredBy && filteredBy.action === FilterAction.WARN ? (
              <div className={styles['repostedBy']}>
                Filtered: {filteredBy.name}
                {filteredBy.listOwner ? ` (via @${filteredBy.listOwner.handle})` : ''}
              </div>
            ) : null}
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
                      <MediaImage
                        key={media.mediaId}
                        mediaId={media.mediaId}
                        altText={media.altText}
                      />
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
          <Link to={`/compose?quote=${post.id}`} className={styles['actionButton']}>
            quote
          </Link>
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
          {isOwn ? (
            <>
              <Link to={`/compose?edit=${post.id}`} className={styles['actionButton']}>
                edit
              </Link>
              <button
                type="button"
                className={styles['actionButton']}
                onClick={() => void togglePin()}
              >
                {pinned ? 'unpin' : 'pin'}
              </button>
              <button
                type="button"
                className={styles['actionButton']}
                onClick={() => {
                  setHistoryOpen((v) => !v);
                  if (!historyOpen)
                    void queryClient.invalidateQueries({ queryKey: ['post-edits', post.id] });
                }}
              >
                history
              </button>
              <button
                type="button"
                className={styles['actionButton']}
                onClick={() => void deletePost()}
              >
                delete
              </button>
            </>
          ) : null}
        </div>
        {historyOpen ? (
          <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
            {editsQuery.isPending ? <p>Loading edit history…</p> : null}
            {editsQuery.data?.edits.length === 0 ? <p>No edits.</p> : null}
            {editsQuery.data?.edits.map((edit) => (
              <div
                key={edit.id}
                style={{ padding: '0.3rem 0', borderTop: '1px solid var(--border)' }}
              >
                <div>{formatAbsoluteTime(edit.createdAt)} — previous body:</div>
                <div>{edit.previousBody}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
