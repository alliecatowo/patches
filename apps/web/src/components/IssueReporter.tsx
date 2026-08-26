import {
  useEffect,
  useState,
  useRef,
  type ChangeEvent,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useSession } from '../hooks/useSession.js';
import {
  buildWebDiagnosticsBundle,
  installGlobalCollectors,
  recordRoute,
} from '../lib/diagnosticsReporter.js';
import { fileToScreenshotDataUrl } from '../lib/screenshot.js';
import styles from './IssueReporter.module.css';

/** Where saved bundles are attached by hand — shown in every outcome panel. */
const ISSUES_URL = 'https://github.com/alliecatowo/patches/issues';
const REPORT_DOWNLOAD_NAME = 'patches-report.json';

/** B-151: nothing in the save flow may hang — even a stuck clipboard write resolves. */
export const CLIPBOARD_DEADLINE_MS = 4_000;

type SubmitState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; copiedToClipboard: boolean }
  | { status: 'error'; message: string };

export interface IssueReporterProps {
  /** `floating` = bottom-corner chip (error screens); `inline` = Settings entry. */
  variant?: 'floating' | 'inline';
  /**
   * Open the modal on mount — error boundaries auto-invite the report instead of
   * waiting for a second click on an already-bad day.
   */
  autoOpen?: boolean;
}

/**
 * The web issue reporter (B-112): a low-friction "Report an issue" affordance whose
 * modal takes an optional description, an optional screenshot attached from the
 * device's image picker (photo library on iOS PWA — the primary path, since
 * `getDisplayMedia` does not exist on iOS Safari) or, where supported, a live screen
 * capture, and saves a redacted diagnostics bundle locally (B-151: no v0 backend).
 * where the API is missing, e.g. iOS), and an opt-in @handle that is OFF by default.
 * Everything else is automatic: a redacted diagnostics bundle built through the
 * shared `@patches/domain` schema.
 *
 * There is no v0 report backend (spec §194), so "sending" is a purely local save:
 * the bundle downloads as a JSON file and is copied to the clipboard when the
 * browser allows it. Every path resolves into a success or error panel (B-151) —
 * the only async step (clipboard) is deadline-raced — and on the dedicated
 * `/report` route, closing the modal returns to the screen it was opened from
 * (B-152) instead of stranding the user on the bare reporter entry.
 */
