import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions } from '@nestjs/microservices';
import { readDotEnvFile } from '@patches/config';

import { AppModule } from './app.module.js';
import { createLogger } from './common/logging/logger.factory.js';
import { validateEnv } from './config/env.schema.js';
import { createGrpcMicroservice } from './grpc-options.js';
import { HealthService } from './modules/system/health.service.js';
import { ReadinessState } from './modules/system/readiness-state.js';
import {
  closeHealthzServer,
  createHealthzServer,
  listenHealthzServer,
} from './modules/system/healthz-server.js';

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
function loadDotEnv(): void {
  if (process.env.NODE_ENV === 'production') return;

  const startDir = typeof __dirname === 'string' ? __dirname : process.cwd();
  let current = startDir;
  for (;;) {
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

async function bootstrap(): Promise<void> {
  loadDotEnv();

  // Validated before Nest exists: the bind address is needed to construct the
  // microservice, and a malformed environment must abort the boot outright.
  const env = validateEnv(process.env);
  const logger = createLogger(env);

  const url = `${env.GRPC_HOST}:${String(env.GRPC_PORT)}`;
  const { options, health } = createGrpcMicroservice(url, { reflection: env.GRPC_REFLECTION });

  // A full Nest HTTP application (the NestJS "hybrid app" pattern, `docs/research/
  // nestjs-grpc-protobuf.md` §"Hybrid app"), not `NestFactory.createMicroservice` — gRPC is
  // attached via `connectMicroservice` below and stays the only *always-on* transport.
  // `app.listen(HTTP_PORT)` — which binds Nest's own Express adapter, and with it every
  // route in `AppModule` including `FederationModule`'s webfinger/actor/inbox/outbox
  // controllers — is only called when `FEDERATION_ENABLED` (spec §176: a self-hosted node
  // ships with federation off by default, with *zero* new network surface, not a smaller
  // one). When federation is off, `/healthz` (A-043) is instead served by the standalone,
  // single-route listener from `healthz-server.ts` on the same port, so it stays reachable
  // either way without opening the federation surface.
  const app = await NestFactory.create(AppModule, { logger, bufferLogs: true });
  // `inheritAppConfig: true` is load-bearing: a hybrid app's connected microservices do NOT
  // get the `APP_FILTER`/`APP_INTERCEPTOR` providers (RpcExceptionsFilter, request-context
  // + logging interceptors) unless told to inherit them — without it every AppError surfaced
  // to gRPC clients as INTERNAL "Internal server error" (found on the first Fly deploy; the
  // in-process test server uses `createMicroservice` and never hit it).
  app.connectMicroservice<MicroserviceOptions>(options, { inheritAppConfig: true });

  // `ReadinessState` (A-043) mirrors the gRPC health status into Nest's DI graph so
  // `HealthService` — resolved by both `HealthController` (bound only when federation opens
  // the full app) and the standalone `healthzServer` below — can read it. Every
  // `health.setStatus` call below is paired with a `readiness.setServing` call so the two
  // never disagree.
  const readiness = app.get(ReadinessState);
  const healthService = app.get(HealthService);
  const healthzServer = createHealthzServer(() => healthService.check());

  // Drain order matters (A-044): Node runs signal listeners in registration order, so the
  // health flip to NOT_SERVING is registered *before* Nest's shutdown hooks — otherwise the
  // gRPC server is already closing by the time the check reports unhealthy. Nest's hooks then
  // run `onModuleDestroy`/`onApplicationShutdown` and close gRPC (grpc-js `tryShutdown`
  // waits for in-flight calls) and, if opened, the HTTP server (spec §124). fly.toml's
  // `kill_timeout` must exceed this drain (see infra/fly/fly.toml). The standalone
  // `healthzServer` is deliberately left listening (and reporting 503, via `readiness`)
  // through the whole drain, and closed only once Nest itself has finished shutting down —
  // Fly's HTTP check should see the node go unhealthy before its socket disappears, not the
  // other way round.
  const stopServing = (signal: string): void => {
    logger.log(`received ${signal}, draining`, 'Bootstrap');
    health.setStatus('NOT_SERVING');
    readiness.setServing(false);
  };
  process.once('SIGTERM', () => {
    stopServing('SIGTERM');
  });
  process.once('SIGINT', () => {
    stopServing('SIGINT');
  });
  app.enableShutdownHooks();

  await app.startAllMicroservices();
  health.setStatus('SERVING');
  readiness.setServing(true);

  logger.log(
    `patches gRPC server listening on ${url} (env=${env.NODE_ENV}, instance=${env.INSTANCE_NAME})`,
    'Bootstrap',
  );

  if (env.FEDERATION_ENABLED) {
    // `HealthController` answers `/healthz` from this same port once the full app listens.
    await app.listen(env.HTTP_PORT);
    logger.log(
      `federation HTTP surface listening on :${String(env.HTTP_PORT)} (origin=${env.PUBLIC_ORIGIN})`,
      'Bootstrap',
    );
  } else {
    await listenHealthzServer(healthzServer, env.HTTP_PORT);
    logger.log(`healthz listening on :${String(env.HTTP_PORT)}`, 'Bootstrap');
    process.once('SIGTERM', () => {
      void closeHealthzServer(healthzServer);
    });
    process.once('SIGINT', () => {
      void closeHealthzServer(healthzServer);
    });
  }
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (config failures happen first), so this is the
  // one place the server writes directly to stderr.
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  new Logger('Bootstrap').error(message);
  process.exitCode = 1;
});
