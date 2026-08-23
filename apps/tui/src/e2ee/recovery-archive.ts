/**
 * The optional recovery archive — sealing and restore composition (P13-011, ADR 0020
 * §10).
 *
 * The archive *format* (canonical document transcript, recovery-code codec, restore
 * preconditions) lives in `@patches/domain`'s `recovery.ts` so every future client runs
 * the same bytes. This module is the TUI half that needs real crypto:
 *
 *   * a generated 256-bit recovery key, shown to the user as a checksummed recovery code
 *     and never sent to the node in any form;
 *   * the sealed container (`PVEARC`, per-domain constants in `@patches/domain`) —
 *     HKDF-SHA256 key derivation under a fresh per-archive salt, XChaCha20-Poly1305 with
 *     the container header as associated data;
 *   * root-key coherence on open: the archive's private half must actually derive the
 *     public half and verify the root self-signature, so a corrupted or forged archive
 *     fails before it can mint device certificates;
 *   * the restore plan gate: node roster acceptance + `planRecoveryRestore`.
 *
 * **Restore never touches ratchet state.** There is no code path from this module into
 * the vault's session records — a restored device generates fresh keys and enrolls
 * through `EnrollDevice`/`PublishDeviceRoster` (P13-010 wires that UX); the plan this
 * module returns is the only input it needs. The archive carries no live counters,
 * skipped keys, prekeys, or device identity keys to restore even if someone tried.
 *
 * Failures are coarse on purpose: a wrong recovery code, a tampered container, and a
 * corrupt document all surface as the same content-free `RecoveryArchiveError`, so
 * nothing here becomes an oracle over the archive's contents.
 */
import {
  aeadDecrypt,
  aeadEncrypt,
  ByteReader,
  ByteWriter,
  hkdfSha256,
  randomBytes,
  signingKeyPairFromPrivate,
  verifyStrict,
  zeroize,
} from '@patches/crypto';
import { bytesEqual } from '@patches/crypto';

import {
  assertServedRosterAcceptsRestore,
  decodeRecoveryArchiveDocument,
  E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC,
  E2EE_RECOVERY_ARCHIVE_CONTAINER_VERSION,
  E2EE_RECOVERY_ARCHIVE_HEADER_BYTES,
  E2EE_RECOVERY_ARCHIVE_KDF_INFO,
  E2EE_RECOVERY_ARCHIVE_NONCE_BYTES,
  E2EE_RECOVERY_ARCHIVE_SALT_BYTES,
  E2EE_RECOVERY_KEY_BYTES,
  encodeRecoveryArchiveDocument,
  planRecoveryRestore,
  type E2eeRecoveryArchiveDocument,
  type E2eeRecoveryArchiveView,
  type E2eeRecoveryRestorePlan,
} from '@patches/domain';

import { sha256Digest } from './history-transfer.js';

/** Coarse, content-free: wrong key, tampering, and corruption are indistinguishable. */
export class RecoveryArchiveError extends Error {
  constructor(message = 'The recovery archive could not be opened.') {
    super(message);
    this.name = 'RecoveryArchiveError';
  }
}

/** A fresh 256-bit recovery key — the tier ADR 0020 §10 specifies (passphrase KDF is B-081). */
export function generateRecoveryKey(): Uint8Array {
  return randomBytes(E2EE_RECOVERY_KEY_BYTES);
}

/**
 * The archive AEAD key: HKDF-SHA256 over the recovery key, salted per archive so two
 * archives of the same account never share key-stream material. The info string is the
 * domain's versioned constant — a future KDF tier is a new constant, never this one.
 */
export function deriveRecoveryArchiveKey(recoveryKey: Uint8Array, salt: Uint8Array): Uint8Array {
  if (
    recoveryKey.length !== E2EE_RECOVERY_KEY_BYTES ||
    salt.length !== E2EE_RECOVERY_ARCHIVE_SALT_BYTES
  ) {
    throw new RecoveryArchiveError('Recovery key or archive salt has the wrong length.');
  }
  return hkdfSha256(recoveryKey, salt, E2EE_RECOVERY_ARCHIVE_KDF_INFO, 32);
}

/**
 * Seals one archive document under a recovery key. The canonical document bytes are the
 * AEAD plaintext; the 63-byte container header (magic, version, salt, nonce) is the
 * associated data, so any edit to a clear-text field breaks the seal. The derived key and
 * intermediate copies are zeroized before returning.
 */
export function sealRecoveryArchive(
  document: E2eeRecoveryArchiveDocument,
  recoveryKey: Uint8Array,
): { readonly archive: Uint8Array; readonly view: E2eeRecoveryArchiveView } {
  let key: Uint8Array | undefined;
  try {
    const view = encodeRecoveryArchiveDocument(document, { digest: sha256Digest });
    const salt = randomBytes(E2EE_RECOVERY_ARCHIVE_SALT_BYTES);
    key = deriveRecoveryArchiveKey(recoveryKey, salt);
    const header = new ByteWriter()
      .fixed(
        new TextEncoder().encode(E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC),
        E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC.length,
      )
      .u8(E2EE_RECOVERY_ARCHIVE_CONTAINER_VERSION)
      .fixed(salt, E2EE_RECOVERY_ARCHIVE_SALT_BYTES)
      .fixed(randomBytes(E2EE_RECOVERY_ARCHIVE_NONCE_BYTES), E2EE_RECOVERY_ARCHIVE_NONCE_BYTES)
      .finish();
    const ciphertext = aeadEncrypt(
      key,
      header.slice(E2EE_RECOVERY_ARCHIVE_HEADER_BYTES - E2EE_RECOVERY_ARCHIVE_NONCE_BYTES),
      view.documentBytes,
      header,
    );
    const archive = new ByteWriter().fixed(header, header.length).bytes(ciphertext).finish();
    return { archive, view };
  } catch (error) {
    if (error instanceof RecoveryArchiveError) throw error;
    throw new RecoveryArchiveError('The recovery archive could not be written.');
  } finally {
    if (key !== undefined) zeroize(key);
  }
}

