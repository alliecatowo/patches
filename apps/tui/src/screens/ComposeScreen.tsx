import { homedir } from 'node:os';
import { basename, sep } from 'node:path';

import { present } from '../api/present.js';
import { MAX_INPUT_BYTES } from '@patches/terminal-media';
import { MEDIA_STATUS, POST_VISIBILITY, QUOTE_POLICY, type Post } from '@patches/proto';
import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import {
  Autocomplete,
  findAutocompleteTrigger,
  insertAutocompleteSuggestion,
  type AutocompleteSource,
  type AutocompleteTrigger,
} from '../components/input/Autocomplete.js';
import { TextEditor } from '../components/input/TextEditor.js';
import { FilePicker } from '../components/pickers/FilePicker.js';
import type { ComposeDraft } from '../compose/draft-store.js';
import { detectPastedImagePaths } from '../compose/paste-attach.js';
import { extractMentions } from '../format/rich-text.js';
import { RichBody } from '../format/rich-text.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { InvalidAttachmentError, readLocalImage } from '../media/validate.js';
import { pollUntilReady, uploadMediaFile, type UploadProgress } from '../media/upload.js';
import { theme } from '../theme/index.js';
import { useContentSize } from '../app/layout.js';

/** Post body limit (spec §58) — the fallback used until `GetNodeInfo.limits` arrives. */
export const POST_BODY_LIMIT = 5000;

/** Attachments per post (spec §28). */
export const MAX_ATTACHMENTS = 4;

/** `bodyLength / limit` at which the counter turns `warn` (spec/interaction model §7). */
const COUNTER_WARN_RATIO = 0.9;

export type ComposeMode = 'compose' | 'edit';

type DraftAttachment = NonNullable<ComposeDraft['attachments']>[number];

export interface ComposeScreenProps {
  api: PatchesApi;
  /**
   * `'compose'` (default) creates a new post/reply/quote via `CreatePost`. `'edit'`
   * revises an existing post of the viewer's own via `EditPost` (P12-125) — the caller
   * (the shell's `E` route) is responsible for seeding `draft.body`/
   * `draft.contentWarning` from the post being edited before mounting this screen,
   * and for supplying `postId`.
   */
  mode?: ComposeMode;
  /** Required when `mode === 'edit'` — the post being revised. */
  postId?: string;
  /** Draft state is owned by `App` so it survives navigating away (spec §80). Quick-post
   * and full compose pass the same draft object, so they can never diverge (P12-023/106). */
  draft: ComposeDraft;
  onChange: (draft: ComposeDraft) => void;
  /** `Esc` — keeps the draft, just leaves the screen. */
  onCancel: () => void;
  /** Resolves a fresh access token, refreshing first if needed. */
  ensureAccessToken: () => Promise<string>;
  /** The post was created/edited; the draft is cleared by the caller. */
  onSubmitted: (post: Post) => void;
  isActive: boolean;
  /** Quick-post overlay presentation (P12-023/P12-106): tighter chrome, same draft and
   * editor as full compose — never a second copy of the editing logic. */
  compact?: boolean;
  /** Exact terminal-cell budget when the shell hosts this inside an overlay; falls back
   * to `useContentSize()` for the full-screen route. */
  rows?: number;
  columns?: number;
  /** `Ctrl+F` — the shell grows a quick-post overlay into the full compose screen,
   * keeping the one shared draft and cursor position (P12-106). Absent on the full route. */
  onExpand?: () => void;
  /** Lets the shell surface a toast without this screen depending on the toast component
   * directly (e.g. "Attached synth.jpg." after a paste-drop, P12-111). */
  onNotify?: (message: string, kind: 'success' | 'error' | 'info') => void;
}

type SendState =
  { status: 'idle' } | { status: 'sending' } | { status: 'error'; error: FriendlyError };

/** The attach sub-flow's own state — kept separate from `SendState` since a user can be
 * mid-attach without having attempted a send at all. */
type AttachState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'uploading'; path: string; progress: UploadProgress }
  | { status: 'error'; message: string };

type FocusField = 'body' | 'cw';

interface Suggestion {
  key: string;
  insertValue: string;
  label: string;
}

