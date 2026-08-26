/**
 * B-166 — Core Web Vitals collection (CLS, LCP, INP).
 *
 * There is no browser-facing metrics ingest endpoint on the server yet (the only
 * `/metrics` surfaces are Prometheus *scrape* endpoints — pull, not push — see
 * `packages/observability/src/metrics-server.ts`); a server ingest RPC/route is filed as
 * B-178. Until it lands, this module only ever sends anywhere when the deploy sets
 * `VITE_WEB_VITALS_ENDPOINT` — unset (the default for every environment today) means the
 * web-vitals observers are never even installed, so there is zero behavioural change out
 * of the box.
 *
 * FID is intentionally absent: `web-vitals` 6.x (installed here) dropped `onFID` entirely
 * in favour of `onINP` (Google deprecated FID in 2024), so there is nothing to fake.
 *
 * Privacy (§194 — no DM bodies in logs/metrics/errors, generalized here to "no PII in
 * metrics"): the payload never carries the concrete URL, a handle, a post id, or any
 * other user content — `pathToRoutePattern` maps the live pathname down to the same
 * route *shape* `router.tsx` defines (`/p/:id`, not `/p/abc123`) before it ever reaches
 * the buffer.
 */
import { onCLS, onINP, onLCP, type Metric } from 'web-vitals';

export interface WebVitalsSample {
  readonly name: 'CLS' | 'INP' | 'LCP';
  readonly value: number;
  readonly rating: Metric['rating'];
  readonly id: string;
}

export interface WebVitalsPayload {
  readonly route: string;
  readonly navigationType: Metric['navigationType'];
  readonly buildVersion: string;
  readonly samples: readonly WebVitalsSample[];
}

/** Static top-level routes from `router.tsx` that carry no identifying segment. */
const STATIC_ROUTES = new Set([
  '',
  'report',
  'login',
  'register',
  'search',
  'notifications',
  'bookmarks',
  'compose',
  'appeals',
  'messages',
  'moderation/log',
]);

/** Parameterized routes from `router.tsx`, checked in order; first match wins. */
const PARAM_ROUTES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^p\/[^/]+$/, replacement: '/p/:id' },
  { pattern: /^page\/[^/]+\/[^/]+$/, replacement: '/page/:handle/:slug' },
  { pattern: /^page\/[^/]+$/, replacement: '/page/:handle' },
  { pattern: /^t\/[^/]+$/, replacement: '/t/:tag' },
  { pattern: /^c\/[^/]+$/, replacement: '/c/:id' },
  { pattern: /^messages\/[^/]+$/, replacement: '/messages/:id' },
  { pattern: /^settings(\/[^/]+)?$/, replacement: '/settings/:section' },
];

/**
 * Reduces a live pathname to the route *pattern* it matches, never the concrete path —
 * a path segment can be a handle or a post id, both identifying (§194). Falls back to
 * `/:handle` for the single-segment profile route and `/:unknown` for anything that
 * doesn't match a known shape, rather than ever forwarding the raw segment.
 */
export function pathToRoutePattern(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  if (STATIC_ROUTES.has(trimmed)) return `/${trimmed}`;
  for (const { pattern, replacement } of PARAM_ROUTES) {
    if (pattern.test(trimmed)) return replacement;
  }
  if (trimmed !== '' && !trimmed.includes('/')) return '/:handle';
  return '/:unknown';
}

function webVitalsEndpoint(): string | undefined {
  const endpoint = import.meta.env['VITE_WEB_VITALS_ENDPOINT'] as string | undefined;
  return endpoint === undefined || endpoint === '' ? undefined : endpoint;
}

function buildVersion(): string {
  return typeof __PATCHES_WEB_VERSION__ === 'undefined' ? 'dev' : String(__PATCHES_WEB_VERSION__);
}

let buffer: WebVitalsSample[] = [];
let navigationType: Metric['navigationType'] = 'navigate';
let installed = false;

function recordSample(metric: Metric): void {
  navigationType = metric.navigationType;
  buffer.push({
    name: metric.name as WebVitalsSample['name'],
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
  });
}

/**
 * Fires on `visibilitychange`/`pagehide` rather than per-metric: CLS/LCP/INP each
 * finalize independently, so sending on every callback would be up to three requests per
 * page view. Batching into one payload here means at most one request per hide, and none
 * at all if nothing has fired yet.
 */
function flush(endpoint: string): void {
  if (buffer.length === 0) return;
  const payload: WebVitalsPayload = {
    route: pathToRoutePattern(location.pathname),
    navigationType,
    buildVersion: buildVersion(),
    samples: buffer,
  };
  buffer = [];
  try {
    const body = JSON.stringify(payload);
    const sent =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    if (sent !== true) {
      // fetch fallback for browsers without sendBeacon, or a beacon queue that rejected
      // this one (over quota) — `keepalive` lets it survive the page unloading.
      void fetch(endpoint, {
        method: 'POST',
        body,
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        // Unreachable endpoint must never surface to the user — metrics are best-effort.
      });
    }
  } catch {
    // Serialization/beacon failures are best-effort too; never let vitals reporting throw.
  }
}

/**
 * Installs the CLS/LCP/INP observers and wires the batched flush. No-ops entirely (never
 * installs a single listener) when `VITE_WEB_VITALS_ENDPOINT` is unset, so this is a pure
 * pay-for-what-you-use feature until B-178 lands a real ingest endpoint.
 */
export function initWebVitals(): void {
  if (installed) return;
  const endpoint = webVitalsEndpoint();
  if (endpoint === undefined || typeof window === 'undefined') return;
  installed = true;

  onCLS(recordSample);
  onINP(recordSample);
  onLCP(recordSample);

  const flushNow = (): void => flush(endpoint);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
  window.addEventListener('pagehide', flushNow);
}

/** Test seam. */
export function resetWebVitalsForTests(): void {
  buffer = [];
  navigationType = 'navigate';
  installed = false;
}
