import { readFileSync } from 'node:fs';

/**
 * Tiny `.env` file parser: `KEY=VALUE` pairs, blank lines, `#` comments, and single/double
 * quoted values (double-quoted values expand `\n`, `\"`, `\\`; single-quoted values are
 * taken literally). Not a dependency on the `dotenv` package by design (see
 * `docs/research/typeorm-postgres.md` / package conventions) — apps opt in explicitly by
 * calling this and merging the result into `process.env` themselves, e.g.:
 *
 * ```ts
 * for (const [key, value] of Object.entries(readDotEnvFile('.env'))) {
 *   process.env[key] ??= value;
 * }
 * ```
 *
 * Returns `{}` if the file doesn't exist — callers can call this unconditionally during
 * development without checking for the file first. Any other read error propagates.
 */
export function readDotEnvFile(path: string): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return {};
    throw error;
  }

  const result: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match as unknown as [string, string, string];
    result[key] = parseValue(rawValue);
  }
  return result;
}

function parseValue(rawValue: string): string {
  const trimmed = rawValue.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  // Unquoted: strip a trailing ` # comment`, if present.
  const commentIndex = trimmed.indexOf(' #');
  return (commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex)).trim();
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
