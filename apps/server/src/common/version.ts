/** A parsed `major.minor.patch` triple. Pre-release/build metadata is ignored. */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

/** Parse a semver string, returning `undefined` when it is not one. */
export function parseSemver(value: string): SemanticVersion | undefined {
  const match = SEMVER_RE.exec(value.trim());
  if (match === null) return undefined;
  // The regex guarantees three digit-only groups, so each `Number(...)` is finite.
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** `-1` if `a < b`, `0` if equal, `1` if `a > b`. */
export function compareSemver(a: SemanticVersion, b: SemanticVersion): -1 | 0 | 1 {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return 0;
}
