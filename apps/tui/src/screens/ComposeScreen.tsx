import { basename } from 'node:path';

import { present } from '../api/present.js';
import { MEDIA_STATUS, POST_VISIBILITY, QUOTE_POLICY, type Post } from '@patches/proto';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import type { ComposeDraft } from '../compose/draft-store.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { InvalidAttachmentError, readLocalImage } from '../media/validate.js';
import { pollUntilReady, uploadMediaFile, type UploadProgress } from '../media/upload.js';
import { theme } from '../theme/index.js';

/** Post body limit (spec §58). */
export const POST_BODY_LIMIT = 5000;

/** Attachments per post (spec §28). */
export const MAX_ATTACHMENTS = 4;

export interface ComposeScreenProps {
  api: PatchesApi;
  /** Draft state is owned by `App` so it survives navigating away (spec §80). */
  draft: ComposeDraft;
  onChange: (draft: ComposeDraft) => void;
  /** `Esc` — keeps the draft, just leaves the screen. */
  onCancel: () => void;
  /** Resolves a fresh access token, refreshing first if needed. */
  ensureAccessToken: () => Promise<string>;
  /** The post was created; the draft is cleared by the caller. */
  onSubmitted: (post: Post) => void;
  isActive: boolean;
}

type SendState =
  { status: 'idle' } | { status: 'sending' } | { status: 'error'; error: FriendlyError };

/** The attach sub-flow's own state — kept separate from `SendState` since a user can
 * be mid-attach without having attempted a send at all. */
type AttachState =
  | { status: 'idle' }
  | { status: 'entering'; path: string }
  | { status: 'uploading'; path: string; progress: UploadProgress }
  | { status: 'error'; message: string };

/**
 * `c` — compose (spec §77). Multiline body, explicit submit only (`Ctrl+S` —
 * Enter always inserts a newline, never posts by accident), a running
 * character counter against the spec §58 body limit, and `Esc` that leaves
 * the draft exactly as it was rather than discarding it.
 *
 * `Ctrl+A` — attach an image by local file path (spec §30, §77): validates
 * (`readLocalImage`), uploads (`BeginMediaUpload` → PUT → `FinalizeMediaUpload`,
 * spec §139's progress), then polls until the worker reports `READY` before
 * adding it to the draft — a post is never created referencing a still-processing
 * or failed media id.
 */