interface ParsedContainer {
  readonly header: Uint8Array;
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
}

function parseContainer(bytes: Uint8Array): ParsedContainer {
  try {
    const reader = new ByteReader(bytes);
    if (
      new TextDecoder().decode(reader.fixed(E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC.length)) !==
      E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC
    ) {
      throw new RecoveryArchiveError();
    }
    if (reader.u8() !== E2EE_RECOVERY_ARCHIVE_CONTAINER_VERSION) {
      throw new RecoveryArchiveError();
    }
    reader.fixed(E2EE_RECOVERY_ARCHIVE_SALT_BYTES);
    const nonce = reader.fixed(E2EE_RECOVERY_ARCHIVE_NONCE_BYTES);
    const ciphertext = reader.bytes();
    reader.end();
    return {
      header: bytes.slice(0, E2EE_RECOVERY_ARCHIVE_HEADER_BYTES),
      nonce,
      ciphertext,
    };
  } catch (error) {
    if (error instanceof RecoveryArchiveError) throw error;
    throw new RecoveryArchiveError('The recovery archive could not be opened.');
  }
}

/**
 * Opens and fully validates a sealed archive under a recovery key. Every failure —
 * wrong key, tampered header, tampered ciphertext, malformed document, unknown format
 * version — is the same coarse `RecoveryArchiveError`. Derived keys and the decrypted
 * plaintext are zeroized on every path.
 */
export function openRecoveryArchive(
  archiveBytes: Uint8Array,
  recoveryKey: Uint8Array,
): E2eeRecoveryArchiveView {
  const container = parseContainer(archiveBytes);
  const salt = container.header.slice(
    E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC.length + 1,
    E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC.length + 1 + E2EE_RECOVERY_ARCHIVE_SALT_BYTES,
  );
  const key = deriveRecoveryArchiveKey(recoveryKey, salt);
  let plaintext: Uint8Array | undefined;
  try {
    plaintext = aeadDecrypt(key, container.nonce, container.ciphertext, container.header);
    return decodeRecoveryArchiveDocument(plaintext, { digest: sha256Digest });
  } catch {
    throw new RecoveryArchiveError('The recovery archive could not be opened.');
  } finally {
    if (plaintext !== undefined) zeroize(plaintext);
    zeroize(key);
  }
}

/**
 * Proves the archive's root key material is internally coherent *before* restore relies
 * on it: the private half must derive exactly the published public half, and the root
 * self-signature must verify over the canonical root transcript under that public key.
 * A mismatched pair would otherwise let a corrupted archive certify devices under a key
 * the account never published.
 */
export function verifyArchiveRootKeyCoherence(view: E2eeRecoveryArchiveView): void {
  let derived: { publicKey: Uint8Array; privateKey: Uint8Array } | undefined;
  try {
    derived = signingKeyPairFromPrivate(view.rootPrivateKey);
    if (!bytesEqual(derived.publicKey, view.rootPublicKey)) {
      throw new RecoveryArchiveError('The recovery archive root key is not coherent.');
    }
    if (!verifyStrict(view.rootPublicKey, view.rootBytes, view.rootSelfSignature)) {
      throw new RecoveryArchiveError('The recovery archive root key is not coherent.');
    }
  } catch (error) {
    if (error instanceof RecoveryArchiveError) throw error;
    throw new RecoveryArchiveError('The recovery archive root key is not coherent.');
  } finally {
    if (derived !== undefined) zeroize(derived.privateKey);
  }
}

/**
 * The restore gate: coherence, then the node's served roster tip checked against the
 * archive's verified roster, then the plan — fresh-enrollment inputs and nothing else
 * (no ratchets, no prekeys, no device keys; those are generated fresh by the enrollment
 * path this plan feeds).
 */
export function buildRestorePlan(
  view: E2eeRecoveryArchiveView,
  served: { readonly sequence: bigint; readonly digest: Uint8Array },
): E2eeRecoveryRestorePlan {
  verifyArchiveRootKeyCoherence(view);
  const plan = planRecoveryRestore(view);
  assertServedRosterAcceptsRestore(
    { rosterSequence: plan.roster.sequence, rosterDigest: plan.roster.digest },
    served,
  );
  return plan;
}

/** Discards a restore plan's secret material. Idempotent; the plan must not be used after. */
export function zeroizeRestorePlan(plan: E2eeRecoveryRestorePlan): void {
  zeroize(plan.rootPrivateKey);
}