/** A synthetic `FriendlyError` for a client-side check that never reaches the network —
 * `code` mirrors `@grpc/grpc-js`'s `INVALID_ARGUMENT` (3) purely for shape consistency
 * with `describeGrpcError`'s output; nothing here talks to a socket. */
const OVER_LIMIT_ERROR: FriendlyError = {
  title: 'Over the character limit.',
  hint: 'Trim the body before sending.',
  retryable: false,
  code: 3,
};

/**
 * `c` (quick-post overlay) / `C` (full compose) — spec §77. A measured, cursor-aware
 * `TextEditor` (P12-012) replaces the old append-only string; explicit submit only
 * (`Ctrl+S` — Enter always inserts a newline, never posts by accident); a running
 * character counter against `GetNodeInfo.max_post_chars` (falling back to
 * `POST_BODY_LIMIT`); `Esc` leaves the draft exactly as it was rather than discarding it.
 *
 * `Ctrl+A` opens the terminal `FilePicker` (P12-014) in place of raw path entry;
 * pasting a local image path/`file://` URI/quoted path (or several, one per line) is
 * detected and attached directly rather than inserted as text (P12-111). `Ctrl+T`
 * toggles a single-line content-warning field; `Ctrl+O` swaps the editor for a live
 * `RichBody` preview of the markdown-lite source; `@`/`#` open the measured
 * `Autocomplete` popover (P12-013) over `SearchActors`/`SearchTags`. `Ctrl+F` (when the
 * caller supplies `onExpand`) grows a quick-post overlay into full compose without
 * losing the draft.
 */
