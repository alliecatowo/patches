import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { type Server as HttpServer } from 'node:http';
import { basename, dirname, join } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions } from '@nestjs/microservices';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { readDotEnvFile } from '@patches/config';

import { Logger as PinoLoggerService } from 'nestjs-pino';
import { validateEnv } from './config/env.schema.js';
import { createGrpcMicroservice } from './grpc-options.js';
import { ReadinessState } from './modules/system/readiness-state.js';
import { configureProxyTrust, mountConnectEdge } from './transport/connect/connect.middleware.js';

/**
 * Initialize OpenTelemetry instrumentation if enabled.
 * Must run before any other instrumented code is loaded.
 */
async function initializeTelemetryIfEnabled(): Promise<void> {
  if (process.env.OTEL_ENABLED === 'true') {
    await import('@patches/observability/instrumentation').then((m) => m.initializeTelemetry());
  }
}

/**
 * Load `.env` from the repo root in development so a fresh clone works with just
 * `cp .env.example .env` — never overrides a variable the shell/process manager
 * already set, and never runs in production (Fly.io/CI set real env vars, and a
 * dev-only `.env` file has no business affecting a production boot).
 *
 * The repo root is found by walking up from this module looking for
 * `pnpm-workspace.yaml` rather than hard-coding a relative depth: the same source
 * runs from `src/` under `nest start` and from `dist/` in production, and those
 * happen to sit at the same depth today, but searching is what actually makes
 * that not matter (same technique as `modules/system/server-build.ts`).
 */
export function loadDotEnv(): void {
  if (process.env.NODE_ENV === 'production') return;

  const startDir = typeof __dirname === 'string' ? __dirname : process.cwd();
  let current = startDir;
  for (;;) {
    // nestjs-doctor-ignore-next-line performance/no-sync-io -- boot-path only, runs before the event loop serves traffic
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) break;
    const parent = dirname(current);
    if (parent === current) return; // no repo root found; nothing to load
    current = parent;
  }

  const values = readDotEnvFile(join(current, '.env'));
  for (const [key, value] of Object.entries(values)) {
    process.env[key] ??= value;
  }
}

/**
 * The loopback address the Connect edge dials for its internal gRPC calls (ADR 0016 §3).
 * `GRPC_HOST` is `0.0.0.0` in production (so the gRPC server itself binds every interface for
 * Fly's proxy) — that's never a valid address to *connect to*, so the proxy always targets
 * `127.0.0.1` instead in that case, and `GRPC_HOST` verbatim otherwise (dev's `127.0.0.1`,
 * or a test's bound loopback address).
 */
function grpcLoopbackUrl(grpcHost: string, grpcPort: number): string {
  const host = grpcHost === '0.0.0.0' ? '127.0.0.1' : grpcHost;
  return `${host}:${String(grpcPort)}`;
}

