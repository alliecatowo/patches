import { z } from 'zod';

/**
 * B-182 — shared client/server contract for the Web Vitals ingest endpoint (B-166's
 * client-side `apps/web/src/lib/webVitals.ts`, `apps/server/src/modules/observability/`).
 *
 * The route-pattern table below is the single source of truth `pathToRoutePattern` (the
 * client, reducing `location.pathname`) and the server's payload validator both use — moved
 * here specifically so the two can never drift apart. Prometheus labels have unbounded-
 * cardinality blow-up risk (a label value becomes a distinct time series forever), so the
 * server must reject any `route` string that isn't a literal member of
 * {@link WEB_VITALS_ROUTE_PATTERNS} rather than trust the client to keep sending patterns
 * only. Mirrors `apps/web/src/routes/router.tsx`'s route table; a new route there needs a
 * matching entry here (and, if parameterized, an entry in
 * {@link WEB_VITALS_PARAM_ROUTE_PATTERNS}) or its Web Vitals samples are silently dropped as
 * `route not recognized` rather than admitted with an unbounded label.
 */

/** Static top-level routes from `router.tsx` that carry no identifying segment. Written
 * without the leading `/` — the trimmed `location.pathname` shape `pathToRoutePattern`
 * matches against. */
const STATIC_ROUTE_SEGMENTS = [
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
] as const;

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

/** Fallbacks `pathToRoutePattern` returns for a single unmatched segment (profile handles)
 * and anything else — never the raw segment itself (§194: a handle/id is identifying). */
const FALLBACK_ROUTE_PATTERNS = ['/:handle', '/:unknown'] as const;

/**
 * Reduces a live pathname to the route *pattern* it matches, never the concrete path — a
 * path segment can be a handle or a post id, both identifying (§194). Falls back to
 * `/:handle` for the single-segment profile route and `/:unknown` for anything that doesn't
 * match a known shape, rather than ever forwarding the raw segment.
 */
export function pathToRoutePattern(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  if ((STATIC_ROUTE_SEGMENTS as readonly string[]).includes(trimmed)) return `/${trimmed}`;
  for (const { pattern, replacement } of PARAM_ROUTES) {
    if (pattern.test(trimmed)) return replacement;
  }
  if (trimmed !== '' && !trimmed.includes('/')) return '/:handle';
  return '/:unknown';
}

/** Every pattern {@link pathToRoutePattern} can ever return — the server-side allow-list. */
export const WEB_VITALS_ROUTE_PATTERNS: ReadonlySet<string> = new Set([
  ...STATIC_ROUTE_SEGMENTS.map((segment) => `/${segment}`),
  ...PARAM_ROUTES.map(({ replacement }) => replacement),
  ...FALLBACK_ROUTE_PATTERNS,
]);

export function isKnownWebVitalsRoutePattern(route: string): boolean {
  return WEB_VITALS_ROUTE_PATTERNS.has(route);
}

/* --- ingest payload contract ------------------------------------------------------- */

export const WEB_VITALS_METRIC_NAMES = ['CLS', 'INP', 'LCP'] as const;
export type WebVitalsMetricName = (typeof WEB_VITALS_METRIC_NAMES)[number];

export const WEB_VITALS_RATINGS = ['good', 'needs-improvement', 'poor'] as const;

/** `Metric['navigationType']` (`web-vitals` 6.x) — kept as a literal union here rather than
 * imported from the `web-vitals` package so this package (also depended on server-side)
 * never needs a browser-only dependency. */
export const WEB_VITALS_NAVIGATION_TYPES = [
  'navigate',
  'reload',
  'back-forward',
  'back-forward-cache',
  'prerender',
  'restore',
  'soft-navigation',
] as const;

/** At most three metrics are ever tracked (CLS/INP/LCP), but `web-vitals` can re-report a
 * metric more than once per page before the batch flushes (e.g. CLS revises on each new
 * layout-shift session) — bounded generously above the realistic count, never unbounded. */
export const WEB_VITALS_MAX_SAMPLES_PER_PAYLOAD = 20;
export const WEB_VITALS_MAX_ID_LENGTH = 64;
export const WEB_VITALS_MAX_BUILD_VERSION_LENGTH = 64;
/** Sanity ceiling on a metric's raw value (CLS is a small unitless score; INP/LCP are
 * milliseconds) — well above any real browser measurement, just enough to reject a hostile
 * `1e300` from ever reaching a Prometheus exposition line. */
export const WEB_VITALS_MAX_METRIC_VALUE = 3_600_000;

export const webVitalsSampleSchema = z.object({
  name: z.enum(WEB_VITALS_METRIC_NAMES),
  value: z.number().finite().min(0).max(WEB_VITALS_MAX_METRIC_VALUE),
  rating: z.enum(WEB_VITALS_RATINGS),
  id: z.string().min(1).max(WEB_VITALS_MAX_ID_LENGTH),
});

export const webVitalsPayloadSchema = z.object({
  route: z.string().refine(isKnownWebVitalsRoutePattern, {
    message: 'route is not a known route pattern',
  }),
  navigationType: z.enum(WEB_VITALS_NAVIGATION_TYPES),
  buildVersion: z.string().min(1).max(WEB_VITALS_MAX_BUILD_VERSION_LENGTH),
  samples: z.array(webVitalsSampleSchema).min(1).max(WEB_VITALS_MAX_SAMPLES_PER_PAYLOAD),
});

export type WebVitalsSample = z.infer<typeof webVitalsSampleSchema>;
export type WebVitalsPayload = z.infer<typeof webVitalsPayloadSchema>;
