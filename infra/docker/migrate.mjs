#!/usr/bin/env node
/**
 * Runs pending TypeORM migrations against `DATABASE_URL` and exits. Used as the Fly
 * `release_command` (`infra/fly/fly.toml`) so migrations apply once, before new
 * Machines take traffic — never at app startup (spec §153, `createDataSourceOptions`
 * hard-codes `migrationsRun: false`).
 *
 * This is deliberately NOT `packages/database`'s own CLI (`pnpm --filter @patches/database
 * migration:run`, i.e. `tsx ./node_modules/typeorm/cli.js migration:run -d
 * src/cli/data-source.ts`): that script runs TypeScript source through `tsx`, a
 * devDependency of `packages/database` that a `pnpm deploy --prod` runtime image
 * deliberately excludes (see `infra/docker/Dockerfile`). Rather than adding a
 * production-only entrypoint inside `packages/database` (out of scope for P7-001 — owned
 * by whichever agent works that package), this script calls the same already-compiled
 * `createDataSource` export (`packages/database/dist/index.{js,cjs}`) that
 * `@patches/server` and `@patches/worker` already depend on and ship in their own
 * `node_modules` after `pnpm deploy`. It is copied to `server/migrate.mjs` in the runtime
 * image specifically so Node's ESM resolution finds `@patches/database` there.
 *
 * If `packages/database` ever grows its own compiled migration entrypoint, prefer that
 * and delete this file — see the deviation noted in docs/operations/deployment.md.
 */
import { createDataSource } from '@patches/database';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('migrate.mjs: DATABASE_URL is not set.');
  process.exit(1);
}

const dataSource = createDataSource({
  url: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === '1',
  sslCa: process.env.DATABASE_SSL_CA,
  logging: process.env.DATABASE_LOGGING === 'true',
});

try {
  await dataSource.initialize();
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  console.log(`migrate.mjs: applied ${applied.length} migration(s).`);
  for (const migration of applied) {
    console.log(`  - ${migration.name}`);
  }
} finally {
  await dataSource.destroy();
}
