/**
 * Peer history transfer — client composition over the domain contract (P13-011,
 * ADR 0020 §7/§10); web port of the TUI bridge, unchanged (it is pure
 * `@patches/domain` + one digest function).
 *
 * **Send**: `buildHistoryTransfer` turns held, already-decrypted messages into the
 * canonical record bytes that become the logical plaintext of an ordinary
 * `SendEnvelopes` message. **Receive**: `parseHistoryTransfer` decodes and validates a
 * plaintext that arrived through `openDeviceEnvelope` — display-only by construction,
 * never anything the vault's ratchet records could consume.
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
