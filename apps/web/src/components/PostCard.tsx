import { FilterAction, type Post } from '@patches/proto/es';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { api } from '../api/client.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { useSession } from '../hooks/useSession.js';
import {
  formatAbsoluteTime,
  formatActorHandle,
  formatCount,
  formatRelativeTime,
} from '../lib/format.js';
import {
  AlertTriangleIcon,
  BookmarkIcon,
  CopyIcon,
  EditIcon,
  HeartIcon,
  HistoryIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PinIcon,
  RepeatIcon,
  ShareIcon,
  TrashIcon,
} from './icons/Icons.js';
import { MediaImage } from './MediaImage.js';
import { MediaLightbox, type LightboxImage } from './MediaLightbox.js';
import { CosmeticText, Nameplate } from './Nameplate.js';
import styles from './PostCard.module.css';
import { ReportPostControl } from './ReportPostControl.js';
import { RichBody } from './RichBody.js';

export interface PostCardProps {
  post: Post;
  focused?: boolean;
}

/**
 * One post in a timeline or thread with rich icons, micro-interactions,
 * Web Share API support, and full-screen image lightbox.
 *
 * P301: wrapped in `memo` — `PostTimeline` re-renders on every focus-index change (j/k
 * nav), 30s "new posts" poll tick, and page fetch; without this every visible `PostCard`
 * re-rendered on each of those even though only its own `post`/`focused` props determine
 * its output. `post` references are stable between renders (from react-query's cache) so
 * the default shallow prop comparison is sufficient — no custom comparator needed.
 */
