import {
  buildDiagnosticsBundle,
  DIAGNOSTICS_SCREENSHOT_MAX_CHARS,
  type DiagnosticsBundle,
} from '@patches/domain';

/**
 * The web app's issue-reporter feed (B-112): automatic window/console-error and route
 * breadcrumbs in a ring buffer, folded into the shared `@patches/domain` bundle schema
 * at build time. Like the TUI reporter, the feeders only accept metadata-grade lines —
 * there is no parameter a DM body or message text could arrive through (§194).
 */

const RING_CAPACITY = 100;

export interface WebBreadcrumb {
  at: string;
  kind: 'window-error' | 'unhandled-rejection' | 'console-error' | 'route';
  detail: string;
}

let breadcrumbs: WebBreadcrumb[] = [];
let collectorsInstalled = false;
let routeCounter = 0;

function now(): string {
  return new Date().toISOString();
}

export function recordWebBreadcrumb(
  kind: WebBreadcrumb['kind'],
  detail: string,
  at: string = now(),
): void {
  breadcrumbs.push({ at, kind, detail: detail.slice(0, 200) });
  if (breadcrumbs.length > RING_CAPACITY) {
    breadcrumbs = breadcrumbs.slice(breadcrumbs.length - RING_CAPACITY);
  }
}

/** Route changes are high-frequency; keep just enough to reconstruct the trail. */
export function recordRoute(path: string): void {
  routeCounter += 1;
  recordWebBreadcrumb('route', `#${String(routeCounter)} ${path}`);
}

export function webBreadcrumbs(): readonly WebBreadcrumb[] {
  return breadcrumbs;
}

/** Test seam. */
export function resetWebReporterForTests(): void {
  breadcrumbs = [];
  collectorsInstalled = false;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return truncate(`${error.name}: ${error.message}`, 200);
  return truncate(String(error), 200);
}

/**
 * Installs window.onerror / unhandledrejection / console.error collectors once.
 * Console.error is wrapped (not replaced) — arguments are reduced to their first
 * stringable form; nothing object-shaped is retained.
 */
export function installGlobalCollectors(): void {
  if (collectorsInstalled || typeof window === 'undefined') return;
  collectorsInstalled = true;

  window.addEventListener('error', (event) => {
    recordWebBreadcrumb('window-error', errorDetail(event.error ?? event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordWebBreadcrumb('unhandled-rejection', errorDetail(event.reason));
  });
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = args.find((argument) => typeof argument === 'string');
    recordWebBreadcrumb('console-error', errorDetail(first ?? args[0]));
    originalConsoleError(...args);
  };
}

/** The web client version injected by Vite (`<pkg version>+<short sha>`); `'dev'` when absent (tests). */
function webVersion(): { version: string; buildSha: string } {
  const raw = typeof __PATCHES_WEB_VERSION__ === 'undefined' ? '' : String(__PATCHES_WEB_VERSION__);
  const plus = raw.indexOf('+');
  if (plus < 0) return { version: raw === '' ? 'dev' : raw, buildSha: '' };
  return { version: raw.slice(0, plus), buildSha: raw.slice(plus + 1) };
}

export function nodeDomain(): string {
  return typeof location === 'undefined' ? '' : location.host;
}

/** True when the browser exposes user-granted display capture (jsdom does not). */
export function displayMediaSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices !== undefined &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  );
}

export function buildWebDiagnosticsBundle(options: {
  sessionHandle?: string | undefined;
  screenshotDataUrl?: string | undefined;
  notes?: string | undefined;
}): DiagnosticsBundle {
  const { version, buildSha } = webVersion();
  const capabilities: Record<string, boolean> = {
    sessionPresent: options.sessionHandle !== undefined && options.sessionHandle !== '',
    displayMediaSupported: displayMediaSupported(),
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  };
  return buildDiagnosticsBundle({
    app: 'web',
    version,
    buildSha,
    nodeDomain: nodeDomain(),
    ...(options.sessionHandle === undefined ? {} : { sessionHandle: options.sessionHandle }),
    capabilities,
    breadcrumbs,
    screenshotDataUrl: options.screenshotDataUrl,
    notes: options.notes,
  });
}

/** Screenshot size guard shared with the capture pipeline (`lib/screenshot.ts`). */
export function screenshotWithinGuard(dataUrl: string): boolean {
  return (
    dataUrl.startsWith('data:image/png;base64,') &&
    dataUrl.length <= DIAGNOSTICS_SCREENSHOT_MAX_CHARS
  );
}
