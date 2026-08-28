import { Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';

import {
  dbPoolGauge,
  e2eeEnvelopeListAgeSeconds,
  e2eeRetentionDeletedTotal,
  e2eeRetentionRunsTotal,
  httpDuration,
  httpRequestsTotal,
  metricsRegistry,
  readRpcPollTotal,
  registerCustomMetrics,
  rpcDuration,
  webVitalsCls,
  webVitalsInpMs,
  webVitalsLcpMs,
  workerQueueDepth,
} from './metrics.js';

const EXPECTED_METRIC_NAMES = [
  'patches_rpc_duration_seconds',
  'patches_db_pool_connections',
  'patches_worker_queue_depth',
  'patches_http_duration_seconds',
  'patches_http_requests_total',
  'patches_e2ee_retention_deleted_total',
  'patches_e2ee_retention_runs_total',
  'patches_e2ee_envelope_list_age_seconds',
  'patches_read_rpc_poll_total',
  'patches_web_vitals_cls',
  'patches_web_vitals_inp_ms',
  'patches_web_vitals_lcp_ms',
];

describe('metricsRegistry', () => {
  it('registers every exported custom metric under its documented name', async () => {
    const metrics = await metricsRegistry.getMetricsAsJSON();
    const names = metrics.map((metric) => metric.name);
    for (const expected of EXPECTED_METRIC_NAMES) {
      expect(names).toContain(expected);
    }
  });

  it('prefixes default (process/runtime) metrics with patches_', async () => {
    const metrics = await metricsRegistry.getMetricsAsJSON();
    const defaultMetric = metrics.find((metric) => metric.name.startsWith('patches_process_'));
    expect(defaultMetric).toBeDefined();
  });
});

describe('the metric instrument objects', () => {
  it('rpcDuration observes into patches_rpc_duration_seconds with method/status labels', async () => {
    rpcDuration.observe({ method: 'Test.Method', status: 'OK' }, 0.01);
    const metric = (await metricsRegistry.getMetricsAsJSON()).find(
      (m) => m.name === 'patches_rpc_duration_seconds',
    );
    expect(metric).toBeDefined();
  });

  it('dbPoolGauge/workerQueueDepth/httpDuration/httpRequestsTotal accept their labels without throwing', () => {
    expect(() => dbPoolGauge.set({ state: 'active' }, 3)).not.toThrow();
    expect(() => workerQueueDepth.set({ queue: 'default' }, 1)).not.toThrow();
    expect(() =>
      httpDuration.observe({ method: 'GET', path: '/x', status: '200' }, 0.02),
    ).not.toThrow();
    expect(() => httpRequestsTotal.inc({ method: 'GET', path: '/x', status: '200' })).not.toThrow();
  });

  it('e2eeRetentionDeletedTotal/e2eeRetentionRunsTotal accept their bounded label sets', () => {
    expect(() => e2eeRetentionDeletedTotal.inc({ kind: 'mailbox' })).not.toThrow();
    expect(() => e2eeRetentionRunsTotal.inc({ outcome: 'completed' })).not.toThrow();
  });

  it('e2eeEnvelopeListAgeSeconds has no labels (ADR 0032 T1 — never a per-actor dimension)', () => {
    expect(() => e2eeEnvelopeListAgeSeconds.observe(5)).not.toThrow();
  });

  it('readRpcPollTotal is bounded to exactly is_dm_poll true/false', () => {
    expect(() => readRpcPollTotal.inc({ is_dm_poll: 'true' })).not.toThrow();
    expect(() => readRpcPollTotal.inc({ is_dm_poll: 'false' })).not.toThrow();
  });

  it('webVitals* histograms accept a route label', () => {
    expect(() => webVitalsCls.observe({ route: '/home' }, 0.05)).not.toThrow();
    expect(() => webVitalsInpMs.observe({ route: '/home' }, 100)).not.toThrow();
    expect(() => webVitalsLcpMs.observe({ route: '/home' }, 1000)).not.toThrow();
  });
});

describe('registerCustomMetrics', () => {
  it('registers every custom metric (not the default-metrics set) onto a fresh registry', () => {
    const customRegistry = new Registry();
    registerCustomMetrics(customRegistry);
    const registered = customRegistry.getSingleMetric('patches_rpc_duration_seconds');
    expect(registered).toBeDefined();
    for (const expected of EXPECTED_METRIC_NAMES) {
      expect(customRegistry.getSingleMetric(expected)).toBeDefined();
    }
  });

  it('does not register the default process/runtime metrics onto the fresh registry', () => {
    const customRegistry = new Registry();
    registerCustomMetrics(customRegistry);
    expect(
      customRegistry.getSingleMetric('patches_process_cpu_user_seconds_total'),
    ).toBeUndefined();
  });
});