function PostCardImpl({ post, focused = false }: PostCardProps): JSX.Element {
  const session = useSession();
  const onError = useErrorToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [viewerState, setViewerState] = useState(post.viewerState);
  const [counts, setCounts] = useState(post.counts);
  const isOwn = session?.actor.id === post.author?.id;
  const [pinned, setPinned] = useState(post.author?.pinnedPostIds.includes(post.id) ?? false);
  const [deleted, setDeleted] = useState(post.deleted);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [likePopping, setLikePopping] = useState(false);
  const [repostPopping, setRepostPopping] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

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
    setLikePopping(true);
    setTimeout(() => setLikePopping(false), 300);

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
      toast(wasBookmarked ? 'Removed from bookmarks' : 'Saved to bookmarks');
    } catch (error) {
      setViewerState((v) => (v ? { ...v, bookmarked: wasBookmarked } : v));
      onError(error);
    }
  };

  const toggleRepost = async (): Promise<void> => {
    if (!requireAuth()) return;
    const wasReposted = viewerState?.reposted ?? false;
    setRepostPopping(true);
    setTimeout(() => setRepostPopping(false), 300);

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
    setMoreMenuOpen(false);
    try {
      if (wasPinned) await api.posts.unpinPost({ postId: post.id });
      else await api.posts.pinPost({ postId: post.id, position: 0 });
      toast(wasPinned ? 'Post unpinned' : 'Post pinned to profile');
    } catch (error) {
      setPinned(wasPinned);
      onError(error);
    }
  };

  const handleShare = async (): Promise<void> => {
    const postUrl = `${window.location.origin}/p/${post.id}`;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: `Post by @${post.author?.handle ?? 'patches'}`,
          text: post.body,
          url: postUrl,
        });
        return;
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }

    // Fallback: Copy link to clipboard
    try {
      await navigator.clipboard.writeText(postUrl);
      toast('Post link copied to clipboard');
    } catch {
      toast(`Post URL: ${postUrl}`);
    }
  };

  const deletePost = async (): Promise<void> => {
    setMoreMenuOpen(false);
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api.posts.deletePost({ id: post.id });
      setDeleted(true);
      toast('Post deleted');
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

  const handleUrlResolved = (mediaId: string, url: string): void => {
    setResolvedUrls((prev) => (prev[mediaId] === url ? prev : { ...prev, [mediaId]: url }));
  };

  const lightboxImages: LightboxImage[] = post.media
    .filter((m) => Boolean(resolvedUrls[m.mediaId]))
    .map((m) => ({
      mediaId: m.mediaId,
      url: resolvedUrls[m.mediaId] ?? '',
      altText: m.altText,
    }));

  const openLightboxAt = (index: number): void => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleCardClick = (e: React.MouseEvent<HTMLElement>): void => {
    if (focused) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [data-lightbox-trigger]')) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    void navigate(`/p/${post.id}`);
  };

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
      onClick={handleCardClick}
    >
      {post.author?.avatar?.url ? (
        <Link to={`/@${post.author.handle}`} className={styles['avatarLink']}>
          <img
            className={styles['avatar']}
            src={post.author.avatar.url}
            alt=""
            aria-hidden="true"
          />
        </Link>
      ) : (
        <Link to={`/@${post.author?.handle ?? ''}`} className={styles['avatarLink']}>
          <div className={styles['avatarPlaceholder']}>
            {post.author?.handle.slice(0, 1).toUpperCase() ?? 'P'}
          </div>
        </Link>
      )}

      <div className={styles['body']}>
        {post.repostedByTotal > 0 ? (
          <div className={styles['repostedBy']}>
            <RepeatIcon size={14} className={styles['contextIcon']} />
            <span>
              Reposted by{' '}
              {post.repostedBy.map((actor, index) => (
                <span key={actor.id}>
                  {index > 0 ? ', ' : ''}
                  <Link to={`/@${actor.handle}`}>@{formatActorHandle(actor)}</Link>
                </span>
              ))}
            </span>
          </div>
        ) : null}

        {pinned ? (
          <div className={styles['repostedBy']}>
            <PinIcon size={14} className={styles['contextIcon']} />
            <span>Pinned post</span>
          </div>
        ) : null}

        <div className={styles['headerRow']}>
          <Link to={`/@${post.author?.handle ?? ''}`} className={styles['displayName']}>
            {/* B-129: the actor's nameplate colour/glyph applies to the display name in
                every card, not just the @handle — same §184.3 rule, presentation only. */}
            <CosmeticText nameplate={post.author?.nameplate}>
              {post.author?.displayName || post.author?.handle}
            </CosmeticText>
          </Link>
          <Link to={`/@${post.author?.handle ?? ''}`} className={styles['nameplateLink']}>
            <Nameplate handle={post.author?.handle ?? ''} nameplate={post.author?.nameplate} />
          </Link>
          <Link to={`/p/${post.id}`} className={styles['time']}>
            {formatRelativeTime(post.createdAt)}
            {post.editedAt ? ' · edited' : ''}
          </Link>

          <div className={styles['moreMenuWrap']}>
            <button
              type="button"
              className={styles['moreMenuButton']}
              onClick={() => setMoreMenuOpen((v) => !v)}
              aria-label="More options"
            >
              <MoreHorizontalIcon size={16} />
            </button>
            {moreMenuOpen ? (
              <div className={styles['moreDropdown']} onClick={() => setMoreMenuOpen(false)}>
                <button type="button" onClick={() => void handleShare()}>
                  <CopyIcon size={14} />
                  <span>Copy post link</span>
                </button>
                {isOwn ? (
                  <>
                    <button type="button" onClick={() => void navigate(`/compose?edit=${post.id}`)}>
                      <EditIcon size={14} />
                      <span>Edit post</span>
                    </button>
                    <button type="button" onClick={() => void togglePin()}>
                      <PinIcon size={14} />
                      <span>{pinned ? 'Unpin from profile' : 'Pin to profile'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryOpen((v) => !v);
                        if (!historyOpen) {
                          void queryClient.invalidateQueries({
                            queryKey: ['post-edits', post.id],
                          });
                        }
                      }}
                    >
                      <HistoryIcon size={14} />
                      <span>Edit history</span>
                    </button>
                    <button
                      type="button"
                      className={styles['dangerAction']}
                      onClick={() => void deletePost()}
                    >
                      <TrashIcon size={14} />
                      <span>Delete post</span>
                    </button>
                  </>
                ) : (
                  <ReportPostControl postId={post.id} className={styles['dropdownReport']} />
                )}
              </div>
            ) : null}
          </div>
        </div>

        {(post.labels?.length ?? 0) > 0 ? (
          <div className={styles['labelsRow']}>
            {post.labels?.map((label) => (
              <span key={label.id} className={styles['labelBadge']}>
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
            <AlertTriangleIcon size={14} />
            <span>
              Filtered: {filteredBy.name}
              {filteredBy.listOwner ? ` (via @${filteredBy.listOwner.handle})` : ''} — show
            </span>
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
                <AlertTriangleIcon size={14} />
                <span>CW: {post.contentWarning} — show post</span>
              </button>
            ) : (
              <>
                <div className={styles['text']}>
                  <RichBody source={post.body} />
                </div>

                {post.media.length > 0 ? (
                  <div
                    className={`${styles['mediaGrid']} ${
                      post.media.length === 1
                        ? styles['singleMedia']
                        : post.media.length === 3
                          ? styles['threeMedia']
                          : ''
                    }`}
                  >
                    {post.media.map((media, index) => (
                      <div className={styles['mediaCell']} key={media.mediaId}>
                        <MediaImage
                          mediaId={media.mediaId}
                          altText={media.altText}
                          className={styles['mediaImg']}
                          onUrlResolved={(url) => handleUrlResolved(media.mediaId, url)}
                          onClick={() => openLightboxAt(index)}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {post.quotedPost ? (
                  <div className={styles['quoted']}>
                    <div className={styles['quotedHeader']}>
                      <strong>
                        <CosmeticText nameplate={post.quotedPost.author?.nameplate}>
                          {post.quotedPost.author?.displayName || post.quotedPost.author?.handle}
                        </CosmeticText>
                      </strong>
                      <span className={styles['time']}>
                        @{formatActorHandle(post.quotedPost.author)}
                      </span>
                    </div>
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
          <Link
            to={`/p/${post.id}`}
            className={styles['actionButton']}
            aria-label={`View thread and replies (${counts?.replies ?? 0} replies)`}
          >
            <MessageSquareIcon size={17} />
            <span>{formatCount(counts?.replies ?? 0)}</span>
          </Link>

          <button
            type="button"
            className={`${styles['actionButton']} ${styles['repostBtn']} ${
              viewerState?.reposted ? styles['onRepost'] : ''
            } ${repostPopping ? styles['popping'] : ''}`}
            onClick={() => void toggleRepost()}
            aria-label={viewerState?.reposted ? 'Undo repost' : 'Repost'}
          >
            <RepeatIcon size={17} />
            <span>{formatCount(counts?.reposts ?? 0)}</span>
          </button>

          <button
            type="button"
            className={`${styles['actionButton']} ${styles['likeBtn']} ${
              viewerState?.liked ? styles['onLike'] : ''
            } ${likePopping ? styles['popping'] : ''}`}
            onClick={() => void toggleLike()}
            aria-label={viewerState?.liked ? 'Unlike' : 'Like'}
          >
            <HeartIcon size={17} filled={viewerState?.liked ?? false} />
            <span>{formatCount(counts?.likes ?? 0)}</span>
          </button>

          <button
            type="button"
            className={`${styles['actionButton']} ${
              viewerState?.bookmarked ? styles['onBookmark'] : ''
            }`}
            onClick={() => void toggleBookmark()}
            aria-label={viewerState?.bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            <BookmarkIcon size={17} />
          </button>

          <Link
            to={`/compose?quote=${post.id}`}
            className={styles['actionButton']}
            aria-label="Quote post"
          >
            <EditIcon size={16} />
          </Link>

          <button
            type="button"
            className={styles['actionButton']}
            onClick={() => void handleShare()}
            aria-label="Share post"
          >
            <ShareIcon size={17} />
          </button>
        </div>

        {historyOpen ? (
          <div className={styles['editHistoryPanel']}>
            <strong>Edit history</strong>
            {editsQuery.isPending ? <p>Loading history…</p> : null}
            {editsQuery.data?.edits.length === 0 ? <p>No previous edits.</p> : null}
            {editsQuery.data?.edits.map((edit) => (
              <div key={edit.id} className={styles['editHistoryItem']}>
                <div className={styles['time']}>{formatAbsoluteTime(edit.createdAt)}:</div>
                <div className={styles['text']}>{edit.previousBody}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Lightbox for full screen photo viewer */}
      {lightboxImages.length > 0 ? (
        <MediaLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </article>
  );
}

export const PostCard = memo(PostCardImpl);
