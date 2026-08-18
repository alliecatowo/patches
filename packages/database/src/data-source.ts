import 'reflect-metadata';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities/index.js';
import { ALL_MIGRATIONS } from './migrations/index.js';
import { SnakeNamingStrategy } from './naming/snake-naming.strategy.js';

export interface CreateDataSourceOptionsInput {
  url: string;
  ssl?: boolean;
  poolMax?: number;
  logging?: boolean;
}

/**
 * Builds `DataSourceOptions` for PostgreSQL, shared by the Nest apps, the TypeORM CLI
 * (`src/cli/data-source.ts`), and `packages/testkit`.
 *
 * `synchronize` and `migrationsRun` are **hard-coded `false`** — not derived from any
 * input, not overridable — per `INITIAL_VISION.md` §16.1 / spec §153 ("No `synchronize:
 * true`"). Schema changes ship as reviewed migrations only; `migration:run` is an explicit
 * release step, never something that races at app startup.
 */
export function createDataSourceOptions(input: CreateDataSourceOptionsInput) {
  const { url, ssl = false, poolMax = 10, logging = false } = input;
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    synchronize: false,
    migrationsRun: false,
    logging,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [...ALL_ENTITIES],
    migrations: [...ALL_MIGRATIONS],
    extra: { max: poolMax },
  } satisfies DataSourceOptions;
}

export function createDataSource(input: CreateDataSourceOptionsInput): DataSource {
  return new DataSource(createDataSourceOptions(input));
}
