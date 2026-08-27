import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CRYPTO_TRANSCRIPT_DOMAINS } from '../src/transcript-domains.js';

/**
 * Lives outside `src/` because it reads the package's own sources from disk, and `src/` is
 * compiled with `types: []` so it cannot use Node built-ins (same reason `scripts/` is separate).
 */
const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    // Test sources are excluded on purpose: they deliberately spell wrong domains and versions
    // to prove the decoder rejects them, and those must not be registered as domains in use.
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [path];
  });
}

function literalsIn(source: string): string[] {
  return Array.from(source.matchAll(/'(patches-e2ee[^']*)'/g), (match) => match[1] ?? '');
}

describe('crypto transcript-domain registry (ADR 0033 §4)', () => {
  it('registers no domain twice', () => {
    expect(new Set(CRYPTO_TRANSCRIPT_DOMAINS).size).toBe(CRYPTO_TRANSCRIPT_DOMAINS.length);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(CRYPTO_TRANSCRIPT_DOMAINS)).toBe(true);
  });

  it('registers every patches-e2ee string literal in this package', () => {
    const registered = new Set(CRYPTO_TRANSCRIPT_DOMAINS);
    const unregistered = new Map<string, string>();
    for (const file of sourceFiles(srcDir)) {
      for (const literal of literalsIn(readFileSync(file, 'utf8'))) {
        if (!registered.has(literal)) unregistered.set(literal, file);
      }
    }
    expect(Object.fromEntries(unregistered)).toEqual({});
  });

  it('finds the literals it claims to scan', () => {
    // Guards the scan itself: an empty or mis-globbed sweep would make the test above vacuous.
    const found = sourceFiles(srcDir).flatMap((file) => literalsIn(readFileSync(file, 'utf8')));
    expect(new Set(found).size).toBe(CRYPTO_TRANSCRIPT_DOMAINS.length);
  });
});