export function ComposeScreen({
  api,
  mode = 'compose',
  postId,
  draft,
  onChange,
  onCancel,
  ensureAccessToken,
  onSubmitted,
  isActive,
  compact = false,
  rows,
  columns,
  onExpand,
  onNotify,
}: ComposeScreenProps): ReactElement {
  const content = useContentSize();
  const availableRows = rows ?? content.rows;
  const availableColumns = Math.max(20, columns ?? content.columns);
  const [send, setSend] = useState<SendState>({ status: 'idle' });
  const [attach, setAttach] = useState<AttachState>({ status: 'idle' });
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [cursor, setCursor] = useState(() => draft.body.length);
  const [dismissedTrigger, setDismissedTrigger] = useState<AutocompleteTrigger | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [forcedCursor, setForcedCursor] = useState<number | undefined>(undefined);
  const [cwOpen, setCwOpen] = useState(() => (draft.contentWarning ?? '').trim() !== '');
  const [focus, setFocus] = useState<FocusField>('body');
  const [previewOpen, setPreviewOpen] = useState(false);
  const attachments = draft.attachments ?? [];

  useEffect(() => {
    let cancelled = false;
    api
      .getNodeInfo()
      .then((info) => {
        // `limits` is an unset message field — `null` from proto-loader, `undefined` by
        // ts-proto's own type — `present()` checks both (see LEARNINGS).
        if (!cancelled && present(info.limits) && info.limits.postBodyMaxChars > 0) {
          setLimit(info.limits.postBodyMaxChars);
        }
      })
      .catch(() => {
        // A missing node-info round trip must never block composing — POST_BODY_LIMIT
        // below is the documented fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const effectiveLimit = limit ?? POST_BODY_LIMIT;
  const bodyLength = [...draft.body].length;

  const rawTrigger = useMemo(
    () => findAutocompleteTrigger(draft.body, cursor),
    [draft.body, cursor],
  );
  const trigger =
    rawTrigger !== null &&
    dismissedTrigger !== null &&
    dismissedTrigger.start === rawTrigger.start &&
    dismissedTrigger.end === rawTrigger.end
      ? null
      : rawTrigger;

  const suggestionSource = useMemo<AutocompleteSource<Suggestion> | null>(() => {
    if (trigger === null) return null;
    if (trigger.kind === 'mention') {
      return async (query) => {
        const response = await api.searchActors({ query, cursor: '', limit: 8 });
        return response.actors.map((actor) => ({
          key: actor.id,
          insertValue: actor.handle,
          label:
            actor.displayName === ''
              ? `@${actor.handle}`
              : `@${actor.handle}  ${actor.displayName}`,
        }));
      };
    }
    return async (query) => {
      const response = await api.searchTags({ query, cursor: '', limit: 8 });
      return response.tags.map((tag) => ({
        key: tag.id,
        insertValue: tag.name,
        label: `#${tag.name}`,
      }));
    };
  }, [api, trigger]);

  function acceptSuggestion(item: Suggestion): void {
    if (trigger === null) return;
    const applied = insertAutocompleteSuggestion(draft.body, trigger, item.insertValue, {
      maxChars: effectiveLimit,
    });
    if (applied === null) {
      setDismissedTrigger(trigger);
      return;
    }
    onChange({ ...draft, body: applied.value });
    setCursor(applied.cursor);
    setForcedCursor(applied.cursor);
    setEditorEpoch((value) => value + 1);
    setDismissedTrigger(null);
  }

  /** Validates, uploads, and polls one local file to `READY`, threading the "list this
   * attach is appending to" through explicitly (rather than closing over `attachments`)
   * so a multi-path paste (P12-111) can attach several files in one sequential pass
   * without each iteration reading a stale list from before the previous `onChange`. */
  async function attachOne(
    rawPath: string,
    baseAttachments: readonly DraftAttachment[],
  ): Promise<DraftAttachment[] | null> {
    const path = rawPath.trim();
    if (path === '') return [...baseAttachments];
    if (baseAttachments.length >= MAX_ATTACHMENTS) {
      setAttach({ status: 'error', message: `Up to ${String(MAX_ATTACHMENTS)} images per post.` });
      return null;
    }
    setAttach({ status: 'uploading', path, progress: { sentBytes: 0, totalBytes: 0 } });
    try {
      const local = await readLocalImage(path);
      const accessToken = await ensureAccessToken();
      const result = await uploadMediaFile(api, accessToken, local, (progress) => {
        setAttach({ status: 'uploading', path, progress });
      });
      const ready = await pollUntilReady(api, accessToken, result.mediaId);
      if (ready.status !== MEDIA_STATUS.READY) {
        throw new Error('That image failed to process.');
      }
      const next = [...baseAttachments, { mediaId: result.mediaId, fileName: basename(path) }];
      onChange({ ...draft, attachments: next });
      setAttach({ status: 'idle' });
      onNotify?.(`Attached ${basename(path)}.`, 'success');
      return next;
    } catch (error) {
      const message =
        error instanceof InvalidAttachmentError
          ? error.message
          : describeGrpcError(error, api.target).title;
      setAttach({ status: 'error', message });
      return null;
    }
  }

  async function attachFile(path: string): Promise<void> {
    await attachOne(path, attachments);
  }

  /** Attaches each pasted path in order, stopping at the first failure (whose message
   * is already surfaced via `attach.status === 'error'`). */
  async function attachPastedPaths(paths: readonly string[]): Promise<void> {
    let current: readonly DraftAttachment[] = attachments;
    for (const path of paths) {
      const next = await attachOne(path, current);
      if (next === null) return;
      current = next;
    }
  }

  /** Bracketed-paste attachment detection (P12-111, spec's drag-and-drop equivalent —
   * most terminals deliver a dropped file as a bracketed paste of its path). A
   * non-image paste (a URL, prose, anything ambiguous) always falls through to normal
   * text insertion; never interpolates a path into a shell. */
  function interceptPaste(pastedText: string): boolean {
    if (attach.status !== 'idle') return false;
    const paths = detectPastedImagePaths(pastedText);
    if (paths === null) return false;
    void attachPastedPaths(paths);
    return true;
  }

  function removeLastAttachment(): void {
    if (attachments.length === 0) return;
    onChange({ ...draft, attachments: attachments.slice(0, -1) });
  }

  async function submit(body = draft.body): Promise<void> {
    if (body.trim() === '') return;
    if ([...body].length > effectiveLimit) {
      setSend({ status: 'error', error: OVER_LIMIT_ERROR });
      return;
    }
    setSend({ status: 'sending' });
    try {
      const accessToken = await ensureAccessToken();
      if (mode === 'edit') {
        if (postId === undefined) throw new Error('Missing post id for edit.');
        const response = await api.editPost(
          {
            id: postId,
            body,
            contentWarning: draft.contentWarning ?? '',
            mediaIds: attachments.map((attachment) => attachment.mediaId),
          },
          accessToken,
        );
        setSend({ status: 'idle' });
        if (present(response.post)) onSubmitted(response.post);
        return;
      }
      const response = await api.createPost(
        {
          clientRequestId: draft.clientRequestId,
          body,
          linkUrl: '',
          visibility: POST_VISIBILITY.PUBLIC,
          inReplyToId: draft.inReplyToId ?? '',
          mediaIds: attachments.map((attachment) => attachment.mediaId),
          contentWarning: draft.contentWarning ?? '',
          quotedPostId: draft.quotedPostId ?? '',
          communityId: '',
          quotePolicy: QUOTE_POLICY.UNSPECIFIED,
        },
        accessToken,
      );
      setSend({ status: 'idle' });
      if (present(response.post)) onSubmitted(response.post);
    } catch (error) {
      setSend({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  useInput(
    (input, key) => {
      if (
        send.status === 'sending' ||
        attach.status === 'uploading' ||
        attach.status === 'picking'
      ) {
        return;
      }

      if (attach.status === 'error') {
        // Any key dismisses the error and returns to normal compose editing — the
        // keystroke itself is consumed, never also typed into the body.
        setAttach({ status: 'idle' });
        return;
      }

      const lowerInput = input.toLowerCase();

      if (key.ctrl && lowerInput === 'a') {
        setAttach({ status: 'picking' });
        return;
      }
      if (key.ctrl && lowerInput === 'x') {
        removeLastAttachment();
        return;
      }
      if (key.ctrl && lowerInput === 't') {
        const nextOpen = !cwOpen;
        setCwOpen(nextOpen);
        setFocus(nextOpen ? 'cw' : 'body');
        if (!nextOpen) onChange({ ...draft, contentWarning: '' });
        return;
      }
      if (key.ctrl && lowerInput === 'o') {
        setPreviewOpen((open) => !open);
        return;
      }
      if (key.ctrl && lowerInput === 'f') {
        onExpand?.();
        return;
      }
      if (key.tab && !key.shift && cwOpen && trigger === null) {
        setFocus((current) => (current === 'body' ? 'cw' : 'body'));
      }
    },
    { isActive },
  );

  const mentions = extractMentions(draft.body);
  const isReply = mode !== 'edit' && draft.inReplyToId !== undefined && draft.inReplyToId !== '';
  const isQuote = mode !== 'edit' && draft.quotedPostId !== undefined && draft.quotedPostId !== '';
  const overLimit = bodyLength > effectiveLimit;
  const nearLimit = !overLimit && bodyLength >= effectiveLimit * COUNTER_WARN_RATIO;
  const counterColor = overLimit ? theme.error : nearLimit ? theme.warn : theme.muted;
  const editorRows = Math.max(
    compact ? 2 : 4,
    Math.min(compact ? 6 : 8, availableRows - (compact ? 6 : 10)),
  );

  const bodyEditorActive =
    isActive &&
    send.status !== 'sending' &&
    attach.status === 'idle' &&
    !previewOpen &&
    focus === 'body';
  const cwEditorActive =
    isActive &&
    send.status !== 'sending' &&
    attach.status === 'idle' &&
    !previewOpen &&
    focus === 'cw';

  const hints = [
    `Ctrl+S ${mode === 'edit' ? 'save' : 'post'}`,
    'Ctrl+A attach',
    attachments.length > 0 ? 'Ctrl+X remove last' : null,
    `Ctrl+T ${cwOpen ? 'remove cw' : 'add cw'}`,
    `Ctrl+O ${previewOpen ? 'edit' : 'preview'}`,
    onExpand !== undefined ? 'Ctrl+F full compose' : null,
    'Esc keep draft & leave',
  ].filter((part): part is string => part !== null);

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>
        {mode === 'edit' ? 'Edit post' : isReply ? 'Reply' : isQuote ? 'Quote Post' : 'New Post'}
      </Text>
      {isReply ? (
        <Text color={theme.muted}>
          replying to @{sanitizeForTerminal(draft.replyingToHandle ?? '')}
        </Text>
      ) : null}
      {isQuote ? (
        <Text color={theme.muted}>
          quoting @{sanitizeForTerminal(draft.quotingHandle ?? 'unknown')}
        </Text>
      ) : null}
      <Box marginTop={1} marginBottom={1} flexDirection="column" flexShrink={0}>
        {previewOpen ? (
          <Box
            flexDirection="column"
            flexShrink={0}
            height={editorRows}
            width={availableColumns}
            overflow="hidden"
          >
            <RichBody text={draft.body} width={availableColumns} maxRows={editorRows} />
          </Box>
        ) : (
          <TextEditor
            key={`body-${String(editorEpoch)}`}
            value={draft.body}
            onChange={(body) => onChange({ ...draft, body })}
            columns={availableColumns}
            rows={editorRows}
            maxChars={effectiveLimit}
            isActive={bodyEditorActive}
            initialCursor={forcedCursor}
            onCursorChange={setCursor}
            onEscape={onCancel}
            onSubmit={(body) => void submit(body)}
            autocompleteOpen={trigger !== null}
            interceptPaste={interceptPaste}
            ariaLabel="Post body"
          />
        )}
      </Box>
      {trigger !== null && suggestionSource !== null ? (
        <Autocomplete<Suggestion>
          query={trigger.query}
          source={suggestionSource}
          getLabel={(item) => item.label}
          getKey={(item) => item.key}
          onAccept={acceptSuggestion}
          onClose={() => setDismissedTrigger(trigger)}
          columns={availableColumns}
          isActive={isActive && attach.status === 'idle' && !previewOpen}
          ariaLabel={trigger.kind === 'mention' ? 'Mention suggestions' : 'Tag suggestions'}
        />
      ) : null}
      {cwOpen ? (
        <Box marginBottom={1} flexDirection="column" flexShrink={0}>
          <Text color={theme.warn}>Content warning</Text>
          <TextEditor
            value={draft.contentWarning ?? ''}
            onChange={(contentWarning) => onChange({ ...draft, contentWarning })}
            columns={availableColumns}
            rows={1}
            maxChars={effectiveLimit}
            isActive={cwEditorActive}
            onEscape={onCancel}
            ariaLabel="Content warning"
          />
        </Box>
      ) : null}
      {mentions.length === 0 ? null : (
        // The server extracts `@handle` from the body and notifies those actors
        // (`post.service.ts`'s `MENTION_PATTERN`) — showing who that will be before
        // you press Ctrl+S means no surprise notifications.
        <Text color={theme.muted} wrap="truncate-end">
          mentions: {mentions.map((handle) => `@${handle}`).join(' ')}
        </Text>
      )}
      {attachments.length === 0 ? null : (
        <Box flexDirection="column" marginBottom={1} flexShrink={0}>
          {attachments.map((attachment, index) => (
            <Text key={attachment.mediaId} color={theme.muted}>
              [{index + 1}] {sanitizeForTerminal(attachment.fileName)}
            </Text>
          ))}
        </Box>
      )}
      {attach.status === 'picking' ? (
        <FilePicker
          initialPath={`${homedir()}${sep}`}
          allowedMimeTypes={['image/jpeg', 'image/png', 'image/webp']}
          maxBytes={MAX_INPUT_BYTES}
          rows={Math.max(8, Math.min(16, availableRows - 4))}
          columns={availableColumns}
          isActive={isActive}
          onCancel={() => setAttach({ status: 'idle' })}
          onSelect={(path) => {
            setAttach({ status: 'idle' });
            void attachFile(path);
          }}
        />
      ) : null}
      {attach.status === 'uploading' ? (
        <Text color={theme.muted}>{uploadLabel(attach)}</Text>
      ) : null}
      {attach.status === 'error' ? (
        <Text color={theme.error}>{sanitizeForTerminal(attach.message)}</Text>
      ) : null}
      {send.status === 'error' ? <Text color={theme.error}>{send.error.title}</Text> : null}
      <Text color={send.status === 'sending' ? theme.muted : counterColor}>
        {send.status === 'sending' ? 'Sending…' : `${String(bodyLength)}/${String(effectiveLimit)}`}
      </Text>
      <Text color={theme.muted}>{hints.join(' · ')}</Text>
    </Box>
  );
}

function uploadLabel(state: { path: string; progress: UploadProgress }): string {
  const name = basename(state.path);
  if (state.progress.totalBytes === 0) return `Uploading ${name}…`;
  const percent = Math.round((state.progress.sentBytes / state.progress.totalBytes) * 100);
  return `Uploading ${name}… ${String(percent)}%`;
}
