import { Module } from '@nestjs/common';
import { createDataSource } from '@patches/database';
import type { DataSource } from 'typeorm';

import { AppConfigService } from '../config/app-config.service.js';

/** DI token for the initialized `DataSource` (no `@nestjs/typeorm` — see PACKAGE_CONVENTIONS.md). */
export const DATA_SOURCE = 'DATA_SOURCE';

/**
 * Builds and initializes the worker's `DataSource` from validated config. Not closed via a
 * Nest lifecycle hook: `DataSource` has no `onModuleDestroy`, so `main.ts` calls
 * `dataSource.destroy()` explicitly during shutdown, after the job runner has stopped
 * claiming and drained its in-flight work.
 */
@Module({
  providers: [
    {
      provide: DATA_SOURCE,
      useFactory: async (config: AppConfigService): Promise<DataSource> => {
        const dataSource = createDataSource({
          url: config.databaseUrl,
          ssl: config.databaseSsl,
          poolMax: config.databasePoolMax,
          statementTimeout: config.databaseStatementTimeout,
        });
        await dataSource.initialize();
        return dataSource;
      },
      inject: [AppConfigService],
    },
  ],
  exports: [DATA_SOURCE],
})
export class DatabaseModule {}
