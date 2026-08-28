import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Asserts which trace exporter class (and, where relevant, which URL) each
 * `initializeTelemetry` config branch selects — added alongside the removal of the
 * Sentry-specific branch (see `docs/research/sentry-otlp.md`) so a future change to the
 * generic OTLP/console selection logic fails a test instead of only being caught by
 * whether traces happen to arrive somewhere in production.
 */

const nodeSdkStart = vi.fn();
const nodeSdkShutdown = vi.fn().mockResolvedValue(undefined);
const nodeSdkCtor = vi.fn();

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn(function (
    this: { start: typeof nodeSdkStart; shutdown: typeof nodeSdkShutdown },
    config: unknown,
  ) {
    nodeSdkCtor(config);
    this.start = nodeSdkStart;
    this.shutdown = nodeSdkShutdown;
  }),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn().mockReturnValue([]),
}));

// Each fake exporter tags itself with `kind` rather than relying on `instanceof` — the
// mocked constructors below are plain `vi.fn()`s invoked with `new`, so the resulting
// instance's prototype is the mock function's, not a hand-written class's.
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(function (
    this: { kind: string; config: unknown },
    config: { url: string; headers?: Record<string, string> },
  ) {
    this.kind = 'http';
    this.config = config;
  }),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: vi.fn(function (
    this: { kind: string; config: unknown },
    config: { url: string },
  ) {
    this.kind = 'grpc';
    this.config = config;
  }),
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  ConsoleSpanExporter: vi.fn(function (this: { kind: string }) {
    this.kind = 'console';
  }),
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn().mockImplementation((attrs: unknown) => attrs),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME: 'deployment.environment.name',
}));

/** The single arg `initializeTelemetry` passed to `new NodeSDK(...)` on its most recent call. */
function getLastNodeSdkConfig(): unknown {
  const calls = nodeSdkCtor.mock.calls;
  const lastCall = calls[calls.length - 1];
  if (!lastCall) {
    throw new Error('NodeSDK constructor was never called');
  }
  return lastCall[0];
}

describe('initializeTelemetry exporter selection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_CONSOLE_EXPORTER;
    delete process.env.SENTRY_DSN;
  });

  afterEach(async () => {
    const { shutdownInstrumentation } = await import('./instrumentation.js');
    await shutdownInstrumentation();
    process.env = originalEnv;
  });

  it('returns undefined when nothing is configured (no otlpEndpoint, not enabled)', async () => {
    const { initializeTelemetry } = await import('./instrumentation.js');
    expect(initializeTelemetry({})).toBeUndefined();
    expect(nodeSdkCtor).not.toHaveBeenCalled();
  });

  it('selects the HTTP OTLP exporter for a plain https:// endpoint', async () => {
    const { initializeTelemetry } = await import('./instrumentation.js');
    initializeTelemetry({
      serviceName: 'test',
      otlpEndpoint: 'https://collector.example.com/v1/traces',
      otlpHeaders: { 'x-api-key': 'secret' },
    });
    expect(nodeSdkCtor).toHaveBeenCalledTimes(1);
    const config = getLastNodeSdkConfig() as {
      traceExporter: { kind: string; config: unknown };
    };
    expect(config.traceExporter.kind).toBe('http');
    expect(config.traceExporter.config).toEqual({
      url: 'https://collector.example.com/v1/traces',
      headers: { 'x-api-key': 'secret' },
    });
    expect(nodeSdkStart).toHaveBeenCalledTimes(1);
  });

  it('selects the gRPC OTLP exporter for a grpc:// endpoint', async () => {
    const { initializeTelemetry } = await import('./instrumentation.js');
    initializeTelemetry({ serviceName: 'test', otlpEndpoint: 'grpc://collector.example.com:4317' });
    const config = getLastNodeSdkConfig() as {
      traceExporter: { kind: string; config: unknown };
    };
    expect(config.traceExporter.kind).toBe('grpc');
    expect(config.traceExporter.config).toEqual({ url: 'grpc://collector.example.com:4317' });
  });

  it('selects the gRPC OTLP exporter for an https endpoint on port 4317', async () => {
    const { initializeTelemetry } = await import('./instrumentation.js');
    initializeTelemetry({
      serviceName: 'test',
      otlpEndpoint: 'https://collector.example.com:4317',
    });
    const config = getLastNodeSdkConfig() as { traceExporter: { kind: string } };
    expect(config.traceExporter.kind).toBe('grpc');
  });

  it('selects the console exporter when enableConsoleExporter is set and no endpoint given', async () => {
    const { initializeTelemetry } = await import('./instrumentation.js');
    initializeTelemetry({ serviceName: 'test', enableConsoleExporter: true });
    const config = getLastNodeSdkConfig() as { traceExporter: { kind: string } };
    expect(config.traceExporter.kind).toBe('console');
  });

  it('throws when enabled but neither otlpEndpoint nor enableConsoleExporter is set', async () => {
    process.env.OTEL_ENABLED = 'true';
    const { initializeTelemetry } = await import('./instrumentation.js');
    expect(() => initializeTelemetry({})).toThrow(/No trace exporter configured/);
  });

  it('has no Sentry-specific config option (removed per docs/research/sentry-otlp.md)', async () => {
    const { initializeTelemetry } = await import('./instrumentation.js');
    const config: Record<string, unknown> = {
      serviceName: 'test',
      sentryDsn: 'https://key@o1.ingest.sentry.io/1',
    };
    // `sentryDsn` is not part of InstrumentationConfig; passing it has no effect and the
    // call still falls through to "nothing configured" since otlpEndpoint is absent.
    expect(initializeTelemetry(config)).toBeUndefined();
  });
});
