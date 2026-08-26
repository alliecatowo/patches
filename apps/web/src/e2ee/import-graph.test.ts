/**
 * B-192: `apps/web/src/e2ee/**` ships in the Vite browser bundle — a `node:*` import
 * anywhere in its module graph either breaks at runtime (no such module in the browser)
 * or silently drags in a polyfill. The deleted `crypto.ts` barrel (B-188) claimed to
 * guard this but nothing imported it, so it enforced nothing.
 *
 * This walks the *transitive* graph of relative (same-repo) imports starting from every
 * non-test module under this directory, following relative specifiers wherever they lead
 * (including outside `e2ee/`, e.g. into `../lib` or `../api`), and fails if any file in
 * that closure imports a `node:*` builtin.
 *
 * Deliberately NOT transitive into bare specifiers (npm packages, `@patches/*` workspace
 * packages such as `@patches/crypto`) — those are resolved through `node_modules`/package
 * exports, not read as source here, so a `node:*` import buried inside one of them would
 * not be caught by this test. The companion `no-restricted-imports` ESLint rule
 * (`eslint.config.js`, scoped to `apps/web/src/e2ee/**`) only catches *direct* `node:*`
 * imports in this directory's own files — together the two catch direct imports here and
 * transitive imports through this app's own relative-import graph, but not a `node:*`
 * import hidden inside a dependency's package source.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const THIS_FILE = fileURLToPath(import.meta.url);
const E2EE_DIR = dirname(THIS_FILE);

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

/** Matches `from '...'`, bare `import '...'`, and dynamic `import('...')` specifiers. */
const SPECIFIER_PATTERN =
  /\bfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => RESOLVABLE_EXTENSIONS.includes(extname(name)))
    .filter((name) => !/\.(test|spec)\.tsx?$/.test(name))
    .map((name) => join(dir, name));
}

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

/** Resolves a relative specifier to a file on disk, trying extensions and `/index`. */
function resolveRelative(fromFile: string, specifier: string): string | undefined {
  // NodeNext-style specifiers reference the compiled .js output, not the .ts source on
  // disk (e.g. `./vault.js` for `vault.ts`) — strip it before probing extensions.
  const withoutJsExtension = specifier.replace(/\.(m|c)?js$/, '');
  const base = resolve(dirname(fromFile), withoutJsExtension);
  const candidates = [
    base,
    ...RESOLVABLE_EXTENSIONS.map((ext) => base + ext),
    ...RESOLVABLE_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not a file at this candidate path — try the next extension/index guess
    }
  }
  return undefined;
}

interface NodeImportViolation {
  readonly file: string;
  readonly specifier: string;
}

/**
 * Walks the transitive relative-import graph from `entryFiles`, returning every
 * `node:*` specifier found in any reachable file. Bare (non-relative) specifiers other
 * than `node:*` itself are recorded as edges but not followed — see file header.
 */
function findNodeImportsInGraph(entryFiles: readonly string[]): NodeImportViolation[] {
  const visited = new Set<string>();
  const violations: NodeImportViolation[] = [];
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, 'utf8');
    for (const specifier of extractSpecifiers(source)) {
      if (specifier.startsWith('node:')) {
        violations.push({ file, specifier });
        continue;
      }
      if (!specifier.startsWith('.')) continue; // bare specifier — not followed, see file header
      const resolved = resolveRelative(file, specifier);
      if (resolved !== undefined && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return violations;
}

describe('e2ee module graph', () => {
  it('has no node:* import anywhere in its transitive relative-import graph', () => {
    const entryFiles = listSourceFiles(E2EE_DIR).filter((file) => file !== THIS_FILE);
    expect(entryFiles.length).toBeGreaterThan(0);

    const violations = findNodeImportsInGraph(entryFiles);

    expect(violations).toEqual([]);
  });
});
