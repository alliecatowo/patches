/**
 * Peer history transfer — client composition over the domain contract (P13-011,
 * ADR 0020 §7/§10).
 *
 * The format, bounds, and validators live in `@patches/domain`'s
 * `history-transfer.ts`; this module is the TUI-side bridge that supplies the one thing
 * the domain package must never grow — a real digest implementation — plus the two
 * entry points the send and receive paths (P13-010's UX wiring) call:
 *
 *   * **Send**: `buildHistoryTransfer` turns held, already-decrypted messages into the
 *     canonical record bytes that become the logical plaintext of an ordinary
 *     `SendEnvelopes` message. The record rides the exact pairwise fanout, gets franked
 *     like every message, and is sealed under each recipient device's ratchet session by
 *     the normal envelope path — there is no history-specific wire surface at all.
 *   * **Receive**: `parseHistoryTransfer` decodes and fully validates a plaintext that
 *     arrived through `openDeviceEnvelope`. Display-only by construction: it returns
 *     entries, never anything the vault's ratchet records could consume.
 *
 * Provenance, stated plainly because a UI that overclaims here lies to the user: the
 * authentication a recipient gets is *channel* authentication — these bytes came from a
 * device holding a verified ratchet session and passed the franking check. No signature
 * covers the original content (deniability, ADR 0020 §9), so transferred history renders
 * as "re-delivered by device X", never as original verified traffic.
 */
import { sha256Hash } from '@patches/crypto';

import {
  decodeHistoryTransfer,
  encodeHistoryTransfer,
  type E2eeHistoryTransferFields,
  type E2eeHistoryTransferView,
} from '@patches/domain';
import type { Bytes, DigestFunction } from '@patches/domain';

/** The repo's one digest function, bridged into the domain contract's injected seam. */
export const sha256Digest: DigestFunction = (input: Bytes): Bytes => sha256Hash(input);

/** Builds the canonical, bounded transfer record a member re-delivers as one message. */
export function buildHistoryTransfer(fields: E2eeHistoryTransferFields): E2eeHistoryTransferView {
  return encodeHistoryTransfer(fields, { digest: sha256Digest });
}

/**
 * Decodes and validates transfer bytes received as a logical plaintext. Throws
 * `E2eeContractError` (closed vocabulary, no plaintext fragments) on any malformed
 * input. The result is display state only — nothing here may be handed to the ratchet
 * vault.
 */
export function parseHistoryTransfer(bytes: Bytes): E2eeHistoryTransferView {
  return decodeHistoryTransfer(bytes, { digest: sha256Digest });
}
