import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDataSourceOptions } from '@patches/database';

import { AppConfigService } from '../config/app-config.service.js';

/**
 * Wires the shared `@patches/database` DataSource into Nest's DI (spec §16, §128).
 *
 * The options come from `createDataSourceOptions()` rather than being rebuilt here, so the
 * server, the worker, the TypeORM CLI and the test harness all connect with the same entity
 * list, naming strategy and — crucially — the same hard-coded `synchronize: false` (§153).
 * Migrations are an explicit release step; nothing here runs them at boot.
 *
 * `@Global` because almost every feature module needs a repository, and repeating
 * `TypeOrmModule.forFeature([...])`'s parent import in each of them buys nothing.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const url = config.databaseUrl;
        if (url === undefined) {
          // Reached only outside production (the env schema already requires DATABASE_URL
          // there). Failing at boot with a named variable beats connecting to nothing and
          // failing on the first query.
          throw new Error(
            'DATABASE_URL is not set. Copy .env.example to .env and start PostgreSQL with ' +
              '`mise run compose -- up -d`.',
          );
        }

        return {
          ...createDataSourceOptions({
            url,
            ssl: config.databaseSsl,
            poolMax: config.databasePoolMax,
            logging: false,
          }),
          // Nest retries the initial connection; a developer or a test wants the failure
          // now, a production boot during a database failover does not.
          retryAttempts: config.isProduction ? 10 : 1,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
