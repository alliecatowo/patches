import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { ALL_ENTITIES } from './index.js';

/**
 * Guard for docs/architecture/data-model.md's own promise (its preamble commits to
 * documenting every table). Every `@Entity({ name: ... })` table name must appear
 * somewhere in the doc, wrapped in backticks the way every existing section does
 * (e.g. `` `federation_keys` ``) — this is a cheap substring check, not a schema diff,
 * so it only catches "never mentioned at all", not "documented with stale columns".
 */
describe('data-model.md documents every entity table', () => {
  const docPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '..',
    'docs',
    'architecture',
    'data-model.md',
  );
  const doc = readFileSync(docPath, 'utf8');
  const targets = new Set<unknown>(ALL_ENTITIES);
  const tables = getMetadataArgsStorage().tables.filter((table) => targets.has(table.target));

  it('found at least one table to check (guards against an empty/broken filter)', () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it.each(
    tables
      .map((table) => table.name)
      .filter((name): name is string => typeof name === 'string')
      .map((name) => [name] as const),
  )('table `%s` is mentioned in data-model.md', (name) => {
    expect(doc.includes(`\`${name}\``)).toBe(true);
  });
});
