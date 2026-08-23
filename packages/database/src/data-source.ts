import 'reflect-metadata';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities/index.js';
import { ALL_MIGRATIONS } from './migrations/index.js';
import { SnakeNamingStrategy } from './naming/snake-naming.strategy.js';

export interface CreateDataSourceOptionsInput {
  url: string;
  /** Enable TLS. Certificate verification is always on — see `sslCa`. */
  ssl?: boolean;
  /**
   * PEM CA bundle used to verify the server certificate. Supply this when the database
   * presents a private/self-signed CA (Fly.io Postgres, an internal cluster) instead of
   * reaching for `rejectUnauthorized: false`, which disables verification entirely and turns
   * TLS into encryption without authentication — i.e. no defense against an active MITM
   * (§101). There is deliberately no option to skip verification.
   */
  sslCa?: string;
  poolMax?: number;
  logging?: boolean;
  statementTimeout?: string;
}

/**
 * Builds `DataSourceOptions` for PostgreSQL, shared by the Nest apps, the TypeORM CLI
 * (`src/cli/data-source.ts`), and `packages/testkit`.
 *
 * TLS verification is likewise not negotiable: when `ssl` is on, `rejectUnauthorized` is
 * always `true` and a private CA is supplied via `sslCa` rather than by disabling
 * verification (§101).
 *
 * `synchronize` and `migrationsRun` are **hard-coded `false`** — not derived from any
 * input, not overridable — per `INITIAL_VISION.md` §16.1 / spec §153 ("No `synchronize:
 * true`"). Schema changes ship as reviewed migrations only; `migration:run` is an explicit
 * release step, never something that races at app startup.
 */
export function createDataSourceOptions(input: CreateDataSourceOptionsInput) {
  const {
    url,
    ssl = false,
    sslCa,
    poolMax = 10,
    logging = false,
    statementTimeout = '10s',
  } = input;
  // node-postgres interprets `statement_timeout` as **milliseconds** (a number); a string
  // like '10s' gets coerced to `10`, i.e. a 10-millisecond fuse that randomly kills any
  // statement slower than a trivial SELECT (seen as migration-run flakiness). Accept the
  // human unit strings the env schema promises and hand pg a number.
  const timeoutMatch = /^(\d+)(ms|s)$/.exec(statementTimeout);
  const statementTimeoutMs = timeoutMatch
    ? Number(timeoutMatch[1]) * (timeoutMatch[2] === 's' ? 1000 : 1)
    : Number(statementTimeout);
  if (!Number.isFinite(statementTimeoutMs) || statementTimeoutMs <= 0) {
    throw new Error(`Invalid statement timeout: ${statementTimeout}`);
  }
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: true, ...(sslCa === undefined ? {} : { ca: sslCa }) } : false,
    synchronize: false,
    migrationsRun: false,
    logging,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [...ALL_ENTITIES],
    migrations: [...ALL_MIGRATIONS],
    extra: { max: poolMax, statement_timeout: statementTimeoutMs },
  } satisfies DataSourceOptions;
}

export function createDataSource(input: CreateDataSourceOptionsInput): DataSource {
  return new DataSource(createDataSourceOptions(input));
}
