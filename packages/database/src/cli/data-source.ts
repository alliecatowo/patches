import { fileURLToPath } from 'node:url';
import { readDotEnvFile } from '@patches/config';
import { createDataSource } from '../data-source.js';

// Load the repo-root `.env` if present, without overriding anything already set (e.g. by
// CI, `fly secrets`, or a shell export) — lets `pnpm db:*` work out of the box in local dev
// per docs/operations/local-development.md, while still letting CI/production set
// DATABASE_URL however they like.
const repoRootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
for (const [key, value] of Object.entries(readDotEnvFile(repoRootEnvPath))) {
  process.env[key] ??= value;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repo root (or export DATABASE_URL) before running the TypeORM CLI.',
  );
}

// The TypeORM CLI (`typeorm migration:run -d ...`) expects this module to export a
// DataSource instance — see `CommandUtils.loadDataSource` in the typeorm source, which
// accepts either the module's default export or exactly one named export resolving to a
// DataSource.
export default createDataSource({
  url: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === '1',
  logging: process.env.DATABASE_LOGGING === 'true',
});
