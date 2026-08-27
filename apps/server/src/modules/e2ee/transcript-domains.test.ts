import { CRYPTO_TRANSCRIPT_DOMAINS } from '@patches/crypto';
import { DOMAIN_TRANSCRIPT_DOMAINS } from '@patches/domain';
import { describe, expect, it } from 'vitest';

/**
 * The cross-package half of ADR 0033 §4's registry. `@patches/crypto` owns the identity-transcript
 * domains (messaging root, device certificate, device roster, prekey bundle, X3DH, double
 * ratchet, franking); `@patches/domain` owns the conversation-level ones (fanout, group control,
 * history transfer, recovery archive, control envelope). This module cannot host either registry
 * itself — `@patches/crypto` must not depend on `@patches/domain` (ADR 0033 §1) and the server
 * cannot edit either package — but it is the one place that imports both, so it is where "no
 * domain string is reused across the two families" gets checked.
 */
describe('E2EE transcript domain registries (ADR 0033 §4)', () => {
  it('has no domain string shared between @patches/crypto and @patches/domain', () => {
    const cryptoSet = new Set(CRYPTO_TRANSCRIPT_DOMAINS);
    const overlap = DOMAIN_TRANSCRIPT_DOMAINS.filter((domain) => cryptoSet.has(domain));
    expect(overlap).toEqual([]);
  });

  it('registers only non-empty, distinct strings in each package', () => {
    for (const registry of [CRYPTO_TRANSCRIPT_DOMAINS, DOMAIN_TRANSCRIPT_DOMAINS]) {
      expect(registry.length).toBeGreaterThan(0);
      expect(new Set(registry).size).toBe(registry.length);
      for (const domain of registry) expect(domain.length).toBeGreaterThan(0);
    }
  });
});
