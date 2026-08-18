/**
 * A minimal hand-rolled `argv` parser — no dependency pulled in for this (spec §65 asks for
 * "a secure admin CLI", not a particular argument-parsing library).
 *
 * Shape assumed everywhere in `apps/admin`: `<group> <action> [<positional>...] [--flag
 * [value]]`. Flags may appear anywhere in `argv`; everything else is a positional, in order.
 * `--flag` followed by another `--flag` (or nothing) is a boolean `true`; `--flag value` is a
 * string. Repeating the same flag keeps the last value — good enough for a CLI with no
 * multi-valued options today.
 */
export interface ParsedArgs {
  /** Every non-flag token, in the order they appeared. `positionals[0]`/`[1]` are
   * conventionally the command group/action (`invite create`, `user suspend`, ...). */
  positionals: string[];
  /** `--foo` / `--foo bar`, keyed without the leading dashes. */
  options: Record<string, string | boolean>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;

    if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        options[name] = next;
        i += 1;
      } else {
        options[name] = true;
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, options };
}

/** Reads a required string option, throwing a CLI-friendly error if it is missing or a bare
 * boolean flag (`--reason` with no value). */
export function requireStringOption(options: ParsedArgs['options'], name: string): string {
  const value = options[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`--${name} is required.`);
  }
  return value;
}

/** Reads an optional string option — `undefined` if absent, and an error (not silently
 * ignored) if the flag was passed as a bare boolean, since that is almost always a typo
 * (`--note` with no text rather than `--note "..."`). */
export function optionalStringOption(
  options: ParsedArgs['options'],
  name: string,
): string | undefined {
  const value = options[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`--${name} needs a value.`);
  }
  return value;
}

export function optionalIntOption(
  options: ParsedArgs['options'],
  name: string,
): number | undefined {
  const raw = optionalStringOption(options, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
}

export function booleanOption(options: ParsedArgs['options'], name: string): boolean {
  return options[name] === true || options[name] === 'true';
}

/** Reads a required positional (`positionals[index]`) — every command's `<handle>`/`<id>`
 * argument goes through this rather than an unchecked array index, so a missing argument is
 * a CLI-friendly usage error instead of `undefined` silently reaching a SQL query. */
export function requirePositional(
  positionals: readonly string[],
  index: number,
  usage: string,
): string {
  const value = positionals[index];
  if (value === undefined || value.length === 0) {
    throw new Error(usage);
  }
  return value;
}

/** Parses `--expires <iso>`-shaped options into a `Date`, rejecting anything
 * `Date.parse`/`new Date()` cannot make sense of rather than silently producing `Invalid
 * Date` and writing it to the database. */
export function parseIsoDate(raw: string, name: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`--${name} must be a valid ISO 8601 date/time.`);
  }
  return date;
}
