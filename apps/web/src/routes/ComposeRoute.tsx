import { describeError } from '@patches/client';
import { PostVisibility, QuotePolicy, type Post } from '@patches/proto/es';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { RichBody } from '../components/RichBody.js';
import { api } from '../api/client.js';
import { uploadMedia, type MediaUploadHandle } from '../lib/mediaUpload.js';
import styles from './ComposeRoute.module.css';

const MAX_MEDIA = 4;

/** `/compose` — text (+ up to 4 images, each uploaded straight to R2 via a presigned
 * PUT — spec §101) and an optional content warning. `?replyTo=<postId>` composes a
 * reply, `?quote=<postId>` composes a quote post, `?edit=<postId>` edits one of the
 * caller's own posts in place (`PostService.EditPost`, spec §189, §26 amended) instead
 * of creating a new one. */
export function ComposeRoute(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const replyTo = params.get('replyTo') ?? '';
  const quoteId = params.get('quote') ?? '';
  const editId = params.get('edit') ?? '';

  const [body, setBody] = useState('');
  const [cwEnabled, setCwEnabled] = useState(false);
  const [contentWarning, setContentWarning] = useState('');
  const [uploads, setUploads] = useState<MediaUploadHandle[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [loadedEditId, setLoadedEditId] = useState('');

  const nodeInfoQuery = useQuery({
    queryKey: ['node-info'],
    queryFn: () => api.node.getNodeInfo({}),
    staleTime: Infinity,
  });
  const maxChars = nodeInfoQuery.data?.socialCapabilities?.maxPostChars || 500;

  const quotedPostQuery = useQuery({
    queryKey: ['post', quoteId],
    queryFn: () => api.posts.getPost({ id: quoteId }),
    enabled: quoteId !== '',
  });

  const editingPostQuery = useQuery({
    queryKey: ['post', editId],
    queryFn: () => api.posts.getPost({ id: editId }),
    enabled: editId !== '',
  });

  // Seed the form from the post being edited exactly once it loads — a background
  // refetch shouldn't clobber in-progress typing (same pattern as SettingsProfileRoute).
  const editingPost = editingPostQuery.data?.post;
  if (editId !== '' && editingPost && loadedEditId !== editId) {
    setBody(editingPost.body);
    setCwEnabled(editingPost.contentWarning !== '');
    setContentWarning(editingPost.contentWarning);
    setUploads(
      editingPost.media.map((m) => ({
        mediaId: m.mediaId,
        file: new File([], m.altText || 'image'),
        progress: 1,
        status: 'ready' as const,
      })),
    );
    setLoadedEditId(editId);
  }

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

  const mutation = useMutation({
    mutationFn: async (): Promise<{ post?: Post | undefined }> => {
      const mediaIds = uploads.filter((u) => u.status === 'ready').map((u) => u.mediaId);
      if (editId !== '') {
        return await api.posts.editPost({
          id: editId,
          body,
          contentWarning: cwEnabled ? contentWarning : '',
          mediaIds,
        });
      }
      return await api.posts.createPost({
        clientRequestId: crypto.randomUUID(),
        body,
        linkUrl: '',
        visibility: PostVisibility.PUBLIC,
        inReplyToId: replyTo,
        mediaIds,
        contentWarning: cwEnabled ? contentWarning : '',
        quotedPostId: quoteId,
        communityId: '',
        quotePolicy: QuotePolicy.ANYONE,
      });
    },
    onSuccess: (response) => {
      if (response.post) void navigate(`/p/${response.post.id}`);
      else void navigate('/');
    },
    onError: (error: unknown) => setSubmitError(describeError(error).message),
  });

  const uploading = uploads.some((u) => u.status === 'uploading');
  const canSubmit =
    body.trim() !== '' && body.length <= maxChars && !uploading && !mutation.isPending;

  return (
    <div className={styles['wrap']}>
      <h1>{editId ? 'Edit post' : quoteId ? 'Quote' : replyTo ? 'Reply' : 'New post'}</h1>
      {submitError ? <p style={{ color: 'var(--danger)' }}>{submitError}</p> : null}
      {preview ? (
        <div className={styles['textarea']} style={{ minHeight: '120px' }}>
          <RichBody source={body || '*Nothing to preview yet.*'} />
        </div>
      ) : (
        <textarea
          className={styles['textarea']}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What's happening?"
          autoFocus
        />
      )}
      <p style={{ color: 'var(--fg-muted)', fontSize: '0.8rem', margin: '0.3rem 0' }}>
        **bold** · *italic* · `code` · &gt; quote · - list · #tag · @mention · bare links autolink
      </p>
      <div className={styles['row']}>
        <span className={`${styles['counter']} ${body.length > maxChars ? styles['over'] : ''}`}>
          {body.length}/{maxChars}
        </span>
        <label>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
          Preview
        </label>
        <label>
          <input
            type="checkbox"
            checked={cwEnabled}
            onChange={(e) => setCwEnabled(e.target.checked)}
          />
          Content warning
        </label>
      </div>
      {cwEnabled ? (
        <input
          className={styles['cwInput']}
          value={contentWarning}
          onChange={(e) => setContentWarning(e.target.value)}
          placeholder="Content warning text"
        />
      ) : null}
      {quoteId !== '' && quotedPostQuery.data?.post ? (
        <div className={styles['cwInput']}>
          <strong>@{quotedPostQuery.data.post.author?.handle}</strong>
          <p>{quotedPostQuery.data.post.body}</p>
        </div>
      ) : null}
      <div className={styles['mediaList']}>
        {uploads.map((upload) => (
          <div className={styles['mediaItem']} key={upload.file.name + upload.file.lastModified}>
            <img src={upload.file.size > 0 ? URL.createObjectURL(upload.file) : ''} alt="" />
            {upload.status === 'uploading' ? (
              <span>{Math.round(upload.progress * 100)}%</span>
            ) : null}
            {upload.status === 'ready' ? <span>Ready</span> : null}
            {upload.status === 'error' ? (
              <span style={{ color: 'var(--danger)' }}>Failed</span>
            ) : null}
          </div>
        ))}
        {uploads.length < MAX_MEDIA ? (
          <label className={styles['mediaItem']}>
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => onFilesSelected(e.target.files)}
            />
            + Add image
          </label>
        ) : null}
      </div>
      <div className={styles['row']}>
        <button
          type="button"
          className={styles['submit']}
          disabled={!canSubmit}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Posting…' : editId ? 'Save' : 'Post'}
        </button>
      </div>
    </div>
  );
}
