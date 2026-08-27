/**
 * The registry ADR 0033 §4 requires: every domain-separation string `@patches/domain` signs or
 * digests under, in one frozen list. `@patches/crypto` keeps the matching `CRYPTO_TRANSCRIPT_DOMAINS`
 * for the identity-transcript family it owns; the union of the two is meant to have no duplicates,
 * and — reading each package's own source from disk — every `patches-e2ee`-prefixed string literal
 * in that package must appear in its own registry. A new encoder that reuses another's prefix, or
 * that forgets to register itself, fails one of those two checks.
 *
 * `E2EE_PROTOCOL_V1` (`patches-e2ee-v1`, `modes.ts`) is deliberately **not** listed here: it is a
 * protocol-version identifier compared for equality during capability negotiation
 * (`assertConversationModeNegotiation`, `assertDeviceSupportsProtocol`) and reused as the shared
 * prefix component of every domain string below, but nothing in this package signs or digests
 * bytes keyed on it directly. `transcript-domains.test.ts` documents this as an explicit exclusion
 * rather than silently passing the sweep.
 */
import { E2EE_CONTROL_ENVELOPE_DOMAIN } from './control.js';
import { E2EE_FANOUT_TRANSCRIPT_DOMAIN } from './envelopes.js';
import { E2EE_GROUP_CONTROL_TRANSCRIPT_DOMAIN } from './groups.js';
import { E2EE_HISTORY_TRANSFER_DOMAIN } from './history-transfer.js';
import { E2EE_RECOVERY_ARCHIVE_DOMAIN, E2EE_RECOVERY_ARCHIVE_KDF_INFO } from './recovery.js';

/**
 * Every domain-separation string `@patches/domain` signs or digests under, including
 * {@link E2EE_RECOVERY_ARCHIVE_KDF_INFO} — an HKDF info string rather than a transcript prefix,
 * but domain-separation for a key derivation is the same hazard a transcript prefix guards
 * against, so it is registered alongside the transcript domains rather than carved out.
 */
export const DOMAIN_TRANSCRIPT_DOMAINS: readonly string[] = Object.freeze([
  E2EE_FANOUT_TRANSCRIPT_DOMAIN,
  E2EE_GROUP_CONTROL_TRANSCRIPT_DOMAIN,
  E2EE_HISTORY_TRANSFER_DOMAIN,
  E2EE_RECOVERY_ARCHIVE_DOMAIN,
  E2EE_CONTROL_ENVELOPE_DOMAIN,
  E2EE_RECOVERY_ARCHIVE_KDF_INFO,
]);