export function IssueReporter({
  variant = 'floating',
  autoOpen = false,
}: IssueReporterProps): JSX.Element {
  const [open, setOpen] = useState(autoOpen);
  const location = useLocation();
  const navigate = useNavigate();

  // Automatic breadcrumbs: route changes while mounted, plus the global window/
  // console-error collectors (installed once, first mount wins).
  useEffect(() => {
    installGlobalCollectors();
    recordRoute(location.pathname);
  }, [location.pathname]);

  // B-152: on the dedicated /report route the modal is the whole page. Closing it
  // must return to the screen the report was opened from — home when /report was
  // deep-linked with no in-app history — never leave the user on the entry page.
  function close(): void {
    setOpen(false);
    if (location.pathname !== '/report' && !location.pathname.startsWith('/report/')) return;
    const idx = historyIndex();
    if (idx !== undefined && idx > 0) void navigate(-1);
    else void navigate('/');
  }

  return (
    <>
      <button
        type="button"
        className={variant === 'floating' ? styles['chip'] : styles['navEntry']}
        onClick={() => setOpen(true)}
        onPointerDown={steadyTap}
        title="Bug, jank, or feature idea — anything counts"
      >
        Report an issue
      </button>
      {open ? <IssueReportModal onClose={close} /> : null}
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Attach path: the device's own image picker (photo library on iOS PWA, files on
   * desktop) — the only screenshot source that works on every platform AND the only
   * one that makes sense: live capture would show the reporter itself, not the bug.
   */
  function pickScreenshotFile(): void {
    setScreenshotNote(undefined);
    fileInputRef.current?.click();
  }

  async function onScreenshotFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after detach: clear the input's value.
    event.target.value = '';
    if (file === undefined) return;
    const result = await fileToScreenshotDataUrl(file);
    if ('dataUrl' in result) {
      setScreenshot(result.dataUrl);
      setScreenshotNote(`screenshot attached (${Math.round(result.dataUrl.length / 1024)} KiB)`);
    } else {
      setScreenshot(undefined);
      setScreenshotNote(
        result.reason === 'unsupported'
          ? 'that file is not a supported image'
          : result.reason === 'too-large'
            ? 'screenshot was too large to attach'
            : 'the image could not be read',
      );
    }
  }

  /**
   * B-151: no v0 report backend exists (spec §194), so this is a local save that
   * always resolves — there is no network fetch to hang, the description rides in
   * the bundle's `notes`, and the one async step (clipboard) is deadline-raced.
   * Any failure lands in the error panel and restores the form.
   */
  async function saveReport(): Promise<void> {
    setState({ status: 'saving' });
    try {
      const bundle = buildWebDiagnosticsBundle({
        sessionHandle:
          includeHandle && session !== null
            ? session.actor.handle.startsWith('@')
              ? session.actor.handle
              : `@${session.actor.handle}`
            : undefined,
        screenshotDataUrl: screenshot,
        notes: description.trim() === '' ? undefined : description.trim(),
      });
      const bundleJson = JSON.stringify(bundle, null, 2);
      downloadBundle(bundleJson);
      const copied = await copyTextToClipboard(bundleJson);
      setState({ status: 'saved', copiedToClipboard: copied });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
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
          Saves a redacted diagnostics bundle on this device — app version, node, recent errors as
          status codes only, navigation trail. Message contents are never included.
        </p>

        <label className={styles.label} htmlFor="report-issue-description">
          What happened — bug, jank, or idea? (optional)
        </label>
        <textarea
          id="report-issue-description"
          className={styles.textarea}
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
          placeholder="A bug, something that felt off, a feature you wish existed — tell us what happened…"
        />

        <div className={styles.controls}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(event) => void onScreenshotFile(event)}
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            type="button"
            className={styles.controlButton}
            onClick={pickScreenshotFile}
            onPointerDown={steadyTap}
          >
            {screenshot === undefined ? 'Attach screenshot' : 'Replace screenshot'}
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

        {state.status === 'saving' ? <p className={styles.note}>Saving…</p> : null}
        {state.status === 'saved' ? (
          <div className={styles.success}>
            <p>
              Saved {REPORT_DOWNLOAD_NAME} to your downloads
              {state.copiedToClipboard
                ? ' and copied the JSON to your clipboard'
                : ' (clipboard copy was unavailable — use the file)'}
              .
            </p>
            <p>
              Attach the file (or paste the copy) at{' '}
              <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
                github.com/alliecatowo/patches/issues
              </a>
              .
            </p>
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div className={styles.failure}>
            <p>Could not save the report ({state.message}).</p>
            <p>Nothing left this device — your text is still here; try again.</p>
          </div>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={state.status === 'saving'}
            onClick={() => void saveReport()}
            onPointerDown={steadyTap}
          >
            Save report
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => onClose()}
            onPointerDown={steadyTap}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * B-149 (iOS PWA): WebKit can turn a tap that pulls focus off an editable with
 * pending typing into the system "Undo Typing" action, swallowing the tap. preventDefault()
 * on pointerdown keeps the tap out of WebKit's focus/undo machinery (the click still
 * fires) and blurring the active editable ends the typing session before the control acts.
 */
function steadyTap(event: ReactPointerEvent<HTMLButtonElement>): void {
  event.preventDefault();
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
}

/** React Router keeps its history index in `window.history.state.idx` (absent elsewhere). */
function historyIndex(): number | undefined {
  const state: unknown = window.history.state;
  if (typeof state !== 'object' || state === null || !('idx' in state)) return undefined;
  const idx = (state as { idx?: unknown }).idx;
  return typeof idx === 'number' ? idx : undefined;
}

function downloadBundle(bundleJson: string): void {
  const blob = new Blob([bundleJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = REPORT_DOWNLOAD_NAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

function withDeadline(promise: Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('clipboard write timed out')),
      CLIPBOARD_DEADLINE_MS,
    );
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Best-effort clipboard copy; `false` means "unavailable", not report failure — the
 * downloaded file is the primary deliverable. The async-API write is deadline-raced
 * so a permission prompt that never answers cannot wedge the save flow (B-151).
 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
    try {
      await withDeadline(navigator.clipboard.writeText(text));
      return true;
    } catch {
      // Denied or hung — try the legacy path before giving up.
    }
  }
  const helper = document.createElement('textarea');
  try {
    if (typeof document.execCommand !== 'function') return false;
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    return document.execCommand('copy');
  } catch {
    // No clipboard pathway exists here — the downloaded file is the deliverable.
    return false;
  } finally {
    helper.remove();
  }
}
