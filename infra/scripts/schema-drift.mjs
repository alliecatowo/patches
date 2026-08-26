#!/usr/bin/env node
/**
 * `node infra/scripts/schema-drift.mjs` — schema drift gate (P19-025).
 *
 * Read-only with respect to the database: runs `atlas schema inspect` (schema
 * metadata only, never row data) against DATABASE_URL — which must be a
 * throwaway, fully migrated Postgres, never production — and compares the
 * resulting HCL to the checked-in snapshot `infra/scripts/schema.snapshot.hcl`.
 *
 *   node infra/scripts/schema-drift.mjs [--database-url <url>] [--atlas <path>]
 *                                       [--snapshot <path>] [--regenerate]
 *
 * DATABASE_URL is never printed; error output is redacted before display.
 * Exit 0 = no drift (or snapshot regenerated); exit 1 = drift detected.
 *
 * The snapshot header (leading `#` lines) is stripped before comparison so the
 * provenance comment can live inside the file itself. Anything below the header
 * must be byte-identical to atlas output — `--regenerate` is the only supported
 * way to change it. See docs/operations/schema-drift.md.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SNAPSHOT = fileURLToPath(new URL('./schema.snapshot.hcl', import.meta.url));
/** Pinned in .github/workflows/schema-drift.yml; a different local version may render HCL differently. */
const PINNED_ATLAS_VERSION = 'v1.3.1';

/**
 * @typedef {{ attrs: string[], columns: Map<string, string>, others: Map<string, string> }} TableShape
 * @typedef {{ tables: Map<string, TableShape>, tail: string[] }} SchemaShape
 */

function die(message) {
  process.stderr.write(`schema-drift: ${message}\n`);
  process.exit(1);
}

/** Never let a connection string's credentials reach the terminal. */
function redact(text) {
  return text.replaceAll(/\/\/[^@/\s]+@/g, '//***@');
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}

function parseArgs(argv) {
  /** @type {{ url: string|null, atlas: string, snapshot: string, regenerate: boolean }} */
  const parsed = { url: null, atlas: 'atlas', snapshot: DEFAULT_SNAPSHOT, regenerate: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--regenerate') parsed.regenerate = true;
    else if (arg === '--database-url' || arg === '--atlas' || arg === '--snapshot') {
      if (next === undefined) die(`${arg} requires a value`);
      parsed[arg === '--database-url' ? 'url' : arg === '--atlas' ? 'atlas' : 'snapshot'] = next;
      i++;
    } else {
      die(`unknown argument: ${arg}`);
    }
  }
  if (parsed.url === null) {
    parsed.url = process.env.DATABASE_URL ?? die('no --database-url and DATABASE_URL is not set');
  }
  return parsed;
}

/** Strip the leading `#` provenance header so comparison is atlas-output vs atlas-output. */
function stripHeader(text) {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('#')) i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i).join('\n').replace(/\n*$/, '\n');
}

const SNAPSHOT_HEADER = `# Patches expected database schema — Atlas HCL snapshot. Do not edit by hand.
# Regenerate with: node infra/scripts/schema-drift.mjs --regenerate
# (against a fully migrated, throwaway Postgres 17 — same major as CI/compose, never production).
# Produced by \`atlas community ${PINNED_ATLAS_VERSION} schema inspect\`, pinned in .github/workflows/schema-drift.yml.
# What this gate catches and why it exists: docs/operations/schema-drift.md
`;

/**
 * Line-based parse of atlas HCL: tables, their columns, and every other named
 * child block (foreign_key, index, primary_key, unique, …) as opaque text.
 * Relies only on atlas's stable 2-space indentation, which the pinned version
 * emits deterministically (verified by diffing two inspect runs of one schema).
 *
 * @param {string} text
 * @returns {SchemaShape}
 */
function parseSchema(text) {
  /** @type {SchemaShape} */
  const shape = { tables: new Map(), tail: [] };
  /** @type {TableShape|null} */
  let table = null;
  /** @type {{ kind: string, name: string|null, lines: string[] }|null} */
  let block = null;
  for (const line of text.split('\n')) {
    if (block !== null) {
      block.lines.push(line);
      if (line === '  }') {
        const rendered = block.lines.join('\n');
        if (block.kind === 'column' && block.name !== null) {
          table?.columns.set(block.name, rendered);
        } else if (table !== null) {
          table.others.set(`${block.kind}${block.name ? ` ${block.name}` : ''}`, rendered);
        }
        block = null;
      }
      continue;
    }
    const tableMatch = /^table "([^"]+)" \{$/.exec(line);
    if (tableMatch && table === null) {
      table = { attrs: [], columns: new Map(), others: new Map() };
      shape.tables.set(tableMatch[1], table);
      continue;
    }
    if (table !== null && line === '}') {
      table = null;
      continue;
    }
    // A named or bare child block of the current table, e.g. `column "id" {`
    // or `primary_key {`. Only recognized at exactly 2 spaces of indent.
    const childMatch = /^ {2}([a-z_]+)(?: "([^"]+)")? \{$/.exec(line);
    if (childMatch && table !== null) {
      block = { kind: childMatch[1], name: childMatch[2] ?? null, lines: [line] };
      continue;
    }
    if (table !== null && line.startsWith('  ')) {
      table.attrs.push(line);
    } else if (line.trim() !== '') {
      shape.tail.push(line);
    }
  }
  return shape;
}

