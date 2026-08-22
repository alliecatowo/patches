import { describeError } from '@patches/client';
import { PostVisibility, QuotePolicy, type Post } from '@patches/proto/es';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { api } from '../api/client.js';
import {
  AlertTriangleIcon,
  CloseIcon,
  ImageIcon,
  SparklesIcon,
} from '../components/icons/Icons.js';
import { RichBody } from '../components/RichBody.js';
import { uploadMedia, type MediaUploadHandle } from '../lib/mediaUpload.js';
import styles from './ComposeRoute.module.css';

const MAX_MEDIA = 4;

function getDraftKey(editId: string, quoteId: string, replyTo: string): string {
  if (editId) return `patches.web.draft.edit.${editId}`;
  if (quoteId) return `patches.web.draft.quote.${quoteId}`;
  if (replyTo) return `patches.web.draft.reply.${replyTo}`;
  return 'patches.web.draft.root';
}

interface StoredDraft {
  body: string;
  cwEnabled: boolean;
  contentWarning: string;
}

function loadInitialDraft(draftKey: string, editId: string): StoredDraft {
  if (editId !== '' || typeof window === 'undefined') {
    return { body: '', cwEnabled: false, contentWarning: '' };
  }
  try {
    const raw = window.localStorage.getItem(draftKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredDraft>;
      return {
        body: parsed.body ?? '',
        cwEnabled: parsed.cwEnabled ?? false,
        contentWarning: parsed.contentWarning ?? '',
      };
    }
  } catch {
    // Storage inaccessible
  }
  return { body: '', cwEnabled: false, contentWarning: '' };
}

/**
 * `/compose` — text (+ up to 4 images uploaded direct to R2) and content warning.
 * Enhanced with draft auto-save, mobile formatting toolbar, and radial character counter.
 */
