export { initializeTelemetry, getSdk, shutdownInstrumentation } from './instrumentation.js';
export {
  metricsRegistry,
  rpcDuration,
  dbPoolGauge,
  workerQueueDepth,
  httpDuration,
  httpRequestsTotal,
  e2eeRetentionDeletedTotal,
  e2eeRetentionRunsTotal,
  e2eeEnvelopeListAgeSeconds,
  readRpcPollTotal,
  webVitalsCls,
  webVitalsInpMs,
  webVitalsLcpMs,
  type MetricsRegistry,
  registerCustomMetrics,
} from './metrics.js';
export { startMetricsServer, stopMetricsServer } from './metrics-server.js';
