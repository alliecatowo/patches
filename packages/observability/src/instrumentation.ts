import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as OTLPGrpcTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter, type SpanExporter } from '@opentelemetry/sdk-trace-base';

export interface InstrumentationConfig {
  serviceName: string;
  serviceVersion?: string;
  deploymentEnvironment?: string;
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
  enableConsoleExporter?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

let sdk: NodeSDK | undefined;

function parseResourceAttributes(attrString: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of attrString.split(',')) {
    const [key, value] = pair.split('=');
    if (key && value) {
      result[key.trim()] = value.trim();
    }
  }
  return result;
}

/**
 * Initialize OpenTelemetry instrumentation.
 *
 * Provider-agnostic: `otlpEndpoint`/`otlpHeaders` are used directly for any OTLP-compatible
 * backend (Grafana Tempo, Jaeger, Honeycomb, Sentry, etc.) — there is no Sentry-specific
 * branch. An earlier revision hardcoded a `sentryDsn` option that pointed at
 * `https://otel.sentry.io/v1/traces` with `Authorization: Bearer <dsn>`; per
 * `docs/research/sentry-otlp.md` (verified 2026-08-27 against docs.sentry.io) both the
 * endpoint and the auth header were wrong — Sentry's actual (beta) OTLP endpoint is
 * per-org/per-project (`https://o<orgId>.ingest.sentry.io/api/<projectId>/integration/otlp/v1/traces`)
 * with an `x-sentry-auth: sentry sentry_key=<public-key>` header, not a bearer token — so
 * traces sent the old way were silently rejected. Operators who want Sentry traces set
 * `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS` to those Sentry-documented
 * values themselves (`docs/operations/deployment.md#error-monitoring`); this file stays
 * unaware of Sentry as a distinct provider.
 *
 * Must be called once at application startup, before any other instrumented code runs.
 * Reads from env vars if config not provided: OTEL_ENABLED, OTEL_SERVICE_NAME,
 * OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_RESOURCE_ATTRIBUTES.
 */
export function initializeTelemetry(config?: Partial<InstrumentationConfig>): NodeSDK | undefined {
  const enabled = config?.enableConsoleExporter ?? process.env.OTEL_ENABLED === 'true';
  if (!enabled && !config?.otlpEndpoint && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return undefined;
  }

  if (sdk) {
    return sdk;
  }

  const serviceName = config?.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'patches';
  const serviceVersion = config?.serviceVersion ?? process.env.npm_package_version ?? '0.0.0';
  const deploymentEnvironment =
    config?.deploymentEnvironment ?? process.env.NODE_ENV ?? 'development';
  const otlpEndpoint = config?.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otlpHeaders = config?.otlpHeaders ?? {};
  const resourceAttributes = process.env.OTEL_RESOURCE_ATTRIBUTES
    ? parseResourceAttributes(process.env.OTEL_RESOURCE_ATTRIBUTES)
    : {};

  let traceExporter: SpanExporter;

  if (otlpEndpoint) {
    const useGrpc =
      otlpEndpoint.startsWith('grpc://') ||
      (otlpEndpoint.startsWith('https://') && otlpEndpoint.includes(':4317'));
    if (useGrpc) {
      const exporter = new OTLPGrpcTraceExporter({ url: otlpEndpoint });
      if (Object.keys(otlpHeaders).length > 0) {
        (exporter as { headers?: Record<string, string> }).headers = otlpHeaders;
      }
      traceExporter = exporter;
    } else {
      traceExporter = new OTLPTraceExporter({ url: otlpEndpoint, headers: otlpHeaders });
    }
  } else if (config?.enableConsoleExporter || process.env.OTEL_CONSOLE_EXPORTER === 'true') {
    traceExporter = new ConsoleSpanExporter();
  } else {
    throw new Error('No trace exporter configured: provide otlpEndpoint or enableConsoleExporter');
  }

  const resourceAttributesWithDefaults = {
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: deploymentEnvironment,
    ...resourceAttributes,
  };

  sdk = new NodeSDK({
    resource: resourceFromAttributes(resourceAttributesWithDefaults),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
        '@opentelemetry/instrumentation-grpc': { enabled: true },
        '@opentelemetry/instrumentation-http': { enabled: true },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk?.shutdown().catch((err: unknown) => {
      console.error('Error shutting down OpenTelemetry SDK:', err);
    });
  });

  return sdk;
}

export function getSdk(): NodeSDK | undefined {
  return sdk;
}

export async function shutdownInstrumentation(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}
