import { describe, expect, it } from 'vitest';

import {
  evaluateFeatureFlags,
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagKind,
} from './feature-flags.js';

const VALID_KINDS: readonly FeatureFlagKind[] = ['cosmetic', 'rollout'];

describe('FEATURE_FLAG_DEFINITIONS', () => {
  it('gives every declared flag a valid kind (spec §184.3: capabilities never gate function)', () => {
    for (const definition of FEATURE_FLAG_DEFINITIONS) {
      expect(VALID_KINDS).toContain(definition.kind);
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate flag names', () => {
    const names = FEATURE_FLAG_DEFINITIONS.map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('evaluateFeatureFlags', () => {
  it('falls back to each definition default when no override is present', () => {
    const flags = evaluateFeatureFlags();
    expect(flags).toEqual(
      FEATURE_FLAG_DEFINITIONS.map((definition) => ({
        name: definition.name,
        kind: definition.kind,
        enabled: definition.defaultEnabled,
      })),
    );
  });

  it('lets an override win over the declared default', () => {
    const [first] = FEATURE_FLAG_DEFINITIONS;
    if (first === undefined) return; // No declared flags yet — nothing to override.
    const overridden = evaluateFeatureFlags(new Map([[first.name, !first.defaultEnabled]]));
    expect(overridden[0]?.enabled).toBe(!first.defaultEnabled);
  });

  it('ignores an override for an undeclared flag name', () => {
    const flags = evaluateFeatureFlags(new Map([['not_a_declared_flag', true]]));
    expect(flags).toHaveLength(FEATURE_FLAG_DEFINITIONS.length);
  });
});
