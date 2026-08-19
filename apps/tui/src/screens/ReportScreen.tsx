import { REPORT_REASON, type ReportReason } from '@patches/proto';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

/** What's being reported (spec §55: `ReportPost`/`ReportActor`). */
export type ReportTarget =
  { type: 'post'; id: string; label: string } | { type: 'actor'; id: string; label: string };

export interface ReportScreenProps {
  api: PatchesApi;
  target: ReportTarget;
  ensureAccessToken: () => Promise<string>;
  isActive: boolean;
  onCancel: () => void;
  onSubmitted: () => void;
  /**
   * Opens the shell's shared measured `ConfirmDialog` (P12-126). Filing a report is
   * irreversible from the reporter's side and puts a moderator's attention on someone,
   * so it goes through the same one component every other destructive action does. When
   * absent (a bare unit render) the report submits directly.
   */
  onConfirm?:
    | ((request: { id: string; title: string; body: string; onConfirm: () => void }) => void)
    | undefined;
}

const REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: REPORT_REASON.SPAM, label: 'Spam' },
  { value: REPORT_REASON.HARASSMENT, label: 'Harassment' },
  { value: REPORT_REASON.HATE_SPEECH, label: 'Hate speech' },
  { value: REPORT_REASON.ILLEGAL_CONTENT, label: 'Illegal content' },
  { value: REPORT_REASON.IMPERSONATION, label: 'Impersonation' },
  { value: REPORT_REASON.OTHER, label: 'Other' },
];

/** Details free-text bound — mirrors `ReportPostRequest`/`ReportActorRequest`'s own
 * "spec §58-style bound" comment in `moderation.proto`. */
const DETAILS_LIMIT = 2000;

type SendState =
  { status: 'idle' } | { status: 'sending' } | { status: 'error'; error: FriendlyError };

/**
 * `!` on a post row, or on a profile — a reason picker (`j`/`k`) plus optional free
 * text, explicit submit only (`Ctrl+S`, same convention as `ComposeScreen` — never a
 * silent Enter-submits). No user-facing API exposes internal moderator notes; this
 * screen only ever sends the reason enum plus the caller's own text (spec §55).
 */
export function ReportScreen({
  api,
  target,
  ensureAccessToken,
  isActive,
  onCancel,
  onSubmitted,
  onConfirm,
}: ReportScreenProps): ReactElement {
  const [selected, setSelected] = useState(0);
  const [details, setDetails] = useState('');
  const [send, setSend] = useState<SendState>({ status: 'idle' });

  async function submit(): Promise<void> {
    setSend({ status: 'sending' });
    const reason = REASONS[selected]?.value ?? REPORT_REASON.OTHER;
    try {
      const accessToken = await ensureAccessToken();
      if (target.type === 'post') {
        await api.reportPost({ postId: target.id, reason, details }, accessToken);
      } else {
        await api.reportActor({ actorId: target.id, reason, details }, accessToken);
      }
      onSubmitted();
    } catch (error) {
      setSend({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  /** `Ctrl+S` — through the shared confirm when the shell provides one. */
  function requestSubmit(): void {
    if (onConfirm === undefined) {
      void submit();
      return;
    }
    onConfirm({
      id: `report:${target.type}:${target.id}`,
      title: `Report ${target.label}?`,
      body: 'This node’s moderators will see this report and the text you wrote.',
      onConfirm: () => void submit(),
    });
  }

  useInput(
    (input, key) => {
      if (send.status === 'sending') return;
      if (key.escape) {
        onCancel();
        return;
      }
      if (key.ctrl && input === 's') {
        requestSubmit();
        return;
      }
      if (input === 'j' || key.downArrow) {
        setSelected((current) => Math.min(current + 1, REASONS.length - 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelected((current) => Math.max(current - 1, 0));
        return;
      }
      if (key.return || key.tab) return;
      if (key.backspace || key.delete) {
        setDetails((value) => value.slice(0, -1));
        return;
      }
      if (key.ctrl || key.meta) return;
      if (input.length > 0 && details.length < DETAILS_LIMIT) {
        setDetails((value) => value + input);
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>
        Report {target.type === 'post' ? 'post' : 'actor'}: {sanitizeForTerminal(target.label)}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {REASONS.map((reason, index) => (
          <Text
            key={reason.value}
            color={index === selected ? theme.accent : theme.muted}
            bold={index === selected}
          >
            {index === selected ? '› ' : '  '}
            {reason.label}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.muted}>details (optional)</Text>
        <Text wrap="wrap">
          {sanitizeForTerminal(details)}
          <Text color={theme.accent}>{send.status === 'sending' ? '' : '█'}</Text>
        </Text>
      </Box>
      {send.status === 'error' ? <Text color={theme.error}>{send.error.title}</Text> : null}
      <Box marginTop={1}>
        <Text color={theme.muted}>
          {send.status === 'sending' ? 'Sending…' : 'j/k reason · Ctrl+S submit · Esc cancel'}
        </Text>
      </Box>
    </Box>
  );
}
