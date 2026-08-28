import { describeError } from '@patches/client';
import { PostVisibility, QuotePolicy, type Actor, type Post } from '@patches/proto/es';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { api } from '../api/client.js';
import {
  AlertTriangleIcon,
  CloseIcon,
  ImageIcon,
  SparklesIcon,
} from '../components/icons/Icons.js';
import { MediaUploadPreview } from '../components/MediaUploadPreview.js';
import { MentionAutocomplete } from '../components/MentionAutocomplete.js';
import { RichBody } from '../components/RichBody.js';
import { useAbortableMutation } from '../hooks/useAbortableMutation.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useMentionQuery } from '../hooks/useMentionQuery.js';
import { useSession } from '../hooks/useSession.js';
import { uploadMedia, type MediaUploadHandle } from '../lib/mediaUpload.js';
import {
  applyMentionSelection,
  findMentionTrigger,
  type MentionTrigger,
} from '../lib/mentionTrigger.js';
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
  const session = useSession();
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
  // `@`-mention autocomplete (§219): `mentionTrigger` is non-null exactly when the caret sits
  // inside an in-progress `@query`; `mentionActiveIndex` is the keyboard-highlighted candidate.
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  // In-flight uploads' abort switches, keyed by the same `File` identity `uploads`
  // entries are matched on. Not reactive state on purpose — aborting doesn't itself
  // need a render, only the `uploads` update that follows it does (B-172).
  const uploadControllersRef = useRef(new Map<File, AbortController>());

  // Unmounting mid-upload (navigating away from /compose) must cancel every
  // still-running PUT rather than let it finish into a component that's gone (B-172).
  useEffect(() => {
    const controllers = uploadControllersRef.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
    };
  }, []);

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
      const controller = new AbortController();
      uploadControllersRef.current.set(file, controller);
      const handle: MediaUploadHandle = { mediaId: '', file, progress: 0, status: 'uploading' };
      setUploads((current) => [...current, handle]);
      uploadMedia(
        file,
        (fraction) => {
          setUploads((current) =>
            current.map((u) => (u.file === file ? { ...u, progress: fraction } : u)),
          );
        },
        { signal: controller.signal },
      )
        .then((mediaId) => {
          uploadControllersRef.current.delete(file);
          setUploads((current) =>
            current.map((u) => (u.file === file ? { ...u, mediaId, status: 'ready' } : u)),
          );
        })
        .catch((error: unknown) => {
          uploadControllersRef.current.delete(file);
          // A user-cancelled (or unmount-cancelled) upload is not a failure: no error
          // tile, no toast — just gone, same as if it had never been picked (B-172).
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setUploads((current) =>
            current.map((u) =>
              u.file === file ? { ...u, status: 'error', error: describeError(error).message } : u,
            ),
          );
        });
    }
  };

  /** Also the cancel button for a still-uploading tile: aborts the in-flight PUT (if
   * any) before dropping the tile, so cancelling never leaves a request running behind
   * a form that looks like it moved on (B-172). */
  const removeUpload = (index: number): void => {
    setUploads((current) => {
      const target = current[index];
      if (target) {
        uploadControllersRef.current.get(target.file)?.abort();
        uploadControllersRef.current.delete(target.file);
      }
      return current.filter((_, i) => i !== index);
    });
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

  // §219: recomputes whether the caret sits inside an in-progress `@query` — called after
  // every change/click/keyup that could move the caret, not only on typing, so arrow-key or
  // mouse caret moves close (or re-open) the dropdown the same way typing does.
  const updateMentionTrigger = (textarea: HTMLTextAreaElement, value: string): void => {
    const caret = textarea.selectionStart ?? value.length;
    setMentionTrigger(findMentionTrigger(value, caret));
    setMentionActiveIndex(0);
  };

  const debouncedMentionQuery = useDebouncedValue(mentionTrigger?.query ?? '', 200);
  const { candidates: mentionCandidates } = useMentionQuery(
    debouncedMentionQuery,
    session?.actor.id,
  );
  const mentionOpen = mentionTrigger !== null && mentionCandidates.length > 0;

  const selectMention = (actor: Actor): void => {
    const textarea = textareaRef.current;
    if (!textarea || mentionTrigger === null) return;
    const { text, caret } = applyMentionSelection(body, mentionTrigger, actor.handle);
    setBody(text);
    setMentionTrigger(null);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    }, 0);
  };

  // B-164: navigating away from `/compose` (e.g. the browser back button) before this
  // resolves must not later clear the draft and redirect out from under whatever screen
  // the viewer moved to — distinct from `uploadControllersRef`'s own abort-on-unmount
  // above, which only covers the media PUTs, not this post-create/edit call.
  const mutation = useAbortableMutation({
    mutationFn: async (_variables: void, signal): Promise<{ post?: Post | undefined }> => {
      const mediaIds = uploads.filter((u) => u.status === 'ready').map((u) => u.mediaId);
      if (editId !== '') {
        return await api.posts.editPost(
          {
            id: editId,
            body,
            contentWarning: cwEnabled ? contentWarning : '',
            mediaIds,
          },
          { signal },
        );
      }
      return await api.posts.createPost(
        {
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
        },
        { signal },
      );
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
        <div className={styles['textareaWrap']}>
          <textarea
            ref={textareaRef}
            className={styles['textarea']}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              updateMentionTrigger(e.target, e.target.value);
            }}
            onClick={(e) => updateMentionTrigger(e.currentTarget, e.currentTarget.value)}
            onKeyUp={(e) => {
              if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                updateMentionTrigger(e.currentTarget, e.currentTarget.value);
              }
            }}
            onKeyDown={(e) => {
              if (!mentionOpen) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionActiveIndex((i) => (i + 1) % mentionCandidates.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionActiveIndex(
                  (i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length,
                );
              } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const active = mentionCandidates[mentionActiveIndex];
                if (active) selectMention(active);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setMentionTrigger(null);
              }
            }}
            placeholder={replyTo ? 'Write a reply…' : "What's on your mind?"}
            autoFocus
          />
          {mentionOpen ? (
            <MentionAutocomplete
              candidates={mentionCandidates}
              activeIndex={mentionActiveIndex}
              onSelect={selectMention}
            />
          ) : null}
        </div>
      )}

      {/* Image previews */}
      {uploads.length > 0 ? (
        <div className={styles['mediaList']}>
          {uploads.map((upload, idx) => (
            <div className={styles['mediaItem']} key={idx}>
              <MediaUploadPreview file={upload.file} alt="" className={styles['mediaThumb']} />
              <button
                type="button"
                className={styles['mediaRemoveBtn']}
                onClick={() => removeUpload(idx)}
                aria-label={upload.status === 'uploading' ? 'Cancel upload' : 'Remove image'}
              >
                <CloseIcon size={14} />
              </button>
              {upload.status === 'uploading' ? (
                <div className={styles['uploadOverlay']}>
                  <span>{Math.round(upload.progress * 100)}%</span>
                </div>
              ) : null}
              {upload.status === 'error' ? (
                <div
                  className={`${styles['uploadOverlay']} ${styles['uploadError']}`}
                  title={upload.error}
                >
                  <span>{upload.error ?? 'Failed'}</span>
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
              onChange={(e) => {
                onFilesSelected(e.target.files);
                // Reset so picking the same file again (e.g. after removing a
                // failed upload) still fires `change` — `value` would otherwise
                // be unchanged and the browser would swallow the event.
                e.target.value = '';
              }}
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
