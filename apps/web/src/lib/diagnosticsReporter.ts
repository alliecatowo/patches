import {
  buildDiagnosticsBundle,
  DIAGNOSTICS_BREADCRUMB_DETAIL_MAX_CHARS,
  DIAGNOSTICS_SCREENSHOT_MAX_CHARS,
  MAX_DIAGNOSTICS_BREADCRUMBS,
  MAX_DIAGNOSTICS_BUNDLE_BYTES,
  type DiagnosticsBundle,
} from '@patches/domain';
import { SESSION_REFRESHED_EVENT, type SessionRefreshedDetail } from '@patches/client';

/**
 * The web app's issue-reporter feed (B-112): automatic window/console-error and route
 * breadcrumbs in a ring buffer, folded into the shared `@patches/domain` bundle schema
 * at build time. Like the TUI reporter, the feeders only accept metadata-grade lines —
 * there is no parameter a DM body or message text could arrive through (§194).
 *
 * B-162: the ring is mirrored to `sessionStorage` (tab-scoped, dies with the tab) so a
 * reload before reporting keeps the trail — restored on boot, written back in one
 * synchronous flush on `pagehide`. The mirror only ever round-trips crumbs the collectors
 * already produced; validation on read discards anything wider than that.
 */

const RING_CAPACITY = MAX_DIAGNOSTICS_BREADCRUMBS;

export interface WebBreadcrumb {
  at: string;
  kind: 'window-error' | 'unhandled-rejection' | 'console-error' | 'route' | 'session-refreshed';
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
  breadcrumbs.push({
    at,
    kind,
    detail: detail.slice(0, DIAGNOSTICS_BREADCRUMB_DETAIL_MAX_CHARS),
  });
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
  routeCounter = 0;
  if (typeof window !== 'undefined') {
    window.removeEventListener('pagehide', flushWebBreadcrumbsToSessionStorage);
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return truncate(`${error.name}: ${error.message}`, 200);
  return truncate(String(error), 200);
}

/* --- sessionStorage mirror (B-162) ------------------------------------------ */

/** sessionStorage key following the `patches.web.*.vN` convention; tab-scoped by design. */
export const DIAGNOSTICS_BREADCRUMB_STORAGE_KEY = 'patches.web.diagnostics-breadcrumbs.v1';
/** Envelope version — a stored value with any other version is not ours; discard it. */
const PERSISTED_SHAPE_VERSION = 1;
/**
 * A full ring is ~30 KiB, far under a whole bundle's 256 KiB ceiling — anything larger
 * cannot be a value we wrote, so skip parsing it entirely.
 */
const PERSISTED_MAX_CHARS = MAX_DIAGNOSTICS_BUNDLE_BYTES;

function isWebBreadcrumbKind(value: unknown): value is WebBreadcrumb['kind'] {
  return (
    value === 'window-error' ||
    value === 'unhandled-rejection' ||
    value === 'console-error' ||
    value === 'route' ||
    value === 'session-refreshed'
  );
}

/** `sessionStorage` access itself can throw where storage is blocked; persistence is optional. */
function safeSessionStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    // Storage API blocked (hardened privacy modes / embedded webviews) — no persistence.
    return undefined;
  }
}

/**
 * Whole-payload validation: one malformed field discards the entire stored value — the
 * restore path never widens what the collectors captured (§194) to make a crumb fit.
 */
function parsePersistedBreadcrumbs(
  raw: string,
): { crumbs: WebBreadcrumb[]; routeCounter: number } | undefined {
  if (raw.length > PERSISTED_MAX_CHARS) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt stored JSON — discard silently rather than seed the ring with garbage.
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { v, routeCounter, crumbs } = parsed as Record<string, unknown>;
  if (v !== PERSISTED_SHAPE_VERSION) return undefined;
  if (typeof routeCounter !== 'number' || !Number.isSafeInteger(routeCounter) || routeCounter < 0) {
    return undefined;
  }
  if (!Array.isArray(crumbs)) return undefined;
  const restored: WebBreadcrumb[] = [];
  for (const crumb of crumbs) {
    if (typeof crumb !== 'object' || crumb === null) return undefined;
    const { at, kind, detail } = crumb as Record<string, unknown>;
    if (typeof at !== 'string' || typeof detail !== 'string') return undefined;
    if (!isWebBreadcrumbKind(kind)) return undefined;
    restored.push({
      at,
      kind,
      detail: detail.slice(0, DIAGNOSTICS_BREADCRUMB_DETAIL_MAX_CHARS),
    });
  }
  return { crumbs: restored.slice(-RING_CAPACITY), routeCounter };
}

/** Seeds the ring with the previous page load's (validated) trail so a reload keeps it. */
function restorePersistedBreadcrumbs(): void {
  const storage = safeSessionStorage();
  if (storage === undefined) return;
  let raw: string | null;
  try {
    raw = storage.getItem(DIAGNOSTICS_BREADCRUMB_STORAGE_KEY);
  } catch {
    // Blocked storage read (privacy modes) — start the trail empty; best-effort only.
    return;
  }
  if (raw === null) return;
  const persisted = parsePersistedBreadcrumbs(raw);
  if (persisted === undefined) return;
  routeCounter = Math.max(routeCounter, persisted.routeCounter);
  breadcrumbs = [...persisted.crumbs, ...breadcrumbs].slice(-RING_CAPACITY);
}

/**
 * The write-behind flush: one synchronous write of the whole ring on `pagehide` — no
 * timer to manage, no partial-state merging, and every reload/navigation fires it before
 * the page goes away (a hard renderer kill is the only loss window, and diagnostics are
 * best-effort by spec). Quota/security failures are swallowed: losing the trail is sad,
 * breaking the unload path is worse.
 */
export function flushWebBreadcrumbsToSessionStorage(): void {
  const storage = safeSessionStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(
      DIAGNOSTICS_BREADCRUMB_STORAGE_KEY,
      JSON.stringify({ v: PERSISTED_SHAPE_VERSION, routeCounter, crumbs: breadcrumbs }),
    );
  } catch {
    // Quota errors (Safari private mode) must never break the app — persistence is best-effort.
  }
}

/**
 * Installs window.onerror / unhandledrejection / console.error collectors once, restores
 * any trail persisted by the previous page load (B-162), and hooks the `pagehide` flush.
 * Console.error is wrapped (not replaced) — arguments are reduced to their first
 * stringable form; nothing object-shaped is retained.
 */
export function installGlobalCollectors(): void {
  if (collectorsInstalled || typeof window === 'undefined') return;
  collectorsInstalled = true;

  restorePersistedBreadcrumbs();
  window.addEventListener('pagehide', flushWebBreadcrumbsToSessionStorage);

  window.addEventListener('error', (event) => {
    recordWebBreadcrumb('window-error', errorDetail(event.error ?? event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordWebBreadcrumb('unhandled-rejection', errorDetail(event.reason));
  });
  // B-169's SESSION_REFRESHED_EVENT had no listener anywhere in the app; recording it
  // here gives the shake-to-report trail visibility into silent token refreshes (or their
  // absence) leading up to an auth-shaped bug report, without ever carrying the token.
  window.addEventListener(SESSION_REFRESHED_EVENT, (event) => {
    const { expiresAt } = (event as CustomEvent<SessionRefreshedDetail>).detail;
    recordWebBreadcrumb(
      'session-refreshed',
      expiresAt === undefined ? 'expiry unknown' : `expires ${new Date(expiresAt).toISOString()}`,
    );
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