async function bootstrap(): Promise<void> {
  await initializeTelemetryIfEnabled();
  loadDotEnv();

  // This must stay a dynamic import after `loadDotEnv()`: `app.module.ts` validates
  // FEDERATION_ENABLED at module-evaluation time, and ESM static imports run before any
  // function body. A static AppModule import here would therefore make fresh-clone `.env`
  // loading too late for both the federation flag and required auth-envelope secrets.
  const { AppModule } = await import('./app.module.js');

  // Validated before Nest exists: the bind address is needed to construct the
  // microservice, and a malformed environment must abort the boot outright.
  const env = validateEnv(process.env);

  const url = `${env.GRPC_HOST}:${String(env.GRPC_PORT)}`;
  // S-001 (`docs/operations/capacity.md`): per-connection gRPC limits — real grpc-core channel
  // args, config-driven so an operator can retune without a code change.
  const { options, health } = createGrpcMicroservice(url, {
    reflection: env.GRPC_REFLECTION,
    channelOptions: {
      'grpc.max_concurrent_streams': env.GRPC_MAX_CONCURRENT_STREAMS,
      'grpc.max_connection_age_ms': env.GRPC_MAX_CONNECTION_AGE_MS,
      'grpc.max_connection_idle_ms': env.GRPC_MAX_CONNECTION_IDLE_MS,
      'grpc.keepalive_time_ms': env.GRPC_KEEPALIVE_TIME_MS,
      'grpc.keepalive_timeout_ms': env.GRPC_KEEPALIVE_TIMEOUT_MS,
      'grpc.max_send_message_length': env.GRPC_MAX_MESSAGE_BYTES,
      'grpc.max_receive_message_length': env.GRPC_MAX_MESSAGE_BYTES,
    },
  });

  // A full Nest HTTP application (the NestJS "hybrid app" pattern, `docs/research/
  // nestjs-grpc-protobuf.md` §"Hybrid app"), not `NestFactory.createMicroservice` — gRPC is
  // attached via `connectMicroservice` below and stays the primary transport. `app.listen()`
  // below is now **always** called (ADR 0016 §4 — this changed deliberately from the
  // previous "only when FEDERATION_ENABLED" behaviour): the HTTP listener now also serves
  // `/healthz` and the Connect edge (`/patches.v1.*`, web/RN clients) on every node. What
  // stays conditional on `FEDERATION_ENABLED` is `FederationHttpModule` itself
  // (`app.module.ts`) — webfinger/actor/inbox/outbox are absent from the DI graph, not
  // merely unrouted, when federation is off, which is what actually preserves spec §176's
  // "zero new network surface" intent for that surface specifically.
  //
  // `bodyParser: false`: Nest's default Express body parser would otherwise consume the
  // request stream for any `application/json`-ish request before `expressConnectMiddleware`
  // (mounted by `mountConnectEdge` below) gets a chance to read it itself
  // (`docs/research/connect-es.md` §4) — the federation HTTP surface already relied on no
  // body parser running ahead of its own raw body collector (`FederationHttpModule`), so
  // disabling it globally here just makes that reliance explicit instead of accidental.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  // `PinoLogger` itself is TRANSIENT-scoped (nestjs-pino) and lacks `log()`, so it can be
  // neither `app.get()`-ed nor passed to `useLogger()`. The library's `Logger` wrapper is a
  // singleton `LoggerService` over the shared pino instance — the documented app logger.
  const appLogger = app.get(PinoLoggerService);
  app.useLogger(appLogger);
  // `inheritAppConfig: true` is load-bearing: a hybrid app's connected microservices do NOT
  // get the `APP_FILTER`/`APP_INTERCEPTOR` providers (RpcExceptionsFilter, request-context
  // + logging interceptors) unless told to inherit them — without it every AppError surfaced
  // to gRPC clients as INTERNAL "Internal server error" (found on the first Fly deploy; the
  // in-process test server uses `createMicroservice` and never hit it).
  app.connectMicroservice<MicroserviceOptions>(options, { inheritAppConfig: true });

  // `TRUST_PROXY_HEADERS` (A-039) now also governs Express's own peer-IP derivation
  // (`req.ip`), which the Connect edge forwards as `x-forwarded-for` for internal gRPC calls
  // (ADR 0016 §7) — set *before* `mountConnectEdge` so its `contextValues` hook reads the
  // already-trust-proxy-aware value.
  configureProxyTrust(app, env.TRUST_PROXY_HEADERS);
  const connectEdge = mountConnectEdge(app, {
    grpcUrl: grpcLoopbackUrl(env.GRPC_HOST, env.GRPC_PORT),
    webOrigins: env.WEB_ORIGINS,
    grpcMaxMessageBytes: env.GRPC_MAX_MESSAGE_BYTES,
  });

  // S-001 (`docs/operations/capacity.md`): raw Node `http.Server` tuning for the always-on
  // HTTP listener — the only edge with a directly internet-facing socket (gRPC sits behind
  // Fly's TCP proxy). Must be set before `app.listen()` below to take effect.
  const httpServer: HttpServer = app.getHttpServer();
  httpServer.maxConnections = env.HTTP_MAX_CONNECTIONS;
  httpServer.requestTimeout = env.HTTP_REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = env.HTTP_HEADERS_TIMEOUT_MS;
  httpServer.keepAliveTimeout = env.HTTP_KEEPALIVE_TIMEOUT_MS;

  // `ReadinessState` (A-043) mirrors the gRPC health status into Nest's DI graph so
  // `HealthService` — resolved by `HealthController`, now always reachable at
  // `GET /healthz` since the HTTP adapter is always-on — can read it. Every
  // `health.setStatus` call below is paired with a `readiness.setServing` call so the two
  // never disagree.
  const readiness = app.get(ReadinessState);

  // Drain order matters (A-044): Node runs signal listeners in registration order, so the
  // health flip to NOT_SERVING is registered *before* Nest's shutdown hooks — otherwise the
  // gRPC server is already closing by the time the check reports unhealthy. Nest's hooks then
  // run `onModuleDestroy`/`onApplicationShutdown` and close gRPC (grpc-js `tryShutdown`
  // waits for in-flight calls) and the HTTP server (spec §124). fly.toml's `kill_timeout`
  // must exceed this drain (see infra/fly/fly.toml).
  const stopServing = (signal: string): void => {
    appLogger.log(`received ${signal}, draining`);
    health.setStatus('NOT_SERVING');
    readiness.setServing(false);
  };
  process.once('SIGTERM', () => {
    stopServing('SIGTERM');
  });
  process.once('SIGINT', () => {
    stopServing('SIGINT');
  });
  process.once('SIGTERM', () => {
    connectEdge.close();
  });
  process.once('SIGINT', () => {
    connectEdge.close();
  });
  app.enableShutdownHooks();

  await app.startAllMicroservices();
  health.setStatus('SERVING');
  readiness.setServing(true);

  appLogger.log(
    `patches gRPC server listening on ${url} (env=${env.NODE_ENV}, instance=${env.INSTANCE_NAME})`,
  );

  await app.listen(env.HTTP_PORT);
  appLogger.log(
    `patches HTTP listener on :${String(env.HTTP_PORT)} — /healthz, Connect edge` +
      (env.FEDERATION_ENABLED ? ', federation surface' : '') +
      ` (origin=${env.PUBLIC_ORIGIN})`,
  );

  if (env.METRICS_ENABLED === 'true') {
    const { startMetricsServer } = await import('@patches/observability/metrics-server');
    await startMetricsServer(env.METRICS_PORT);
    appLogger.log(`metrics server listening on :${String(env.METRICS_PORT)}`);
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && basename(invokedPath) === 'main.js') {
  bootstrap().catch((error: unknown) => {
    // The logger may not exist yet (config failures happen first), so this is the
    // one place the server writes directly to stderr.
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    new Logger('Bootstrap').error(message);
    process.exitCode = 1;
  });
}
