/**
 * A tiny, dependency-free subset of semver 2.0.0 precedence (https://semver.org/#spec-item-11) —
 * just enough to order `apps/tui/package.json`'s version against a GitHub release tag like
 * `v0.1.0-alpha.3`. No range/caret parsing, no build-metadata handling beyond discarding it
 * (`+...` is stripped and ignored, exactly as the spec says it must not affect precedence).
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated identifiers after the first `-`; numeric segments are parsed to `number`. */
  prerelease: readonly (string | number)[];
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+.*)?$/;

/** Parses `1.2.3`, `v1.2.3`, and `1.2.3-alpha.2` (with an optional leading `v` and trailing
 * `+build` metadata); returns `undefined` for anything that isn't a valid dotted-triple version. */
export function parseVersion(version: string): ParsedVersion | undefined {
  const match = VERSION_PATTERN.exec(version.trim());
  if (match === null) return undefined;
  const [, major, minor, patch, prereleaseRaw] = match;
  if (major === undefined || minor === undefined || patch === undefined) return undefined;

  const prerelease =
    prereleaseRaw === undefined || prereleaseRaw === ''
      ? []
      : prereleaseRaw.split('.').map((identifier) => {
          // A numeric identifier per semver is digits-only with no leading zero (other than
          // "0" itself); anything else (including "01") stays a string and sorts lexically.
          if (/^(?:0|[1-9]\d*)$/.test(identifier)) return Number(identifier);
          return identifier;
        });

  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease };
}

/**
 * Semver precedence comparison: negative if `a < b`, positive if `a > b`, `0` if equal in
 * precedence. Throws if either string isn't a parseable version — callers here always feed it
 * versions already validated by `parseVersion` (GitHub tags) or read from `package.json`.
 */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (parsedA === undefined) throw new Error(`compareVersions: not a valid version: ${a}`);
  if (parsedB === undefined) throw new Error(`compareVersions: not a valid version: ${b}`);
  return compareParsed(parsedA, parsedB);
}

function compareParsed(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  // Rule 11.3: a version *with* a prerelease has lower precedence than the same
  // major.minor.patch *without* one (0.1.0-alpha.3 < 0.1.0).
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const identifierA = a[index];
    const identifierB = b[index];
    // Rule 11.4.4: a larger set of identifiers wins when all preceding ones are equal.
    if (identifierA === undefined) return -1;
    if (identifierB === undefined) return 1;

    if (typeof identifierA === 'number' && typeof identifierB === 'number') {
      if (identifierA !== identifierB) return identifierA - identifierB;
      continue;
    }
    // Rule 11.4.3: numeric identifiers always have lower precedence than alphanumeric ones.
    if (typeof identifierA === 'number') return -1;
    if (typeof identifierB === 'number') return 1;

    if (identifierA !== identifierB) return identifierA < identifierB ? -1 : 1;
  }
  return 0;
}

/** `true` when `candidate` has strictly greater semver precedence than `current`. */
export function isNewerVersion(current: string, candidate: string): boolean {
  return compareVersions(candidate, current) > 0;
}
