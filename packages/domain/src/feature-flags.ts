/**
 * Feature flags / remote config (spec §184.3, issue #142) — a hand-rolled, node-served flag
 * map, not an external SaaS (client SDKs leak caller IPs to a third party; a self-hosted
 * Unleash/Flipt-class server is one more Fly service for a 2-person pre-alpha; see the 2026-08-26
 * research note this issue carries and `docs/architecture/rollouts.md`). The evaluation function
 * below is a pure function over a generic `{ name, enabled, kind }` payload so a real flag
 * backend (Unleash/Flipt) can later replace `FEATURE_FLAG_DEFINITIONS` + the env-driven
 * overrides without touching any call site in either client.
 *
 * Amendment B (§184.3): "no paywalled function; cosmetics may be capability-gated, capabilities
 * never gate function." A flag is exactly a capability in this sense — `kind` is mandatory and
 * restricted to the two values below so a flag can never silently gate a function path. Gating a
 * function behind a flag is a code-review violation, not something this type system alone can
 * catch; `FEATURE_FLAG_DEFINITIONS`'s doc comment on each entry is where a reviewer checks the
 * claim.
 */

/**
 * `cosmetic` — a skin/theme/decoration difference; the underlying function is identical with the
 * flag on or off. `rollout` — a gradual-exposure switch for an already-shippable, functionally
 * complete feature (e.g. staging a new route before every client build supports it) that every
 * capable client offers once enabled — never a permanent function fork.
 */
export type FeatureFlagKind = 'cosmetic' | 'rollout';

export interface FeatureFlagDefinition {
  /** Stable identifier, `lower_snake_case`. Never reused for an unrelated flag once retired —
   * same "never reuse a removed field number" discipline the protobuf layer uses, so a stale
   * client reading an old cached value can't be misled into a different meaning. */
  readonly name: string;
  readonly kind: FeatureFlagKind;
  /** Whether this flag is enabled when no env override is present. */
  readonly defaultEnabled: boolean;
  /** One line: what turns off when this flag is off, and why it's cosmetic/rollout not
   * function. */
  readonly description: string;
}

/**
 * The declared flag set. Empty in v0: no rollout is in flight yet. A new entry here is also a
 * commitment recorded in `docs/architecture/rollouts.md`'s rollout log.
 */
export const FEATURE_FLAG_DEFINITIONS: readonly FeatureFlagDefinition[] = Object.freeze([]);

export interface FeatureFlag {
  readonly name: string;
  readonly enabled: boolean;
  readonly kind: FeatureFlagKind;
}

/**
 * Resolves the declared flags against a set of env-sourced overrides (a flag name present in
 * `overrides` wins over its `defaultEnabled`). Pure — no I/O, no clock — so both the server
 * (`NodeService.getNodeInfo`) and a future alternate flag source can share it, and it's cheap to
 * unit test exhaustively.
 */
export function evaluateFeatureFlags(
  overrides: ReadonlyMap<string, boolean> = new Map(),
): FeatureFlag[] {
  return FEATURE_FLAG_DEFINITIONS.map((definition) => ({
    name: definition.name,
    kind: definition.kind,
    enabled: overrides.get(definition.name) ?? definition.defaultEnabled,
  }));
}