export function ComposeScreen({
  api,
  draft,
  onChange,
  onCancel,
  ensureAccessToken,
  onSubmitted,
  isActive,
}: ComposeScreenProps): ReactElement {
  const [send, setSend] = useState<SendState>({ status: 'idle' });
  const [attach, setAttach] = useState<AttachState>({ status: 'idle' });
  const attachments = draft.attachments ?? [];

  async function submit(): Promise<void> {
    if (draft.body.trim() === '') return;
    setSend({ status: 'sending' });
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.createPost(
        {
          clientRequestId: draft.clientRequestId,
          body: draft.body,
          linkUrl: '',
          visibility: POST_VISIBILITY.PUBLIC,
          inReplyToId: draft.inReplyToId ?? '',
          mediaIds: attachments.map((attachment) => attachment.mediaId),
          // No content-warning UI yet (follow-up) — every post is created without one.
          contentWarning: '',
          // No quote/community compose UI yet (Amendment B, P11-00x follow-up).
          quotedPostId: '',
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

  /** Validates, uploads, and polls one local file to `READY` before adding it to the
   * draft — never adds a media id the server hasn't confirmed is usable yet. */
  async function attachFile(rawPath: string): Promise<void> {
    const path = rawPath.trim();
    if (path === '') {
      setAttach({ status: 'idle' });
      return;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      setAttach({ status: 'error', message: `Up to ${String(MAX_ATTACHMENTS)} images per post.` });
      return;
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
      onChange({
        ...draft,
        attachments: [...attachments, { mediaId: result.mediaId, fileName: basename(path) }],
      });
      setAttach({ status: 'idle' });
    } catch (error) {
      const message =
        error instanceof InvalidAttachmentError
          ? error.message
          : describeGrpcError(error, api.target).title;
      setAttach({ status: 'error', message });
    }
  }

  function removeLastAttachment(): void {
    if (attachments.length === 0) return;
    onChange({ ...draft, attachments: attachments.slice(0, -1) });
  }

  useInput(
    (input, key) => {
      if (send.status === 'sending' || attach.status === 'uploading') return;

      if (attach.status === 'entering') {
        if (key.escape) {
          setAttach({ status: 'idle' });
          return;
        }
        if (key.return) {
          void attachFile(attach.path);
          return;
        }
        if (key.backspace || key.delete) {
          setAttach({ status: 'entering', path: attach.path.slice(0, -1) });
          return;
        }
        if (key.ctrl || key.meta || key.tab) return;
        if (input.length > 0) setAttach({ status: 'entering', path: attach.path + input });
        return;
      }

      if (attach.status === 'error') {
        // Any key dismisses the error and returns to normal compose editing — the
        // keystroke itself is consumed, never also typed into the body.
        setAttach({ status: 'idle' });
        return;
      }

      if (key.escape) {
        onCancel();
        return;
      }
      if (key.ctrl && input === 's') {
        void submit();
        return;
      }
      if (key.ctrl && input === 'a') {
        setAttach({ status: 'entering', path: '' });
        return;
      }
      if (key.ctrl && input === 'x') {
        removeLastAttachment();
        return;
      }
      if (key.return) {
        onChange({ ...draft, body: `${draft.body}\n` });
        return;
      }
      if (key.backspace || key.delete) {
        onChange({ ...draft, body: draft.body.slice(0, -1) });
        return;
      }
      // Anything else with a modifier is ignored rather than inserted literally.
      if (key.ctrl || key.meta || key.tab) return;
      if (input.length > 0 && draft.body.length < POST_BODY_LIMIT) {
        onChange({ ...draft, body: draft.body + input });
      }
    },
    { isActive },
  );

  const remaining = POST_BODY_LIMIT - draft.body.length;
  const isReply = draft.inReplyToId !== undefined && draft.inReplyToId !== '';

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>{isReply ? 'Reply' : 'New Post'}</Text>
      {isReply ? (
        <Text color={theme.muted}>
          replying to @{sanitizeForTerminal(draft.replyingToHandle ?? '')}
        </Text>
      ) : null}
      <Box marginTop={1} marginBottom={1} flexDirection="column">
        <Text wrap="wrap">
          {draft.body}
          <Text color={theme.accent}>{send.status === 'sending' ? '' : '█'}</Text>
        </Text>
      </Box>
      {attachments.length === 0 ? null : (
        <Box flexDirection="column" marginBottom={1}>
          {attachments.map((attachment, index) => (
            <Text key={attachment.mediaId} color={theme.muted}>
              [{index + 1}] {sanitizeForTerminal(attachment.fileName)}
            </Text>
          ))}
        </Box>
      )}
      {attach.status === 'entering' ? (
        <Text>
          Attach path: {sanitizeForTerminal(attach.path)}
          <Text color={theme.accent}>█</Text>
        </Text>
      ) : null}
      {attach.status === 'uploading' ? (
        <Text color={theme.muted}>{uploadLabel(attach)}</Text>
      ) : null}
      {attach.status === 'error' ? (
        <Text color={theme.error}>{sanitizeForTerminal(attach.message)}</Text>
      ) : null}
      {send.status === 'error' ? <Text color={theme.error}>{send.error.title}</Text> : null}
      <Text color={remaining < 0 ? theme.error : theme.muted}>
        {send.status === 'sending' ? 'Sending…' : `${draft.body.length}/${POST_BODY_LIMIT}`}
      </Text>
      <Text color={theme.muted}>
        Ctrl+S post · Ctrl+A attach{attachments.length > 0 ? ' · Ctrl+X remove last' : ''} · Esc
        keep draft &amp; leave
      </Text>
    </Box>
  );
}

function uploadLabel(state: { path: string; progress: UploadProgress }): string {
  const name = basename(state.path);
  if (state.progress.totalBytes === 0) return `Uploading ${name}…`;
  const percent = Math.round((state.progress.sentBytes / state.progress.totalBytes) * 100);
  return `Uploading ${name}… ${String(percent)}%`;
}
