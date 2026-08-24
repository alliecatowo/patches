import {
  ByteReader,
  ByteWriter,
  aeadDecrypt,
  aeadEncrypt,
  hkdfSha256,
  randomBytes,
} from '@patches/crypto';

import { MalformedInputError } from '@patches/crypto';
import { VaultCorruptionError } from './vault-errors.js';

/**
 * On-disk container for the encrypted vault (P13-006):
 *
 * ```text
 * "PVEAULT" (7) | format version u8 | generation u64 | nonce (24) | ct length u32 | ciphertext
 * └────────────── authenticated associated data ──────────────────┘
 * ```
 *
 * The generation sits in the clear but inside the AEAD associated data, so it can be
 * compared against the keyring's high-water mark *before* decrypting (cheap rollback
 * detection) while any tampering with it breaks authentication. The document inside is
 * a versioned map of opaque session-record blobs (`encodeRatchetState` output) plus a
 * staged-send slot per session — the store never interprets ratchet bytes itself.
 */

const VAULT_MAGIC = 'PVEAULT';
const VAULT_FORMAT_VERSION = 1;
const VAULT_NONCE_BYTES = 24;
const VAULT_HEADER_BYTES = VAULT_MAGIC.length + 1 + 8 + VAULT_NONCE_BYTES;
const DOCUMENT_FORMAT_VERSION = 1;
const DATA_KEY_INFO = 'patches-e2ee-v1/vault/data-key';

/** Per-account AEAD key derived from the keyring's wrapping key — the keyring never
 * holds the data key itself. */
export function deriveVaultDataKey(wrappingKey: Uint8Array, accountKey: string): Uint8Array {
  return hkdfSha256(wrappingKey, new TextEncoder().encode(accountKey), DATA_KEY_INFO, 32);
}

export interface SealedVaultFile {
  readonly generation: number;
  readonly associatedData: Uint8Array;
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
}

export function sealVaultFile(
  dataKey: Uint8Array,
  generation: number,
  plaintext: Uint8Array,
): Uint8Array {
  const header = new ByteWriter()
    .fixed(new TextEncoder().encode(VAULT_MAGIC), VAULT_MAGIC.length)
    .u8(VAULT_FORMAT_VERSION)
    .u64(generation)
    .fixed(randomBytes(VAULT_NONCE_BYTES), VAULT_NONCE_BYTES)
    .finish();
  const ciphertext = aeadEncrypt(
    dataKey,
    header.slice(VAULT_HEADER_BYTES - VAULT_NONCE_BYTES),
    plaintext,
    header,
  );
  return new ByteWriter().fixed(header, header.length).bytes(ciphertext).finish();
}

export function parseSealedVaultFile(bytes: Uint8Array): SealedVaultFile {
  let parsed: SealedVaultFile;
  try {
    const reader = new ByteReader(bytes);
    if (new TextDecoder().decode(reader.fixed(VAULT_MAGIC.length)) !== VAULT_MAGIC) {
      throw new VaultCorruptionError();
    }
    const formatVersion = reader.u8();
    if (formatVersion !== VAULT_FORMAT_VERSION) throw new VaultCorruptionError();
    const generation = reader.u64();
    const nonce = reader.fixed(VAULT_NONCE_BYTES);
    const ciphertext = reader.bytes();
    reader.end();
    parsed = {
      generation,
      associatedData: bytes.slice(0, VAULT_HEADER_BYTES),
      nonce,
      ciphertext,
    };
  } catch (error) {
    if (error instanceof VaultCorruptionError) throw error;
    // Truncated input, trailing bytes, or absurd lengths — all fail closed as corruption.
    if (error instanceof MalformedInputError) throw new VaultCorruptionError();
    throw error;
  }
  return parsed;
}

export function openSealedVaultFile(dataKey: Uint8Array, file: SealedVaultFile): Uint8Array {
  try {
    return aeadDecrypt(dataKey, file.nonce, file.ciphertext, file.associatedData);
  } catch {
    // Wrong key, bit rot, or tampering — coarse and content-free by design.
    throw new VaultCorruptionError();
  }
}

/** One session's records: the committed `live` state and, between a staged send's
 * commit and its confirmation, the already-durably-advanced `staged` successor. */
export interface VaultSessionRecord {
  readonly live: Uint8Array;
  readonly staged: Uint8Array | undefined;
}

/** The decryptable document: everything the vault persists, in one atomically
 * committed unit. Generation lives in the file header, not here. */
export interface VaultDocument {
  readonly sessions: ReadonlyMap<string, VaultSessionRecord>;
}

export function encodeVaultDocument(document: VaultDocument): Uint8Array {
  const writer = new ByteWriter().u8(DOCUMENT_FORMAT_VERSION).u32(document.sessions.size);
  for (const [sessionId, record] of document.sessions) {
    writer
      .string(sessionId)
      .bytes(record.live)
      .u8(record.staged === undefined ? 0 : 1);
    if (record.staged !== undefined) writer.bytes(record.staged);
  }
  return writer.finish();
}

export function decodeVaultDocument(bytes: Uint8Array): VaultDocument {
  let reader: ByteReader;
  try {
    reader = new ByteReader(bytes);
    const version = reader.u8();
    if (version !== DOCUMENT_FORMAT_VERSION) throw new VaultCorruptionError();
    const count = reader.u32();
    const sessions = new Map<string, VaultSessionRecord>();
    for (let index = 0; index < count; index += 1) {
      const sessionId = reader.string();
      const live = reader.bytes();
      const stagedFlag = reader.u8();
      if (stagedFlag !== 0 && stagedFlag !== 1) throw new VaultCorruptionError();
      const staged = stagedFlag === 0 ? undefined : reader.bytes();
      if (sessions.has(sessionId)) throw new VaultCorruptionError();
      sessions.set(sessionId, { live, staged });
    }
    reader.end();
    return { sessions };
  } catch (error) {
    if (error instanceof VaultCorruptionError) throw error;
    if (error instanceof MalformedInputError) throw new VaultCorruptionError();
    throw error;
  }
}
