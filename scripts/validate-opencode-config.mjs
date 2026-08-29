#!/usr/bin/env node
/**
 * Static validation of the repo-scoped OpenCode LSP config.
 *
 * Verifies that `opencode.json` enables the TypeScript language server for the
 * extensions the monorepo compiles. This is a cheap structural gate that CI and
 * agents can run without starting an LSP process; the companion
 * `scripts/smoke-opencode-lsp.mjs` proves the server actually answers a
 * definition query.
 *
 * Usage: node scripts/validate-opencode-config.mjs
 * Exit 0 when the config is present and well-shaped, 1 otherwise.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'opencode.json');

// The TypeScript family the monorepo compiles (apps + packages). The LSP server
// must cover every one of these or navigation silently goes missing.
const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

let config;
try {
  config = JSON.parse(await readFile(configPath, 'utf8'));
} catch (e) {
  console.error(`FAIL opencode.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

const errors = [];
if (config.lsp == null || typeof config.lsp !== 'object' || Array.isArray(config.lsp)) {
  errors.push('"lsp" must be an object enabling LSP servers');
} else {
  const ts = config.lsp.typescript;
  if (!ts || typeof ts !== 'object' || Array.isArray(ts)) {
    errors.push('lsp.typescript entry is missing');
  } else {
    if (!Array.isArray(ts.command) || ts.command.length === 0) {
      errors.push('lsp.typescript.command must be a non-empty array');
    }
    if (!Array.isArray(ts.extensions)) {
      errors.push('lsp.typescript.extensions must be an array');
    } else {
      for (const ext of TS_EXTENSIONS) {
        if (!ts.extensions.includes(ext)) errors.push(`lsp.typescript.extensions missing ${ext}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('FAIL OpenCode TypeScript LSP config invalid:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `OK OpenCode TypeScript LSP enabled for: ${config.lsp.typescript.extensions.join(', ')}`,
);
