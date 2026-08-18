import { present } from '../api/present.js';
import { POST_VISIBILITY, type Post } from '@patches/proto';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import type { ComposeDraft } from '../compose/draft-store.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

/** Post body limit (spec §58). */
export const POST_BODY_LIMIT = 5000;

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

/**
 * `c` — compose (spec §77). Multiline body, explicit submit only (`Ctrl+S` —
 * Enter always inserts a newline, never posts by accident), a running
 * character counter against the spec §58 body limit, and `Esc` that leaves
 * the draft exactly as it was rather than discarding it.
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
          mediaIds: [],
          // No content-warning UI yet (follow-up) — every post is created without one.
          contentWarning: '',
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
      if (send.status === 'sending') return;

      if (key.escape) {
        onCancel();
        return;
      }
      if (key.ctrl && input === 's') {
        void submit();
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
      // Anything else with a modifier (Ctrl+A attach is not implemented yet, etc.)
      // is ignored rather than inserted literally.
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
      {send.status === 'error' ? <Text color={theme.error}>{send.error.title}</Text> : null}
      <Text color={remaining < 0 ? theme.error : theme.muted}>
        {send.status === 'sending' ? 'Sending…' : `${draft.body.length}/${POST_BODY_LIMIT}`}
      </Text>
      <Text color={theme.muted}>Ctrl+S post · Esc keep draft &amp; leave</Text>
    </Box>
  );
}
