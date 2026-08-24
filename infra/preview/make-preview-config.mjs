#!/usr/bin/env node
/**
 * Generate a per-PR preview Fly config from infra/preview/fly-preview.toml (B-105).
 *
 *   node infra/preview/make-preview-config.mjs --pr 123
 *
 * Replaces every `__PR__` token with the PR number and writes
 * `infra/preview/fly-pr-<N>.toml` into the SAME directory as the template — the
 * generated file must stay there so `[build] dockerfile = "../docker/Dockerfile"`
 * keeps resolving (flyctl resolves the path relative to the config file, while the
 * build context stays the repo root). The generated file is a CI artifact: never
 * commit it.
 *
 * Exits non-zero if the PR number is not a positive integer or any `__PR__` token
 * survives substitution, so a template edit can never ship half-templated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const prIndex = args.indexOf('--pr');
const prValue = prIndex !== -1 ? args[prIndex + 1] : undefined;

if (prValue === undefined || !/^\d+$/.test(prValue) || Number.parseInt(prValue, 10) < 1) {
  process.stderr.write(
    'usage: node infra/preview/make-preview-config.mjs --pr <positive-integer>\n',
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(here, 'fly-preview.toml');
const outputPath = resolve(here, `fly-pr-${prValue}.toml`);

const rendered = readFileSync(templatePath, 'utf8').replaceAll('__PR__', prValue);

if (rendered.includes('__PR__')) {
  process.stderr.write('template still contains an unsubstituted __PR__ token\n');
  process.exit(1);
}

writeFileSync(outputPath, rendered);
process.stdout.write(`${outputPath}\n`);
