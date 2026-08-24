import { useState, type ReactElement } from 'react';
import { Box, Text, useInput } from 'ink';

import type { DiagnosticsBundle } from '@patches/domain';

import { useContentSize } from '../app/layout.js';
import { getDiagnosticsReporter, buildTuiDiagnosticsBundle } from '../diagnostics/reporter.js';
import { resolveReportUrl } from '../diagnostics/report-endpoint.js';
import { submitIssueReport } from '../diagnostics/submit.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { TextEditor } from '../components/input/TextEditor.js';
import { theme } from '../theme/index.js';

export const DESCRIPTION_MAX_CHARS = 2_000;

export interface IssueReportScreenProps {
  env: NodeJS.ProcessEnv;
  nodeDomain: string;
  /** Signed-in handle — attached only when the user opts in below (privacy-first). */
  sessionHandle?: string | undefined;
  /**
   * Capability snapshot, taken at submit time (never during render — the vault answer
   * lives behind a ref only event handlers may read).
   */
  capabilities?: (() => Record<string, boolean>) | undefined;
  isActive: boolean;
  onCancel: () => void;
  /** Shell toast — success/failure are also drawn inline when absent (bare renders). */
  onNotify?: ((message: string, kind?: 'info' | 'error' | 'success') => void) | undefined;
}

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'filed'; issueNumber: number; issueUrl: string }
  | { status: 'fallback'; bundlePath: string; issuesUrl: string; reason: string };

/**
 * `!` / `:report` — the beta issue reporter (B-112). Optional free-text description,
 * an opt-in "include my @handle" toggle that is OFF by default, and everything else is
 * automatic: a redacted diagnostics bundle (B-113 schema) built by the shared
 * `@patches/domain` path and POSTed to the issues-ingest Worker. Zero input still
 * files a full-context report. Reachable from every screen (`!` is a shell global;
 * text-entry screens excepted), because reporting is not only for hard failures —
 * bugs, jank and feature ideas all belong here.
 *
 * When the endpoint is unreachable the bundle JSON is written to a local file and its
 * path plus the project's issues URL are shown for manual attach — the report is
 * never silently lost.
 */
export function IssueReportScreen({
  env,
  nodeDomain,
  sessionHandle,
  capabilities,
  isActive,
  onCancel,
  onNotify,
}: IssueReportScreenProps): ReactElement {
  const content = useContentSize();
  const [description, setDescription] = useState('');
  const [includeHandle, setIncludeHandle] = useState(false);
  const [focus, setFocus] = useState<'description' | 'handle'>('description');
  const [send, setSend] = useState<SendState>({ status: 'idle' });

  // Tab moves focus between the description editor and the opt-in handle row (the same
  // form affordance the web modal has). While the handle row is focused, Space/x flips
  // it; Esc always cancels; Ctrl+S submits from either row.
  useInput(
    (input, key) => {
      if (send.status === 'sending') return;
      if (key.tab) {
        setFocus((current) => (current === 'description' ? 'handle' : 'description'));
        return;
      }
      if (focus === 'handle') {
        if (key.escape) {
          onCancel();
          return;
        }
        if (key.ctrl && input === 's') {
          void submit();
          return;
        }
        if (input === ' ' || input === 'x') setIncludeHandle((current) => !current);
      }
    },
    { isActive },
  );

  async function submit(): Promise<void> {
    const optedInHandle =
      includeHandle && sessionHandle !== undefined && sessionHandle !== ''
        ? sessionHandle.startsWith('@')
          ? sessionHandle
          : `@${sessionHandle}`
        : undefined;
    if (optedInHandle === undefined) {
      getDiagnosticsReporter().recordBreadcrumb('report', 'handle not attached (opt-in)');
    }
    if (capabilities !== undefined) {
      getDiagnosticsReporter().setCapabilities(capabilities());
    }
    const bundle: DiagnosticsBundle = buildTuiDiagnosticsBundle({
      nodeDomain,
      ...(optedInHandle === undefined ? {} : { sessionHandle: optedInHandle }),
      notes: 'filed from the in-app reporter (! / :report)',
    });
    setSend({ status: 'sending' });
    const outcome = await submitIssueReport({
      url: resolveReportUrl(env),
      description,
      bundle,
    });
    if (outcome.kind === 'filed') {
      setSend({ status: 'filed', issueNumber: outcome.issueNumber, issueUrl: outcome.issueUrl });
      onNotify?.(`Issue filed: #${String(outcome.issueNumber)} — thank you!`, 'success');
    } else {
      setSend({
        status: 'fallback',
        bundlePath: outcome.bundlePath,
        issuesUrl: outcome.issuesUrl,
        reason: outcome.reason,
      });
      onNotify?.('Could not reach the report endpoint — bundle saved locally.', 'error');
    }
  }

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text color={theme.accent}>Report an issue</Text>
      <Text color={theme.muted}>
        A redacted diagnostics bundle (app version, node address, recent errors as status codes
        only, navigation trail, last screen text) is attached automatically. Message contents are
        never included.
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.muted}>
          what happened — a bug, something janky, or an idea? (optional)
        </Text>
        <TextEditor
          value={description}
          onChange={setDescription}
          columns={Math.max(20, content.columns - 2)}
          rows={4}
          maxChars={DESCRIPTION_MAX_CHARS}
          isActive={isActive && focus === 'description' && send.status !== 'sending'}
          ariaLabel="Issue description"
          onEscape={onCancel}
          onSubmit={() => void submit()}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text
          color={includeHandle ? theme.accent : focus === 'handle' ? theme.text : theme.muted}
          bold={focus === 'handle'}
        >
          {`${focus === 'handle' ? '›' : ' '} [${includeHandle ? 'x' : ' '}] include my @handle`}
          {sessionHandle === undefined || sessionHandle === ''
            ? ' — signed out'
            : ` — @${sanitizeForTerminal(sessionHandle.replace(/^@/u, ''))}`}
        </Text>
      </Box>
      {send.status === 'sending' ? <Text color={theme.muted}>Sending…</Text> : null}
      {send.status === 'filed' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.ok}>{`Issue #${send.issueNumber} filed — thank you!`}</Text>
          <Text color={theme.muted} wrap="truncate-end">
            {send.issueUrl}
          </Text>
        </Box>
      ) : null}
      {send.status === 'fallback' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.error}>Could not send ({sanitizeForTerminal(send.reason)}).</Text>
          {send.bundlePath === '' ? null : (
            <Text wrap="truncate-end">Bundle saved: {sanitizeForTerminal(send.bundlePath)}</Text>
          )}
          <Text color={theme.muted}>Attach it manually at {send.issuesUrl}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={theme.muted}>Ctrl+S send · Tab focus · space toggle handle · Esc cancel</Text>
      </Box>
    </Box>
  );
}
