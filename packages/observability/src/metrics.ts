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

export type MetricsRegistry = typeof metricsRegistry;

export function registerCustomMetrics(customRegistry: Registry): void {
  customRegistry.registerMetric(rpcDuration);
  customRegistry.registerMetric(dbPoolGauge);
  customRegistry.registerMetric(workerQueueDepth);
  customRegistry.registerMetric(httpDuration);
  customRegistry.registerMetric(httpRequestsTotal);
  customRegistry.registerMetric(e2eeRetentionDeletedTotal);
  customRegistry.registerMetric(e2eeRetentionRunsTotal);
}