/**
 * Human summary of what differs: tables/columns/other objects added, removed,
 * or changed. Full detail still comes from the unified diff printed after it.
 *
 * @param {SchemaShape} expected
 * @param {SchemaShape} actual
 * @returns {string}
 */
function summarize(expected, actual) {
  /** @type {string[]} */
  const lines = [];
  const push = (prefix, item) => lines.push(`  ${prefix} ${item}`);
  for (const name of actual.tables.keys()) {
    if (!expected.tables.has(name)) push('+', `table ${name} (in database, missing from snapshot)`);
  }
  for (const name of expected.tables.keys()) {
    if (!actual.tables.has(name))
      push('-', `table ${name} (in snapshot, not produced by migrations)`);
  }
  for (const [name, exp] of expected.tables) {
    const act = actual.tables.get(name);
    if (act === undefined) continue;
    for (const col of act.columns.keys()) {
      if (!exp.columns.has(col)) push('+', `${name}.${col} column`);
    }
    for (const [col, def] of exp.columns) {
      if (!act.columns.has(col)) push('-', `${name}.${col} column`);
      else if (act.columns.get(col) !== def) push('~', `${name}.${col} column definition`);
    }
    for (const key of act.others.keys()) {
      if (!exp.others.has(key)) push('+', `${name} ${key}`);
    }
    for (const [key, def] of exp.others) {
      if (!act.others.has(key)) push('-', `${name} ${key}`);
      else if (act.others.get(key) !== def) push('~', `${name} ${key}`);
    }
    if (act.attrs.join('\n') !== exp.attrs.join('\n')) push('~', `table ${name} attributes`);
  }
  if (expected.tail.join('\n') !== actual.tail.join('\n'))
    push('~', 'schema-level tail (non-table objects)');
  return lines.join('\n');
}

/** Unified diff via git so failures are loud and reviewable; git is required on PATH. */
function printUnifiedDiff(snapshotText, liveText) {
  const dir = mkdtempSync(join(tmpdir(), 'schema-drift-'));
  const expected = join(dir, 'expected-schema-snapshot.hcl');
  const actual = join(dir, 'actual-database-schema.hcl');
  writeFileSync(expected, snapshotText);
  writeFileSync(actual, liveText);
  try {
    run('git', ['diff', '--no-index', '--', expected, actual], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  } catch (err) {
    if (typeof err.status !== 'number' || err.status !== 1) {
      die(redact(`git diff failed: ${err.message ?? 'unknown error'}`));
    }
    // Exit 1 from `git diff` just means the files differ — that IS the drift.
  }
}

const args = parseArgs(process.argv.slice(2));
let atlasVersion;
try {
  atlasVersion = run(args.atlas, ['version']).split('\n')[0];
} catch (err) {
  die(
    `atlas binary not found at "${args.atlas}" (${err.code ?? err.message}); pass --atlas <path>`,
  );
}
if (!atlasVersion.includes(PINNED_ATLAS_VERSION)) {
  process.stderr.write(
    `schema-drift: WARNING ${atlasVersion} != pinned ${PINNED_ATLAS_VERSION}; HCL rendering may differ — regenerate with the pinned version (see docs/operations/schema-drift.md)\n`,
  );
}
process.stderr.write(`schema-drift: using ${atlasVersion}\n`);

let liveText;
try {
  liveText = stripHeader(run(args.atlas, ['schema', 'inspect', '-u', args.url]));
} catch (err) {
  const detail = err.stderr?.toString() ?? err.message ?? 'unknown error';
  die(`atlas schema inspect failed (exit ${err.status ?? '?'}): ${redact(detail)}`);
}

if (args.regenerate) {
  writeFileSync(args.snapshot, `${SNAPSHOT_HEADER}\n${liveText}`);
  const shape = parseSchema(liveText);
  process.stdout.write(
    [
      `schema-drift: regenerated ${args.snapshot} (${shape.tables.size} tables).`,
      'Commit it via a PR — this script never auto-commits. In CI, dispatch the',
      '"Schema drift" workflow with regenerate=true instead (it opens the PR for you).',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

let snapshotText;
try {
  snapshotText = stripHeader(readFileSync(args.snapshot, 'utf8'));
} catch {
  die(
    `snapshot ${args.snapshot} does not exist yet — run with --regenerate against a fully migrated throwaway Postgres, then commit it via a PR`,
  );
}

if (liveText === snapshotText) {
  process.stdout.write(`schema-drift: OK — database matches ${args.snapshot}\n`);
  process.exit(0);
}

const summary = summarize(parseSchema(snapshotText), parseSchema(liveText));
process.stdout.write(
  [
    'schema-drift: DRIFT DETECTED — migrated schema no longer matches the checked-in snapshot.',
    'A migration probably landed without regenerating the snapshot. Fix:',
    '  dispatch the "Schema drift" workflow with regenerate=true, or locally run',
    '  `node infra/scripts/schema-drift.mjs --regenerate` against a migrated throwaway Postgres,',
    '  then commit the snapshot via a PR.',
    '',
    'Summary of differences (+ database-only, - snapshot-only, ~ changed):',
    summary.trim() === '' ? '  (structural parser found nothing — see raw diff below)' : summary,
    '',
    'Unified diff:',
    '',
  ].join('\n'),
);
printUnifiedDiff(snapshotText, liveText);
process.exit(1);
