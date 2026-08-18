import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions } from '@nestjs/microservices';

import { AppModule } from './app.module.js';
import { createLogger } from './common/logging/logger.factory.js';
import { validateEnv } from './config/env.schema.js';
import { createGrpcMicroservice } from './grpc-options.js';

async function bootstrap(): Promise<void> {
  // Validated before Nest exists: the bind address is needed to construct the
  // microservice, and a malformed environment must abort the boot outright.
  const env = validateEnv(process.env);
  const logger = createLogger(env);

  const url = `${env.GRPC_HOST}:${String(env.GRPC_PORT)}`;
  const { options, health } = createGrpcMicroservice(url);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    ...options,
    logger,
    bufferLogs: true,
  });

  // Registers SIGTERM/SIGINT/SIGHUP handlers that run `onModuleDestroy` /
  // `onApplicationShutdown` and close the gRPC server (spec §124).
  app.enableShutdownHooks();

  await app.listen();
  health.setStatus('SERVING');

  logger.log(
    `patches gRPC server listening on ${url} (env=${env.NODE_ENV}, instance=${env.INSTANCE_NAME})`,
    'Bootstrap',
  );

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
