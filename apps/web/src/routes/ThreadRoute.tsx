import { describeError } from '@patches/client';
import { PostVisibility, QuotePolicy } from '@patches/proto/es';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { api } from '../api/client.js';
import { CloseIcon, ImageIcon } from '../components/icons/Icons.js';
import { MediaUploadPreview } from '../components/MediaUploadPreview.js';
import { PostCard } from '../components/PostCard.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { useSession } from '../hooks/useSession.js';
import { uploadMedia, type MediaUploadHandle } from '../lib/mediaUpload.js';
import styles from './ThreadRoute.module.css';

const MAX_MEDIA = 4;

/** `/p/:id` — the focused root post, an inline quick-reply composer with a sticky
 * "reply to @handle" header, and the chronologically-ordered reply list (one visual
 * indent level via CSS; flat semantics underneath). */
export function ThreadRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const postId = id ?? '';
  const session = useSession();
  const queryClient = useQueryClient();
  const onError = useErrorToast();

  const [replyBody, setReplyBody] = useState('');
  const [uploads, setUploads] = useState<MediaUploadHandle[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const postQuery = useQuery({
    queryKey: ['post', postId],
    queryFn: () => api.posts.getPost({ id: postId }),
    enabled: postId !== '',
  });

  const repliesQuery = useInfiniteQuery({
    queryKey: ['post', postId, 'replies'],
    queryFn: ({ pageParam }) =>
      api.posts.listReplies({ postId, cursor: pageParam, limit: 20, maxDepth: 1 }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => (lastPage.page?.hasMore ? lastPage.page.nextCursor : undefined),
    enabled: postId !== '',
  });

  const nodeInfoQuery = useQuery({
    queryKey: ['node-info'],
    queryFn: () => api.node.getNodeInfo({}),
    staleTime: Infinity,
  });
  const maxChars = nodeInfoQuery.data?.socialCapabilities?.maxPostChars || 500;
  const charsRemaining = maxChars - replyBody.length;

  const onFilesSelected = (files: FileList | null): void => {
    if (!files) return;
    const remaining = MAX_MEDIA - uploads.length;
    const selected = Array.from(files).slice(0, remaining);
    for (const file of selected) {
      const handle: MediaUploadHandle = { mediaId: '', file, progress: 0, status: 'uploading' };
      setUploads((current) => [...current, handle]);
      uploadMedia(file, (fraction) => {
        setUploads((current) =>
          current.map((u) => (u.file === file ? { ...u, progress: fraction } : u)),
        );
      })
        .then((mediaId) => {
          setUploads((current) =>
            current.map((u) => (u.file === file ? { ...u, mediaId, status: 'ready' } : u)),
          );
        })
        .catch((error: unknown) => {
          setUploads((current) =>
            current.map((u) =>
              u.file === file ? { ...u, status: 'error', error: describeError(error).message } : u,
            ),
          );
        });
    }
  };

  const removeUpload = (index: number): void => {
    setUploads((current) => current.filter((_, i) => i !== index));
  };

  const replyMutation = useMutation({
    mutationFn: async () => {
      const mediaIds = uploads.filter((u) => u.status === 'ready').map((u) => u.mediaId);
      return await api.posts.createPost({
        clientRequestId: crypto.randomUUID(),
        body: replyBody.trim(),
        linkUrl: '',
        visibility: PostVisibility.PUBLIC,
        inReplyToId: postId,
        mediaIds,
        contentWarning: '',
        quotedPostId: '',
        communityId: '',
        quotePolicy: QuotePolicy.ANYONE,
      });
    },
    onSuccess: async () => {
      setReplyBody('');
      setUploads([]);
      toast('Reply posted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['post', postId, 'replies'] }),
        queryClient.invalidateQueries({ queryKey: ['post', postId] }),
      ]);
    },
    onError: (error) => onError(error),
  });

  const handleReplySubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!replyBody.trim() || replyMutation.isPending || charsRemaining < 0 || uploading) return;
    replyMutation.mutate();
  };

  const replies = repliesQuery.data?.pages.flatMap((p) => p.posts) ?? [];
  const rootPost = postQuery.data?.post;
  // The server's own count is authoritative (a reply may be filtered out of the list but
  // still counted); the loaded list is only the fallback before it loads. Chronological
  // either way — no client-side ordering ever (Amendment B).
  const replyCount = rootPost?.counts?.replies ?? replies.length;

  // A reply only attaches uploads whose status is `ready` (the mutation filters), so
  // submitting mid-upload would silently drop every still-running attachment — block the
  // submit instead, mirroring ComposeRoute.
  const uploading = uploads.some((u) => u.status === 'uploading');

  if (postQuery.isPending) return <p style={{ padding: '1rem' }}>Loading…</p>;
  if (postQuery.isError || !rootPost) return <p style={{ padding: '1rem' }}>This post is gone.</p>;

  return (
    <div>
      {/* Root post — the thread's focus: highlighted, permalink-anchorable, and the
          target of the composer's sticky "reply to" header. */}
      <div className={styles['root']} id={rootPost.id}>
        <PostCard post={rootPost} focused />
      </div>

      {/* Inline Reply Composer */}
      {session ? (
        <div className={styles['replyBox']}>
          {session.actor.avatar?.url ? (
            <img src={session.actor.avatar.url} alt="" className={styles['avatar']} />
          ) : (
            <div className={styles['avatarPlaceholder']}>
              {session.actor.handle.slice(0, 1).toUpperCase()}
            </div>
          )}

          <form className={styles['replyForm']} onSubmit={handleReplySubmit}>
            <div className={styles['replyHeader']}>
              Replying to @{rootPost.author?.handle ?? 'unknown'}
            </div>

            <textarea
              className={styles['replyTextarea']}
              placeholder="Post your reply…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={2}
              aria-label="Write a reply"
            />

            {uploads.length > 0 ? (
              <div className={styles['mediaPreviewList']}>
                {uploads.map((upload, idx) => (
                  <div key={idx} className={styles['mediaPreviewItem']}>
                    <MediaUploadPreview
                      file={upload.file}
                      alt="Attachment preview"
                      className={styles['mediaPreviewImg']}
                    />
                    {upload.status === 'uploading' ? (
                      <div className={styles['mediaPreviewBusy']}>
                        <span>{Math.round(upload.progress * 100)}%</span>
                      </div>
                    ) : null}
                    {upload.status === 'error' ? (
                      <div
                        className={styles['mediaPreviewError']}
                        title={upload.error}
                        aria-label="Upload failed"
                      >
                        <span>Failed</span>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={styles['removeMediaBtn']}
                      onClick={() => removeUpload(idx)}
                      aria-label="Remove image"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className={styles['replyActions']}>
              <button
                type="button"
                className={styles['mediaAttachBtn']}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploads.length >= MAX_MEDIA}
                aria-label="Attach media"
              >
                <ImageIcon size={18} />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className={styles['hiddenFileInput']}
                onChange={(e) => {
                  onFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />

              <div className={styles['submitArea']}>
                <span
                  className={`${styles['charCount']} ${
                    charsRemaining < 0 ? styles['charCountOver'] : ''
                  }`}
                >
                  {charsRemaining}
                </span>

                <button
                  type="submit"
                  className={styles['replySubmitBtn']}
                  disabled={
                    !replyBody.trim() || replyMutation.isPending || charsRemaining < 0 || uploading
                  }
                  title={uploading ? 'Waiting for attachments to finish uploading…' : undefined}
                >
                  {replyMutation.isPending ? 'Posting…' : 'Reply'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div className={styles['guestReplyPrompt']}>
          Want to reply? <Link to="/login">Sign in</Link> or{' '}
          <Link to="/register">create an account</Link>.
        </div>
      )}

      {/* Replies — chronological, one visual indent level (CSS only; the list itself
          stays a flat run of articles, no nesting semantics). */}
      <section className={styles['replies']} aria-label="Replies">
        {replyCount > 0 ? (
          <h2 className={styles['repliesHeading']}>
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </h2>
        ) : null}
        {replies.map((reply) => (
          <div id={reply.id} key={reply.id} className={styles['replyAnchor']}>
            <PostCard post={reply} />
          </div>
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
      </section>
    </div>
  );
}
