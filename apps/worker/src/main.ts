import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readDotEnvFile } from '@patches/config';
import type { DataSource } from 'typeorm';

import { createLogger } from './common/logger.factory.js';
import { validateEnv } from './config/env.schema.js';
import { DATA_SOURCE } from './database/database.module.js';
import { JobRunner } from './jobs/job-runner.js';

/**
 * Load `.env` from the repo root in development, same technique as `apps/server/src/main.ts`
 * — never overrides a variable the shell/process manager already set, never runs in
 * production.
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

/** Bounded wait for graceful drain before the process gives up and closes anyway (§124). */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap(): Promise<void> {
  loadDotEnv();

  if (process.env.OTEL_ENABLED === 'true') {
    await import('@patches/observability/instrumentation').then((m) => m.initializeTelemetry());
  }

  // Keep this import after dotenv loading. AppModule validates required configuration at
  // module-evaluation time, so a static ESM import would make the documented repo-root `.env`
  // invisible during fresh-clone worker startup.
  const { AppModule } = await import('./app.module.js');

  // Validated before Nest exists: a malformed environment must abort the boot outright.
  const env = validateEnv(process.env);
  const logger = createLogger(env);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger,
    bufferLogs: true,
  });

  const runner = app.get(JobRunner);
  const dataSource = app.get<DataSource>(DATA_SOURCE);

  logger.log(
    `patches worker starting (env=${env.NODE_ENV}, workerId=${env.WORKER_ID}, ` +
      `concurrency=${String(env.WORKER_CONCURRENCY)})`,
    'Bootstrap',
  );

  if (env.METRICS_ENABLED === 'true') {
    const { startMetricsServer } = await import('@patches/observability/metrics-server');
    await startMetricsServer(env.METRICS_PORT);
    logger.log(`metrics server listening on :${String(env.METRICS_PORT)}`, 'Bootstrap');
  }

  const runPromise = runner.run();

  // Only starts counting down once a shutdown signal actually arrives — a healthy worker
  // that never receives SIGTERM/SIGINT must run forever, not be force-closed after
  // `SHUTDOWN_TIMEOUT_MS` regardless of signals (that would turn every deploy into an
  // automatic 10-second restart loop).
  const timedOut = Symbol('shutdown-timeout');
  let shuttingDown = false;
  const forcedTimeout = new Promise<typeof timedOut>((resolve) => {
    const shutdown = (signal: string): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.log(
        `received ${signal}, draining (up to ${String(SHUTDOWN_TIMEOUT_MS)}ms)`,
        'Bootstrap',
      );
      runner.requestStop();
      setTimeout(() => {
        resolve(timedOut);
      }, SHUTDOWN_TIMEOUT_MS).unref();
    };
    process.once('SIGTERM', () => {
      shutdown('SIGTERM');
    });
    process.once('SIGINT', () => {
      shutdown('SIGINT');
    });
  });

  const outcome = await Promise.race([runPromise.then(() => undefined), forcedTimeout]);
  if (outcome === timedOut) {
    // In-flight jobs are still running past the bounded shutdown window. They keep their
    // `PROCESSING` lease (never forcibly reset mid-handler — that would risk double
    // processing) and remain visible to an operator via `locked_by`/`locked_at`; closing the
    // DataSource under them is the least-bad option left once the timeout has been exceeded.
    logger.warn(
      `shutdown timeout (${String(SHUTDOWN_TIMEOUT_MS)}ms) exceeded with jobs still in flight; closing anyway`,
      'Bootstrap',
    );
  }

  await dataSource.destroy();
  await app.close();
  logger.log('patches worker stopped', 'Bootstrap');
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && basename(invokedPath) === 'main.js') {
  bootstrap().catch((error: unknown) => {
    // The logger may not exist yet (config failures happen first), so this is the
    // one place the worker writes directly to stderr.
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    new Logger('Bootstrap').error(message);
    process.exitCode = 1;
  });
}
