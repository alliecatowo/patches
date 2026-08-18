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
  // `app.listen(HTTP_PORT)` is only called when `FEDERATION_ENABLED` (spec §176: a
  // self-hosted node ships with federation off by default) — until then, Nest builds the
  // Express app and registers `FederationModule`'s routes on it, but nothing ever binds a
  // port for them, so there is no new network surface at all when federation is disabled.
  const app = await NestFactory.create(AppModule, { logger, bufferLogs: true });
  app.connectMicroservice<MicroserviceOptions>(options);

  // Registers SIGTERM/SIGINT/SIGHUP handlers that run `onModuleDestroy` /
  // `onApplicationShutdown` and close both the gRPC and (if opened) HTTP servers (spec §124).
  app.enableShutdownHooks();

  await app.startAllMicroservices();
  health.setStatus('SERVING');

  logger.log(
    `patches gRPC server listening on ${url} (env=${env.NODE_ENV}, instance=${env.INSTANCE_NAME})`,
    'Bootstrap',
  );

  if (env.FEDERATION_ENABLED) {
    await app.listen(env.HTTP_PORT);
    logger.log(
      `federation HTTP surface listening on :${String(env.HTTP_PORT)} (origin=${env.PUBLIC_ORIGIN})`,
      'Bootstrap',
    );
  }

  const stopServing = (signal: string): void => {
    logger.log(`received ${signal}, draining`, 'Bootstrap');
    health.setStatus('NOT_SERVING');
  };
  process.once('SIGTERM', () => {
    stopServing('SIGTERM');
  });
  process.once('SIGINT', () => {
    stopServing('SIGINT');
  });
}

bootstrap().catch((error: unknown) => {
  // The logger may not exist yet (config failures happen first), so this is the
  // one place the server writes directly to stderr.
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  new Logger('Bootstrap').error(message);
  process.exitCode = 1;
});
