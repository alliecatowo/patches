#!/usr/bin/env node
// B-201 — production-mode gate for apps/web/dist, run after `vite build` and before deploy.
// A dev-mode (or otherwise mis-built) bundle can pass bundle:check (B-168) — it's a size
// check, not a mode check — and still get published (this happened: patches-web.pages.dev
// served a dev-mode dist for an unknown window before 2026-08-26, see docs/operations/web.md).
// This scans every emitted dist/**/*.js file (never *.js.map — vite.config.ts's
// sourcemap: true means maps legitimately embed dev source text and absolute build paths
// in sourcesContent, which is not executed code) for markers that only appear when the
// build ran in dev mode or leaked the builder's filesystem.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(webRoot, 'dist');

/** @type {{ pattern: RegExp; label: string }[]} */
const forbidden = [
  { pattern: /jsxDEV/, label: 'jsxDEV (dev JSX transform — build did not run in production mode)' },
  {
    pattern: /react-query-devtools/,
    label: "react-query-devtools (devtools chunk — see B-157, should be DCE'd in production)",
  },
  { pattern: /\/home\//, label: 'an absolute /home/ build-machine path' },
  { pattern: /\/Users\//, label: 'an absolute /Users/ build-machine path' },
  { pattern: /[A-Za-z]:\\/, label: 'an absolute Windows drive path' },
];

/**
 * Recursively collects every `.js` file under `dir` (never `.js.map`).
 * @param {string} dir
 * @returns {string[]}
 */
function collectJsFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

let jsFiles;
try {
  statSync(distDir);
  jsFiles = collectJsFiles(distDir);
} catch {
  console.error(`dist:check — no ${distDir}. Run \`pnpm --filter @patches/web build\` first.`);
  process.exit(1);
}

if (jsFiles.length === 0) {
  console.error(`dist:check — no .js files found under ${distDir}.`);
  process.exit(1);
}

let failed = false;
for (const filePath of jsFiles) {
  const contents = readFileSync(filePath, 'utf8');
  const relativePath = filePath.slice(webRoot.length + 1);
  for (const { pattern, label } of forbidden) {
    if (pattern.test(contents)) {
      failed = true;
      console.error(`dist:check — ${relativePath} contains ${label}.`);
    }
  }
}

if (failed) {
  console.error(
    'dist:check — this dist is not a clean production build. Run ' +
      '`rm -rf apps/web/dist && VITE_PATCHES_API_BASE=<url> pnpm --filter @patches/web build` ' +
      'and re-check before deploying. See docs/operations/web.md for the incident this guards against.',
  );
  process.exit(1);
}

console.log(`dist:check — ${jsFiles.length} emitted .js file(s) clean of dev-mode/path markers.`);
