import { Registry, collectDefaultMetrics, Histogram, Gauge, Counter } from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: 'patches_' });

export const rpcDuration = new Histogram({
  name: 'patches_rpc_duration_seconds',
  help: 'Duration of gRPC RPC calls in seconds',
  labelNames: ['method', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const dbPoolGauge = new Gauge({
  name: 'patches_db_pool_connections',
  help: 'Number of active/idle database pool connections',
  labelNames: ['state'],
  registers: [metricsRegistry],
});

export const workerQueueDepth = new Gauge({
  name: 'patches_worker_queue_depth',
  help: 'Number of pending jobs in the worker queue',
  labelNames: ['queue'],
  registers: [metricsRegistry],
});

export const httpDuration = new Histogram({
  name: 'patches_http_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestsTotal = new Counter({
  name: 'patches_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [metricsRegistry],
});

export const e2eeRetentionDeletedTotal = new Counter({
  name: 'patches_e2ee_retention_deleted_total',
  help: 'E2EE retention rows deleted by bounded kind',
  labelNames: ['kind'] as const,
  registers: [metricsRegistry],
});

export const e2eeRetentionRunsTotal = new Counter({
  name: 'patches_e2ee_retention_runs_total',
  help: 'E2EE retention sweep outcomes',
  labelNames: ['outcome'] as const,
  registers: [metricsRegistry],
});

/**
 * ADR 0032 T1 instrument. Observes, for every mailbox envelope returned by a
 * `ListMailboxEnvelopes` response, the wall-clock gap between the envelope's `received_at` and
 * "now" (the moment it was listed).
 *
 * This is **not** exactly "time to first delivery": the server keeps no per-envelope
 * already-listed marker (adding one would be new per-envelope state, which this instrument is
 * deliberately not introducing), so an envelope that stays unacknowledged across several polls —
 * the documented behaviour for conversations other than the one currently open, ADR 0032 fact 5
 * — is observed again, with a larger age, on every poll that still returns it. The metric is
 * therefore a **conservative proxy**: its mass is always at or above the true first-delivery
 * latency, never below, so it never *understates* a T1 freshness problem, but a rising p95 can
 * also mean "more envelopes are sitting unacknowledged" rather than "delivery got slower". Read
 * it alongside `patches_read_rpc_poll_total` (T2) rather than alone.
 *
 * No labels: adding a per-conversation/actor/device dimension here is exactly what §183.4/§194
 * forbid, and the histogram's own bucket distribution is the signal T1 needs.
 *
 * Buckets: the published SLA is ~5s in-thread and ~60s while focused elsewhere
 * (`docs/decisions/0032-dm-delivery-stays-poll-based.md`), and T1 trips at a p95 over 90s — the
 * set below resolves that whole 1s-120s range at roughly 1.5-2x steps so 5s and 60s are never in
 * the same bucket, plus a couple of wide tail buckets for the pathological case.
 */
export const e2eeEnvelopeListAgeSeconds = new Histogram({
  name: 'patches_e2ee_envelope_list_age_seconds',
  help: 'Age (list time minus received_at) of a mailbox envelope at the moment ListMailboxEnvelopes returns it. Conservative proxy for ADR 0032 T1 first-delivery latency, see doc comment.',
  buckets: [1, 2, 5, 10, 15, 30, 45, 60, 90, 120, 300, 600],
  registers: [metricsRegistry],
});

/**
 * ADR 0032 T2 instrument. One increment per `read`-classified RPC (per `classifyRpc`), labeled
 * with whether that RPC is DM/notification polling. `is_dm_poll` has exactly two values
 * (`'true'`/`'false'`) — bounded cardinality by construction, never derived from request data.
 *
 * `sum(rate(patches_read_rpc_poll_total{is_dm_poll="true"}[5m])) /
 *  sum(rate(patches_read_rpc_poll_total[5m]))` is DM-poll share of read RPC volume, the number
 * T2 names.
 */
export const readRpcPollTotal = new Counter({
  name: 'patches_read_rpc_poll_total',
  help: 'Count of read-classified RPCs, labeled by whether the RPC is DM/notification polling (ADR 0032 T2).',
  labelNames: ['is_dm_poll'] as const,
  registers: [metricsRegistry],
});

/**
 * B-182 — browser-reported Core Web Vitals (B-166's client), folded into three
 * `prom-client` histograms (one per metric, since CLS/INP/LCP have unrelated units and
 * therefore unrelated sensible bucket boundaries) labeled only by `route`. `route` is never
 * the raw request payload's string verbatim — the ingest controller/service validates it
 * against `@patches/domain`'s `WEB_VITALS_ROUTE_PATTERNS` allow-list *before* this module
 * ever sees it, so the label's cardinality is bounded by that fixed pattern set, not by
 * anything a client can freely choose (Prometheus label cardinality is otherwise an easy
 * denial-of-service vector for an unauthenticated ingest endpoint).
 *
 * Bucket boundaries follow each metric's own published "good"/"needs improvement"/"poor"
 * thresholds (web.dev, 2024): CLS is a unitless layout-shift score (good ≤0.1, poor >0.25);
 * INP and LCP are milliseconds (INP good ≤200ms, poor >500ms; LCP good ≤2500ms, poor
 * >4000ms) — each bucket set brackets its own good/poor split finely and tapers into a wide
 * tail for pathological outliers, mirroring `e2eeEnvelopeListAgeSeconds`'s approach above.
 */
export const webVitalsCls = new Histogram({
  name: 'patches_web_vitals_cls',
  help: 'Browser-reported Cumulative Layout Shift score, labeled by route pattern.',
  labelNames: ['route'] as const,
  buckets: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 0.75, 1, 1.5, 2],
  registers: [metricsRegistry],
});

export const webVitalsInpMs = new Histogram({
  name: 'patches_web_vitals_inp_ms',
  help: 'Browser-reported Interaction to Next Paint, in milliseconds, labeled by route pattern.',
  labelNames: ['route'] as const,
  buckets: [50, 100, 200, 300, 500, 800, 1000, 1800, 3000, 5000, 10000],
  registers: [metricsRegistry],
});

export const webVitalsLcpMs = new Histogram({
  name: 'patches_web_vitals_lcp_ms',
  help: 'Browser-reported Largest Contentful Paint, in milliseconds, labeled by route pattern.',
  labelNames: ['route'] as const,
  buckets: [500, 1000, 1800, 2500, 3000, 4000, 5000, 8000, 12000, 20000],
  registers: [metricsRegistry],
});

export type MetricsRegistry = typeof metricsRegistry;

export function registerCustomMetrics(customRegistry: Registry): void {
  customRegistry.registerMetric(rpcDuration);
  customRegistry.registerMetric(dbPoolGauge);
  customRegistry.registerMetric(workerQueueDepth);
  customRegistry.registerMetric(httpDuration);
  customRegistry.registerMetric(httpRequestsTotal);
  customRegistry.registerMetric(e2eeRetentionDeletedTotal);
  customRegistry.registerMetric(e2eeRetentionRunsTotal);
  customRegistry.registerMetric(e2eeEnvelopeListAgeSeconds);
  customRegistry.registerMetric(readRpcPollTotal);
  customRegistry.registerMetric(webVitalsCls);
  customRegistry.registerMetric(webVitalsInpMs);
  customRegistry.registerMetric(webVitalsLcpMs);
}
