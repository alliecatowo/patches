import { E2EE_IDENTITY_TRANSCRIPT_DOMAIN } from './identity-transcript.js';
import { E2EE_PROTOCOL } from './types.js';

/**
 * Every domain-separation string this package signs or digests under (ADR 0033 §4).
 *
 * The companion `DOMAIN_TRANSCRIPT_DOMAINS` in `@patches/domain` lists that package's half; the
 * cross-package test asserts the union has no duplicates, so a seventh encoder cannot quietly
 * reuse a sixth encoder's prefix. `test/transcript-domains.test.ts` reads this package's sources
 * from disk and asserts every `patches-e2ee`-prefixed string literal appears here, so a new
 * encoder cannot quietly stay out of the registry either.
 *
 * The entries whose constants are module-private are spelled as literals; the test above is what
 * keeps them in step with their definitions.
 */
export const CRYPTO_TRANSCRIPT_DOMAINS: readonly string[] = Object.freeze([
  E2EE_PROTOCOL,
  E2EE_IDENTITY_TRANSCRIPT_DOMAIN,
  'patches-e2ee-v1/safety-number',
  'patches-e2ee-v1/x3dh-transcript',
  'patches-e2ee-v1/x3dh-kdf',
  'patches-e2ee-v1/double-ratchet/root-he-r4',
  'patches-e2ee-v1/double-ratchet/message',
  'patches-e2ee-v1/double-ratchet/header-he-r4',
  'patches-e2ee-v1/double-ratchet/body-he-r4',
  'patches-e2ee-v1/franking/commitment',
  'patches-e2ee-v1/franking/report',
  'patches-e2ee-v1/franking/envelope-ad',
]);
