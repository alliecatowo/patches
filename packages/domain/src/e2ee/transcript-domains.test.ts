import { describe, expect, it } from 'vitest';

import * as e2ee from './index.js';
import { DOMAIN_TRANSCRIPT_DOMAINS } from './transcript-domains.js';

/**
 * `E2EE_PROTOCOL_V1` (`patches-e2ee-v1`) is the one deliberate exclusion ADR 0033 §4 anticipates:
 * a protocol-version identifier compared for equality during capability negotiation and reused as
 * the shared prefix of every domain string below, never itself a domain separator bytes are
 * signed or digested under. Every other exported `patches-e2ee`-prefixed string constant must be
 * in the registry.
 */
const EXCLUDED_EXPORT_NAMES: readonly string[] = ['E2EE_PROTOCOL_V1'];

describe('DOMAIN_TRANSCRIPT_DOMAINS', () => {
  it('has no duplicates', () => {
    expect(new Set(DOMAIN_TRANSCRIPT_DOMAINS).size).toBe(DOMAIN_TRANSCRIPT_DOMAINS.length);
  });

  it('contains every exported patches-e2ee-prefixed constant, minus the documented protocol-id exclusion', () => {
    const unregistered: string[] = [];
    for (const [name, value] of Object.entries(e2ee)) {
      if (typeof value !== 'string' || !value.startsWith('patches-e2ee')) continue;
      if (EXCLUDED_EXPORT_NAMES.includes(name)) continue;
      if (!DOMAIN_TRANSCRIPT_DOMAINS.includes(value)) unregistered.push(`${name}=${value}`);
    }
    expect(unregistered).toEqual([]);
  });

  it('excludes E2EE_PROTOCOL_V1 deliberately, not by accident', () => {
    expect(e2ee.E2EE_PROTOCOL_V1).toBe('patches-e2ee-v1');
    expect(DOMAIN_TRANSCRIPT_DOMAINS).not.toContain(e2ee.E2EE_PROTOCOL_V1);
    expect(EXCLUDED_EXPORT_NAMES).toContain('E2EE_PROTOCOL_V1');
  });
});
