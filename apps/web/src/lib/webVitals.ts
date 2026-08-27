/**
 * B-166 — Core Web Vitals collection (CLS, LCP, INP).
 *
 * B-182 landed the server-side ingest (`apps/server/src/modules/observability/`), a plain
 * unauthenticated HTTP POST route (not a Connect/gRPC RPC — `sendBeacon` cannot set custom
 * headers or emit Connect's request framing, and this module already speaks plain JSON, so a
 * matching plain route is the only shape the beacon path can actually reach). This module
 * still only sends anywhere when the deploy sets `VITE_WEB_VITALS_ENDPOINT` — unset (the
 * default until the build pipeline is wired to point it at that route) means the web-vitals
 * observers are never even installed, so there is zero behavioural change out of the box.
 *
 * FID is intentionally absent: `web-vitals` 6.x (installed here) dropped `onFID` entirely
 * in favour of `onINP` (Google deprecated FID in 2024), so there is nothing to fake.
 *
 * Privacy (§194 — no DM bodies in logs/metrics/errors, generalized here to "no PII in
 * metrics"): the payload never carries the concrete URL, a handle, a post id, or any
 * other user content — `pathToRoutePattern` maps the live pathname down to the same
 * route *shape* `router.tsx` defines (`/p/:id`, not `/p/abc123`) before it ever reaches
 * the buffer. That function (and the allow-list the server validates `route` against) now
 * lives in `@patches/domain` — a single shared definition so client and server can never
 * disagree about which route patterns are valid.
 */
import { pathToRoutePattern, type WebVitalsPayload, type WebVitalsSample } from '@patches/domain';
import { onCLS, onINP, onLCP, type Metric } from 'web-vitals';

export { pathToRoutePattern };
export type { WebVitalsPayload, WebVitalsSample };

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
 * pay-for-what-you-use feature until the build pipeline sets that variable to the B-182
 * ingest route.
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
