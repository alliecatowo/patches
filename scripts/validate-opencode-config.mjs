#!/usr/bin/env node
/**
 * Static validation of the repo-scoped OpenCode config.
 *
 * Verifies that `opencode.json` enables the TypeScript language server for the
 * extensions the monorepo compiles, and that the goal plugin
 * (`@prevalentware/opencode-goal-plugin`) is declared in the root project config
 * (not a non-documented `.opencode/opencode.json`). This is a cheap structural
 * gate that CI and agents can run without starting an LSP process; the companion
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

// The goal plugin must live in the root project config so it loads in every
// session. `.opencode/opencode.json` is not a documented config location, so a
// plugin declared only there is fragile.
const GOAL_PLUGIN = '@prevalentware/opencode-goal-plugin';
const pluginErrors = [];
if (!Array.isArray(config.plugin) || config.plugin.length === 0) {
  pluginErrors.push('"plugin" must be a non-empty array');
} else {
  const goal = config.plugin.find((entry) => Array.isArray(entry) && entry[0] === GOAL_PLUGIN);
  if (!goal) {
    pluginErrors.push(`plugin entry for ${GOAL_PLUGIN} is missing`);
  } else if (goal[1] == null || typeof goal[1] !== 'object') {
    pluginErrors.push(`${GOAL_PLUGIN} options object is missing`);
  } else if (goal[1].auto_continue !== true) {
    pluginErrors.push(`${GOAL_PLUGIN} auto_continue must be true`);
  }
}
if (pluginErrors.length > 0) {
  console.error('FAIL OpenCode goal plugin config invalid:');
  for (const e of pluginErrors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `OK OpenCode TypeScript LSP enabled for: ${config.lsp.typescript.extensions.join(', ')}`,
);
console.log(`OK OpenCode goal plugin present: ${GOAL_PLUGIN}`);
