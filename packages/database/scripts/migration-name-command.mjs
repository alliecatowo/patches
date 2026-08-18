#!/usr/bin/env node
// Wraps `typeorm migration:generate`/`migration:create`, which take a positional `<path>`
// argument (and derive the migration's name from its basename), with a `--name=Foo` flag
// so `pnpm db:generate --name=Foo` writes `src/migrations/<timestamp>-Foo.ts` without every
// caller having to spell out the `src/migrations/` prefix by hand.
//
// Usage: node scripts/migration-name-command.mjs <generate|create> --name=Foo [...extra typeorm flags]
import { spawnSync } from 'node:child_process';

const [command, ...rest] = process.argv.slice(2);

if (command !== 'generate' && command !== 'create') {
  console.error(
    'Usage: node scripts/migration-name-command.mjs <generate|create> --name=<PascalCaseName>',
  );
  process.exit(1);
}

const nameArg = rest.find((arg) => arg.startsWith('--name='));
if (!nameArg) {
  console.error(`Usage: pnpm db:${command} --name=<PascalCaseName>`);
  console.error(`Writes src/migrations/<timestamp>-<PascalCaseName>.ts`);
  process.exit(1);
}

const name = nameArg.slice('--name='.length);
if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
  console.error(`Invalid migration name: "${name}". Use PascalCase, letters and digits only.`);
  process.exit(1);
}

const passthroughArgs = rest.filter((arg) => arg !== nameArg);
// `migration:generate` needs a DataSource to diff against; `migration:create` writes an
// empty template and doesn't touch the database at all.
const dataSourceArgs = command === 'generate' ? ['-d', 'src/cli/data-source.ts'] : [];

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'tsx',
    './node_modules/typeorm/cli.js',
    `migration:${command}`,
    `src/migrations/${name}`,
    ...dataSourceArgs,
    ...passthroughArgs,
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
