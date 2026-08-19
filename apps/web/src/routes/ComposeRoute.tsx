import { PostVisibility, QuotePolicy } from '@patches/proto/es';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { describeError } from '../api/errors.js';
import { uploadMedia, type MediaUploadHandle } from '../lib/mediaUpload.js';
import styles from './ComposeRoute.module.css';

const MAX_MEDIA = 4;

/** `/compose` — text (+ up to 4 images, each uploaded straight to R2 via a presigned
 * PUT — spec §101) and an optional content warning. `?replyTo=<postId>` composes a reply. */
export function ComposeRoute(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const replyTo = params.get('replyTo') ?? '';

  const [body, setBody] = useState('');
  const [cwEnabled, setCwEnabled] = useState(false);
  const [contentWarning, setContentWarning] = useState('');
  const [uploads, setUploads] = useState<MediaUploadHandle[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nodeInfoQuery = useQuery({
    queryKey: ['node-info'],
    queryFn: () => api.node.getNodeInfo({}),
    staleTime: Infinity,
  });
  const maxChars = nodeInfoQuery.data?.socialCapabilities?.maxPostChars || 500;

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
    mutationFn: () =>
      api.post.createPost({
        clientRequestId: crypto.randomUUID(),
        body,
        linkUrl: '',
        visibility: PostVisibility.PUBLIC,
        inReplyToId: replyTo,
        mediaIds: uploads.filter((u) => u.status === 'ready').map((u) => u.mediaId),
        contentWarning: cwEnabled ? contentWarning : '',
        quotedPostId: '',
        communityId: '',
        quotePolicy: QuotePolicy.ANYONE,
      }),
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
      <h1>{replyTo ? 'Reply' : 'New post'}</h1>
      {submitError ? <p style={{ color: 'var(--danger)' }}>{submitError}</p> : null}
      <textarea
        className={styles['textarea']}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's happening?"
        autoFocus
      />
      <div className={styles['row']}>
        <span className={`${styles['counter']} ${body.length > maxChars ? styles['over'] : ''}`}>
          {body.length}/{maxChars}
        </span>
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
      <div className={styles['mediaList']}>
        {uploads.map((upload) => (
          <div className={styles['mediaItem']} key={upload.file.name + upload.file.lastModified}>
            <img src={URL.createObjectURL(upload.file)} alt="" />
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
          {mutation.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}
