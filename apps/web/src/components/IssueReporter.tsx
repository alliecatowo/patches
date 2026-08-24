import { useEffect, useState, type JSX } from 'react';
import { useLocation } from 'react-router-dom';

import { useSession } from '../hooks/useSession.js';
import {
  buildWebDiagnosticsBundle,
  installGlobalCollectors,
  recordRoute,
} from '../lib/diagnosticsReporter.js';
import { captureScreenshotDataUrl } from '../lib/screenshot.js';
import styles from './IssueReporter.module.css';

export const DEFAULT_REPORT_URL = 'https://patches-issues-ingest.alliecatowo.workers.dev/';

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'filed'; issueNumber: number; issueUrl: string }
  | { status: 'fallback'; downloadName: string; reason: string };

export interface IssueReporterProps {
  /** `floating` = bottom-corner chip (error screens); `inline` = Settings entry. */
  variant?: 'floating' | 'inline';
}

/**
 * The web beta issue reporter (B-112): a low-friction "Report an issue" affordance
 * whose modal takes an optional description, an opt-in user-granted screenshot
 * (`getDisplayMedia` — nothing is captured without the browser's own permission
 * prompt), and an opt-in @handle that is OFF by default. Everything else is automatic:
 * a redacted diagnostics bundle built through the shared `@patches/domain` schema.
 *
 * When the ingest endpoint is unreachable, the bundle downloads as a JSON file for
 * manual attach at {@link ISSUES_REPO_URL} — the report is never silently lost.
 */
export function IssueReporter({ variant = 'floating' }: IssueReporterProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Automatic breadcrumbs: route changes while mounted, plus the global window/
  // console-error collectors (installed once, first mount wins).
  useEffect(() => {
    installGlobalCollectors();
    recordRoute(location.pathname);
  }, [location.pathname]);

  return (
    <>
      <button
        type="button"
        className={variant === 'floating' ? styles['chip'] : styles['navEntry']}
        onClick={() => setOpen(true)}
      >
        Report an issue
      </button>
      {open ? <IssueReportModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function IssueReportModal({ onClose }: { onClose: () => void }): JSX.Element {
  const session = useSession();
  const [description, setDescription] = useState('');
  const [includeHandle, setIncludeHandle] = useState(false);
  const [screenshot, setScreenshot] = useState<string | undefined>(undefined);
  const [screenshotNote, setScreenshotNote] = useState<string | undefined>(undefined);
  const [state, setState] = useState<SubmitState>({ status: 'idle' });

  async function captureScreenshot(): Promise<void> {
    setScreenshotNote(undefined);
    const result = await captureScreenshotDataUrl();
    if ('dataUrl' in result) {
      setScreenshot(result.dataUrl);
      setScreenshotNote(`screenshot attached (${Math.round(result.dataUrl.length / 1024)} KiB)`);
    } else {
      setScreenshot(undefined);
      setScreenshotNote(
        result.reason === 'unsupported'
          ? 'screenshots are not supported in this browser'
          : result.reason === 'denied'
            ? 'screen capture was cancelled'
            : 'screenshot was too large to attach',
      );
    }
  }

  async function submit(): Promise<void> {
    setState({ status: 'submitting' });
    const bundle = buildWebDiagnosticsBundle({
      sessionHandle:
        includeHandle && session !== null
          ? session.actor.handle.startsWith('@')
            ? session.actor.handle
            : `@${session.actor.handle}`
          : undefined,
      screenshotDataUrl: screenshot,
    });
    try {
      const response = await fetch(reportUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: description || undefined, bundle }),
      });
      if (!response.ok) throw new Error(`report endpoint returned ${String(response.status)}`);
      const payload = (await response.json()) as { number?: number; url?: string };
      if (typeof payload.number !== 'number' || typeof payload.url !== 'string') {
        throw new Error('unexpected response from report endpoint');
      }
      setState({ status: 'filed', issueNumber: payload.number, issueUrl: payload.url });
    } catch (error) {
      fallbackDownload(bundle);
      setState({
        status: 'fallback',
        downloadName: 'patches-report.json',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-issue-title"
      >
        <h2 id="report-issue-title" className={styles.title}>
          Report an issue
        </h2>
        <p className={styles.hint}>
          Sends a redacted diagnostics bundle — app version, node, recent errors as status codes
          only, navigation trail. Message contents are never included.
        </p>

        <label className={styles.label} htmlFor="report-issue-description">
          What happened? (optional)
        </label>
        <textarea
          id="report-issue-description"
          className={styles.textarea}
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
        />

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => void captureScreenshot()}
          >
            {screenshot === undefined ? 'Attach screenshot' : 'Reattach screenshot'}
          </button>
          {screenshotNote === undefined ? null : (
            <span className={styles.note}>{screenshotNote}</span>
          )}
        </div>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={includeHandle}
            onChange={(event) => setIncludeHandle(event.target.checked)}
          />
          include my @{session === null ? '' : `${session.actor.handle}`} (off by default)
        </label>

        {state.status === 'submitting' ? <p className={styles.note}>Sending…</p> : null}
        {state.status === 'filed' ? (
          <p className={styles.success}>
            Thank you — filed as{' '}
            <a href={state.issueUrl} target="_blank" rel="noopener noreferrer">
              issue #{String(state.issueNumber)}
            </a>
            .
          </p>
        ) : null}
        {state.status === 'fallback' ? (
          <div className={styles.failure}>
            <p>Could not reach the report endpoint ({state.reason}).</p>
            <p>
              The bundle was saved as <code>{state.downloadName}</code> in your downloads — attach
              it manually at{' '}
              <a
                href="https://github.com/alliecatowo/patches/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/alliecatowo/patches/issues
              </a>
              .
            </p>
          </div>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={state.status === 'submitting'}
            onClick={() => void submit()}
          >
            Send report
          </button>
          <button type="button" className={styles.controlButton} onClick={() => onClose()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function reportUrl(): string {
  // Build-time override via Vite env; otherwise the deployed issues-ingest Worker.
  const override: unknown = import.meta.env['VITE_PATCHES_REPORT_URL'];
  return typeof override === 'string' && override !== '' ? override : DEFAULT_REPORT_URL;
}

function fallbackDownload(bundle: ReturnType<typeof buildWebDiagnosticsBundle>): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'patches-report.json';
  anchor.click();
  URL.revokeObjectURL(url);
}