export function ComposeRoute(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const replyTo = params.get('replyTo') ?? '';
  const quoteId = params.get('quote') ?? '';
  const editId = params.get('edit') ?? '';

  const draftKey = getDraftKey(editId, quoteId, replyTo);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [initialDraft] = useState(() => loadInitialDraft(draftKey, editId));
  const [body, setBody] = useState(initialDraft.body);
  const [cwEnabled, setCwEnabled] = useState(initialDraft.cwEnabled);
  const [contentWarning, setContentWarning] = useState(initialDraft.contentWarning);
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

  const replyToPostQuery = useQuery({
    queryKey: ['post', replyTo],
    queryFn: () => api.posts.getPost({ id: replyTo }),
    enabled: replyTo !== '',
  });

  const editingPostQuery = useQuery({
    queryKey: ['post', editId],
    queryFn: () => api.posts.getPost({ id: editId }),
    enabled: editId !== '',
  });

  // Auto-save draft changes to localStorage
  useEffect(() => {
    if (editId === '') {
      try {
        if (body.trim() === '' && contentWarning.trim() === '') {
          window.localStorage.removeItem(draftKey);
        } else {
          window.localStorage.setItem(
            draftKey,
            JSON.stringify({ body, cwEnabled, contentWarning }),
          );
        }
      } catch {
        // Storage inaccessible
      }
    }
  }, [body, cwEnabled, contentWarning, draftKey, editId]);

  // Seed form from editing post
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

  const removeUpload = (index: number): void => {
    setUploads((current) => current.filter((_, i) => i !== index));
  };

  const insertMarkdown = (prefix: string, suffix: string = ''): void => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.slice(start, end);

    const newText = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
    setBody(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
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
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Storage inaccessible
      }
      if (response.post) void navigate(`/p/${response.post.id}`);
      else void navigate('/');
    },
    onError: (error: unknown) => setSubmitError(describeError(error).message),
  });

  const uploading = uploads.some((u) => u.status === 'uploading');
  const canSubmit =
    body.trim() !== '' && body.length <= maxChars && !uploading && !mutation.isPending;

  const charFraction = Math.min(body.length / maxChars, 1);
  const strokeDashoffset = 100 - charFraction * 100;
  const isNearLimit = body.length > maxChars * 0.85;
  const isOverLimit = body.length > maxChars;

  return (
    <div className={styles['wrap']}>
      <div className={styles['header']}>
        <h1>{editId ? 'Edit post' : quoteId ? 'Quote' : replyTo ? 'Reply' : 'New post'}</h1>
        <button
          type="button"
          className={styles['previewToggle']}
          onClick={() => setPreview((p) => !p)}
        >
          <SparklesIcon size={16} />
          <span>{preview ? 'Edit' : 'Preview'}</span>
        </button>
      </div>

      {submitError ? (
        <div className={styles['errorBanner']} role="alert">
          <AlertTriangleIcon size={16} />
          <span>{submitError}</span>
        </div>
      ) : null}

      {quoteId !== '' && quotedPostQuery.data?.post ? (
        <div className={styles['quotedPostBox']}>
          <strong>@{quotedPostQuery.data.post.author?.handle}</strong>
          <p>{quotedPostQuery.data.post.body}</p>
        </div>
      ) : null}

      {replyTo !== '' && replyToPostQuery.data?.post ? (
        <div className={styles['quotedPostBox']}>
          <span>
            Replying to <strong>@{replyToPostQuery.data.post.author?.handle}</strong>
          </span>
          <p>{replyToPostQuery.data.post.body}</p>
        </div>
      ) : null}

      {cwEnabled ? (
        <div className={styles['cwInputWrap']}>
          <input
            className={styles['cwInput']}
            value={contentWarning}
            onChange={(e) => setContentWarning(e.target.value)}
            placeholder="Content warning description…"
            aria-label="Content warning description"
          />
          <button
            type="button"
            className={styles['cwCloseBtn']}
            onClick={() => {
              setCwEnabled(false);
              setContentWarning('');
            }}
            aria-label="Remove content warning"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ) : null}

      {preview ? (
        <div className={styles['previewBox']}>
          <RichBody source={body || '*Nothing to preview yet.*'} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className={styles['textarea']}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyTo ? 'Write a reply…' : "What's on your mind?"}
          autoFocus
        />
      )}

      {/* Image previews */}
      {uploads.length > 0 ? (
        <div className={styles['mediaList']}>
          {uploads.map((upload, idx) => (
            <div className={styles['mediaItem']} key={idx}>
              <img
                src={upload.file.size > 0 ? URL.createObjectURL(upload.file) : ''}
                alt=""
                className={styles['mediaThumb']}
              />
              <button
                type="button"
                className={styles['mediaRemoveBtn']}
                onClick={() => removeUpload(idx)}
                aria-label="Remove image"
              >
                <CloseIcon size={14} />
              </button>
              {upload.status === 'uploading' ? (
                <div className={styles['uploadOverlay']}>
                  <span>{Math.round(upload.progress * 100)}%</span>
                </div>
              ) : null}
              {upload.status === 'error' ? (
                <div className={`${styles['uploadOverlay']} ${styles['uploadError']}`}>
                  <span>Failed</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Action Toolbar */}
      <div className={styles['toolbar']}>
        <div className={styles['tools']}>
          <label
            className={`${styles['toolBtn']} ${uploads.length >= MAX_MEDIA ? styles['disabled'] : ''}`}
            title="Attach images (up to 4)"
          >
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploads.length >= MAX_MEDIA}
              style={{ display: 'none' }}
              onChange={(e) => onFilesSelected(e.target.files)}
            />
            <ImageIcon size={18} />
            <span className={styles['badge']}>{uploads.length > 0 ? uploads.length : ''}</span>
          </label>

          <button
            type="button"
            className={`${styles['toolBtn']} ${cwEnabled ? styles['activeTool'] : ''}`}
            onClick={() => setCwEnabled((v) => !v)}
            title="Toggle content warning"
          >
            <AlertTriangleIcon size={18} />
            <span>CW</span>
          </button>

          <div className={styles['divider']} />

          <button
            type="button"
            className={styles['formatBtn']}
            onClick={() => insertMarkdown('**', '**')}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={styles['formatBtn']}
            onClick={() => insertMarkdown('*', '*')}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={styles['formatBtn']}
            onClick={() => insertMarkdown('`', '`')}
            title="Code"
          >
            <code>`</code>
          </button>
          <button
            type="button"
            className={styles['formatBtn']}
            onClick={() => insertMarkdown('> ')}
            title="Quote"
          >
            &gt;
          </button>
          <button
            type="button"
            className={styles['formatBtn']}
            onClick={() => insertMarkdown('#')}
            title="Tag"
          >
            #
          </button>
          <button
            type="button"
            className={styles['formatBtn']}
            onClick={() => insertMarkdown('@')}
            title="Mention"
          >
            @
          </button>
        </div>

        <div className={styles['submitRow']}>
          {/* Radial progress character counter */}
          <div className={styles['counterWrap']}>
            <svg className={styles['ringSvg']} width="26" height="26" viewBox="0 0 36 36">
              <path
                className={styles['ringBg']}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={`${styles['ringProgress']} ${
                  isOverLimit
                    ? styles['ringDanger']
                    : isNearLimit
                      ? styles['ringWarn']
                      : styles['ringAccent']
                }`}
                strokeDasharray="100, 100"
                strokeDashoffset={strokeDashoffset}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            {isNearLimit || isOverLimit ? (
              <span className={`${styles['charCount']} ${isOverLimit ? styles['overLimit'] : ''}`}>
                {maxChars - body.length}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            className={styles['submitBtn']}
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Posting…' : editId ? 'Save' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
