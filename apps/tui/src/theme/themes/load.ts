import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parseUserTheme, type InvalidUserTheme, type ParsedUserTheme } from './schema.js';

/** Mirrors `preferences/store.ts`'s XDG resolution so both live under one `patches/` config dir. */
export function configDir(): string {
  const configured = process.env.XDG_CONFIG_HOME?.trim();
  const base =
    configured === undefined || configured === '' ? join(homedir(), '.config') : configured;
  return join(base, 'patches');
}

export function userThemesDir(): string {
  return join(configDir(), 'themes');
}

export interface ThemeLoadOperations {
  readonly readFile: (path: string, encoding: 'utf8') => Promise<string>;
  readonly readdir: (path: string) => Promise<string[]>;
}

const FILE_OPERATIONS: ThemeLoadOperations = {
  readFile: (path, encoding) => readFile(path, encoding),
  readdir: (path) => readdir(path),
};

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export type LoadUserThemeResult =
  ParsedUserTheme | InvalidUserTheme | { ok: false; notFound: true };

/**
 * Reads and validates `<userThemesDir>/<name>.json`. Never throws: a missing file, unreadable
 * file, or JSON that fails `parseUserTheme` all come back as a typed failure so a caller
 * (theme resolution, `PreferencesScreen`) can fall back to the default theme with a toast
 * rather than crash the TUI over a hand-edited config file (P12-101).
 */
export async function loadUserTheme(
  name: string,
  operations: ThemeLoadOperations = FILE_OPERATIONS,
): Promise<LoadUserThemeResult> {
  const path = join(userThemesDir(), `${name}.json`);
  let raw: string;
  try {
    raw = await operations.readFile(path, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return { ok: false, notFound: true };
    return { ok: false, message: `Theme "${name}" could not be read.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, message: `Theme "${name}" is not valid JSON.` };
  }
  return parseUserTheme(name, parsed);
}

/** Names of every `*.json` file in the user themes directory, for a theme picker. Returns an
 * empty list (never throws) when the directory doesn't exist yet. */
export async function listUserThemeNames(
  operations: ThemeLoadOperations = FILE_OPERATIONS,
): Promise<readonly string[]> {
  let entries: string[];
  try {
    entries = await operations.readdir(userThemesDir());
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.slice(0, -'.json'.length))
    .sort((a, b) => a.localeCompare(b));
}
