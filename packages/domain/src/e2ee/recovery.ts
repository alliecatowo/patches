/**
 * The optional recovery archive (ADR 0020 §10; P13-011).
 *
 * An E2EE account's ability to survive losing every device rests on exactly one artifact:
 * an encrypted export the user made *before* the loss, under a high-entropy recovery key
 * the node never receives. This module is that artifact's format contract — the canonical
 * encoding, the recovery-code codec, and the validators every client (TUI today, web and
 * mobile later) runs identically.
 *
 * ## What the archive may contain, and what it may never contain
 *
 * May (ADR 0020 §10): the messaging-root private key, the latest signed roster,
 * device-independent settings, a snapshot of E2EE conversation membership, and optionally
 * already-decrypted history — display-only data, same entry shape as a peer history
 * transfer.
 *
 * **Never**: live Double Ratchet counters, chain/root/message keys, skipped keys, one-time
 * or signed prekey private keys, or any device identity private key — new or revoked.
 * Those would either decrypt past traffic or resurrect dead sessions; ADR 0020 §10
 * rejects both categorically, and its "Alternatives considered" spells out why restoring
 * live ratchet state from backup is forbidden outright (key/nonce reuse, orphaned Sesame
 * sessions).
 *
 * How that prohibition is enforced here: **the format is closed.** The codec defines an
 * exact, versioned part list and rejects trailing or unknown bytes, and no field in it is
 * typed or sized for session state. There is nowhere to put a ratchet counter except
 * inside the two bounded opaque blobs (`settings`, history plaintexts), which carry
 * application data and already-decrypted bodies respectively; writing session material
 * into either is a caller error this contract documents loudly but cannot byte-level
 * detect — the same honesty ADR 0020 §4 applies to JavaScript zeroization.
 *
 * ## Restore is a fresh enrollment, never a resurrection
 *
 * Opening an archive yields a *plan*, not state. The plan's only private material is the
 * root key; the restored device generates fresh device keys, a fresh certificate, and
 * fresh sessions, and joins through the normal roster-change machinery —
 * `EnrollDevice`/`PublishDeviceRoster`, signed roster bump, device-change warnings to
 * peers. `assertServedRosterAcceptsRestore` and `assertRestoredDeviceCertificateIsFresh`
 * are the mechanical preconditions: the node's served roster must not be behind the
 * archive's, and the new certificate may not predate the archive.
 *
 * ## Key derivation tier
 *
 * v1 archives are sealed under a **generated 256-bit recovery key** (rendered as a
 * checksummed hex recovery code) — exactly ADR 0020 §10's "generated high-entropy
 * recovery key". A passphrase/memory-hard-KDF tier exists as a follow-up (B-081) and will
 * be a new, versioned KDF identifier — never a reinterpretation of these bytes.
 *
 * Nothing here encrypts, decrypts, or derives anything. Digests are injected; the sealing
 * composition lives in each client's vault layer (TUI: `apps/tui/src/e2ee/recovery-archive.ts`).
 */
import { assertHistoryEntryFields, type E2eeHistoryEntryFields } from './history-transfer.js';
import { E2eeContractError, E2EE_PROTOCOL_V1 } from './modes.js';
import {
  bytesEqual,
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  E2EE_DIGEST_BYTES,
  type Bytes,
  type DigestFunction,
} from './types.js';

/** Domain separator for the recovery-archive transcript. Distinct from every other v1 transcript. */
export const E2EE_RECOVERY_ARCHIVE_DOMAIN = `${E2EE_PROTOCOL_V1}:recovery-archive` as const;

/** Recovery-archive document format version this contract describes. */
export const E2EE_RECOVERY_ARCHIVE_VERSION = 1;

/** The archive's only private material: the 32-byte Ed25519 messaging-root private key. */
export const E2EE_RECOVERY_KEY_BYTES = ED25519_PUBLIC_KEY_BYTES;

/**
 * The sealed container's framing, published here so every client produces and parses the
 * same bytes (the TUI implements the seal; a future web/mobile vault must not invent a
 * second container). The container is `magic | version | salt | nonce | ciphertext`, with
 * the 63-byte header as AEAD associated data so no clear-text field can be tampered with
 * without breaking the seal.
 */
export const E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC = 'PVEARC' as const;
export const E2EE_RECOVERY_ARCHIVE_CONTAINER_VERSION = 1;
export const E2EE_RECOVERY_ARCHIVE_SALT_BYTES = 32;
export const E2EE_RECOVERY_ARCHIVE_NONCE_BYTES = 24;
export const E2EE_RECOVERY_ARCHIVE_HEADER_BYTES =
  E2EE_RECOVERY_ARCHIVE_CONTAINER_MAGIC.length +
  1 +
  E2EE_RECOVERY_ARCHIVE_SALT_BYTES +
  E2EE_RECOVERY_ARCHIVE_NONCE_BYTES;

/**
 * HKDF info string deriving the archive AEAD key from the recovery key. A versioned
 * identifier: a future passphrase-KDF tier gets its own info/domain string and its own
 * container version, never a re-derivation under this one.
 */
export const E2EE_RECOVERY_ARCHIVE_KDF_INFO = 'patches-e2ee-v1/recovery-archive/aead-key' as const;

/** Conversations per archive. Bounds decode work on a hostile file. */
export const E2EE_RECOVERY_MAX_CONVERSATIONS = 1_000;

/**
 * History entries per archive. Archives are files, not envelopes, so the bound is a
 * memory/DoS constant rather than the transfer batch's envelope-derived one.
 */
export const E2EE_RECOVERY_MAX_HISTORY_ENTRIES = 1_000;

/** Device-independent settings blob ceiling. Opaque to this contract; see the module doc. */
export const E2EE_RECOVERY_MAX_SETTINGS_BYTES = 4 * 1_024;

const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const RECOVERY_CODE_GROUP = 6;

/** One E2EE conversation's membership state, as of the archive's creation. */
export interface E2eeRecoveryConversationEntry {
  readonly conversationId: string;
  /** Membership epoch at archive time; the restored client re-verifies against the node. */
  readonly membershipEpoch: bigint;
  /** Newest group-control digest the archiving device had verified (genesis digest if none). */
  readonly groupControlDigest: Bytes;
}

/** Everything an archiving client supplies. The closed field list *is* the prohibition. */
export interface E2eeRecoveryArchiveDocument {
  readonly actorId: string;
  /** Which root generation this root is. A restore with a newer served root is a hard change. */
  readonly rootGeneration: number;
  /** The messaging-root private key — the archive's single point of failure and of recovery. */
  readonly rootPrivateKey: Bytes;
  readonly rootPublicKey: Bytes;
  /** Canonical root transcript + self-signature, so restore can prove key coherence. */
  readonly rootBytes: Bytes;
  readonly rootSelfSignature: Bytes;
  /** The latest signed roster this device had verified. Checked against the node on restore. */
  readonly rosterBytes: Bytes;
  readonly rosterSignature: Bytes;
  readonly rosterSequence: bigint;
  readonly rosterDigest: Bytes;
  readonly createdAtMs: number;
  readonly conversations: readonly E2eeRecoveryConversationEntry[];
  /** Optional already-decrypted history — display-only, never fed into any ratchet. */
  readonly history: readonly E2eeHistoryEntryFields[];
  /** Optional device-independent settings. Opaque, bounded, and never session material. */
  readonly settings: Bytes | undefined;
}

/** A built or decoded archive: the fields plus the authoritative canonical bytes and digest. */
export interface E2eeRecoveryArchiveView extends E2eeRecoveryArchiveDocument {
  readonly version: number;
  /** The exact canonical bytes the digest covers and the seal encrypts. Authoritative. */
  readonly documentBytes: Bytes;
  readonly documentDigest: Bytes;
}

/**
 * What restore may use, and all restore may use. Deliberately narrow: the root key
 * material (to certify a **fresh** device and sign the roster bump), the roster snapshot
 * (to detect a rolled-back node), the membership snapshot, display-only history, and
 * settings. There is no field here for ratchets, prekeys, sessions, or device private
 * keys — restore constructs those fresh (ADR 0020 §10).
 */
export interface E2eeRecoveryRestorePlan {
  readonly actorId: string;
  readonly rootGeneration: number;
  readonly rootPrivateKey: Bytes;
  readonly rootPublicKey: Bytes;
  readonly rootBytes: Bytes;
  readonly rootSelfSignature: Bytes;
  readonly roster: {
    readonly bytes: Bytes;
    readonly signature: Bytes;
    readonly sequence: bigint;
    readonly digest: Bytes;
  };
  readonly conversations: readonly E2eeRecoveryConversationEntry[];
  readonly history: readonly E2eeHistoryEntryFields[];
  readonly settings: Bytes | undefined;
}

function assertId(value: string, label: string): void {
  if (value.length === 0 || value.length > 256) {
    throw new E2eeContractError(`${label} is invalid.`);
  }
}

function assertFixed(value: Bytes, bytes: number, label: string): void {
  if (value.length !== bytes) {
    throw new E2eeContractError(`${label} must be ${String(bytes)} bytes.`);
  }
}

function assertBigUint64(value: bigint, label: string): void {
  if (value < 0n || value > MAX_U64) {
    throw new E2eeContractError(`${label} is out of range.`);
  }
}

// ---------------------------------------------------------------------------
// Recovery code — the high-entropy recovery key in human-transcribable form
// ---------------------------------------------------------------------------

/**
 * One checksum byte over the recovery key: the sum of all key bytes mod 256. Not a
 * cryptographic check — it exists so a mistyped code fails *here*, with "that is not a
 * recovery code", instead of inside the AEAD open where it is indistinguishable from a
 * corrupt archive.
 */
export function recoveryCodeChecksumByte(recoveryKey: Bytes): number {
  if (recoveryKey.length !== E2EE_RECOVERY_KEY_BYTES) {
    throw new E2eeContractError('Recovery key must be exactly 32 bytes.');
  }
  let sum = 0;
  for (const byte of recoveryKey) sum = (sum + byte) % 256;
  return sum;
}

function toHex(bytes: Bytes): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * Renders a 32-byte recovery key as 66 lowercase hex characters: 64 for the key, 2 for
 * {@link recoveryCodeChecksumByte}. Lowercase only, so nobody transcribes a `0` as `O`.
 */
export function encodeRecoveryCode(recoveryKey: Bytes): string {
  if (recoveryKey.length !== E2EE_RECOVERY_KEY_BYTES) {
    throw new E2eeContractError('Recovery key must be exactly 32 bytes.');
  }
  return toHex(recoveryKey) + recoveryCodeChecksumByte(recoveryKey).toString(16).padStart(2, '0');
}

/** Inserts a separator every {@link RECOVERY_CODE_GROUP} characters for display. */
export function groupRecoveryCodeForDisplay(code: string): string {
  return code.match(new RegExp(`.{1,${String(RECOVERY_CODE_GROUP)}}`, 'g'))?.join('-') ?? code;
}

function fromHex(normalized: string): Bytes {
  const out = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

/**
 * Parses a recovery code back into its 32-byte key. Normalizes case and strips the
 * separators humans add when copying (`-`, space, `:`); then requires exactly 66 hex
 * characters and a matching checksum. Returns a fresh buffer the caller owns (and should
 * zeroize when done).
 */
export function decodeRecoveryCode(code: string): Bytes {
  const normalized = code.toLowerCase().replaceAll('-', '').replaceAll(' ', '').replaceAll(':', '');
  if (!/^[0-9a-f]{66}$/.test(normalized)) {
    throw new E2eeContractError('That is not a recovery code.');
  }
  const key = fromHex(normalized.slice(0, 64));
  const checksum = Number.parseInt(normalized.slice(64, 66), 16);
  if (recoveryCodeChecksumByte(key) !== checksum) {
    throw new E2eeContractError('Recovery code checksum does not match; check for a typo.');
  }
  return key;
}

// ---------------------------------------------------------------------------
// Canonical archive transcript
// ---------------------------------------------------------------------------

function encodeLengthPrefixed(parts: readonly Bytes[]): Bytes {
  let size = 0;
  for (const part of parts) size += 4 + part.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    offset += 4;
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u8Part(value: number): Bytes {
  const out = new Uint8Array(1);
  out[0] = value;
  return out;
}

function u32Part(value: number): Bytes {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

function u64Part(value: bigint | number): Bytes {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), false);
  return out;
}

/**
 * Structural checks on an archive document — the closed field list, with widths and
 * bounds, so nothing malformed reaches an encoder or a restore plan.
 */
export function assertRecoveryArchiveShape(document: E2eeRecoveryArchiveDocument): void {
  assertId(document.actorId, 'Archive actor id');
  if (!Number.isSafeInteger(document.rootGeneration) || document.rootGeneration < 1) {
    throw new E2eeContractError('Archive root generation must be a positive integer.');
  }
  assertFixed(document.rootPrivateKey, E2EE_RECOVERY_KEY_BYTES, 'Archive root private key');
  assertFixed(document.rootPublicKey, ED25519_PUBLIC_KEY_BYTES, 'Archive root public key');
  assertFixed(document.rootSelfSignature, ED25519_SIGNATURE_BYTES, 'Archive root self-signature');
  if (document.rootBytes.length === 0) {
    throw new E2eeContractError('Archive root transcript is empty.');
  }
  if (document.rosterBytes.length === 0) {
    throw new E2eeContractError('Archive roster transcript is empty.');
  }
  assertFixed(document.rosterSignature, ED25519_SIGNATURE_BYTES, 'Archive roster signature');
  assertBigUint64(document.rosterSequence, 'Archive roster sequence');
  if (document.rosterSequence < 1n) {
    throw new E2eeContractError('Archive roster sequence starts at 1.');
  }
  assertFixed(document.rosterDigest, E2EE_DIGEST_BYTES, 'Archive roster digest');
  if (!Number.isSafeInteger(document.createdAtMs) || document.createdAtMs < 0) {
    throw new E2eeContractError('Archive creation time is invalid.');
  }
  if (document.conversations.length > E2EE_RECOVERY_MAX_CONVERSATIONS) {
    throw new E2eeContractError(
      `Archive lists more than ${String(E2EE_RECOVERY_MAX_CONVERSATIONS)} conversations.`,
    );
  }
  if (document.history.length > E2EE_RECOVERY_MAX_HISTORY_ENTRIES) {
    throw new E2eeContractError(
      `Archive lists more than ${String(E2EE_RECOVERY_MAX_HISTORY_ENTRIES)} history entries.`,
    );
  }
  for (const entry of document.history) assertHistoryEntryFields(entry);
  if (
    document.settings !== undefined &&
    document.settings.length > E2EE_RECOVERY_MAX_SETTINGS_BYTES
  ) {
    throw new E2eeContractError(
      `Archive settings exceed ${String(E2EE_RECOVERY_MAX_SETTINGS_BYTES)} bytes.`,
    );
  }
}

/**
 * The exact canonical bytes `documentDigest` is taken over — and the exact plaintext the
 * seal encrypts. Length-prefixed like every other v1 transcript so no field boundary is
 * ambiguous. The encoder runs {@link assertRecoveryArchiveShape} first: the shape check
 * is what makes the encoding closed, so an encoder that accepted a malformed document
 * would mint bytes a strict decoder must reject.
 */
export function canonicalRecoveryArchiveTranscript(document: E2eeRecoveryArchiveDocument): Bytes {
  assertRecoveryArchiveShape(document);
  const encoder = new TextEncoder();
  const parts: Bytes[] = [
    encoder.encode(E2EE_RECOVERY_ARCHIVE_DOMAIN),
    u8Part(E2EE_RECOVERY_ARCHIVE_VERSION),
    encoder.encode(document.actorId),
    u32Part(document.rootGeneration),
    document.rootPrivateKey,
    document.rootPublicKey,
    document.rootBytes,
    document.rootSelfSignature,
    document.rosterBytes,
    document.rosterSignature,
    u64Part(document.rosterSequence),
    document.rosterDigest,
    u64Part(document.createdAtMs),
    u32Part(document.conversations.length),
  ];
  for (const conversation of document.conversations) {
    assertId(conversation.conversationId, 'Archive conversation id');
    assertBigUint64(conversation.membershipEpoch, 'Archive conversation membership epoch');
    if (conversation.membershipEpoch < 1n) {
      throw new E2eeContractError('Archive conversation membership epochs start at 1.');
    }
    assertFixed(
      conversation.groupControlDigest,
      E2EE_DIGEST_BYTES,
      'Archive conversation group-control digest',
    );
    parts.push(encoder.encode(conversation.conversationId));
    parts.push(u64Part(conversation.membershipEpoch));
    parts.push(conversation.groupControlDigest);
  }
  parts.push(u32Part(document.history.length));
  for (const entry of document.history) {
    parts.push(encoder.encode(entry.conversationId));
    parts.push(encoder.encode(entry.logicalMessageId));
    parts.push(encoder.encode(entry.senderActorId));
    parts.push(encoder.encode(entry.senderDeviceId));
    parts.push(u64Part(entry.membershipEpoch));
    parts.push(u64Part(entry.acceptedAtMs));
    parts.push(entry.plaintext);
  }
  parts.push(document.settings ?? new Uint8Array(0));
  return encodeLengthPrefixed(parts);
}

/** Builds an archive view: canonical bytes plus digest, ready for the client to seal. */
export function encodeRecoveryArchiveDocument(
  document: E2eeRecoveryArchiveDocument,
  deps: { readonly digest: DigestFunction },
): E2eeRecoveryArchiveView {
  const documentBytes = canonicalRecoveryArchiveTranscript(document);
  return {
    ...document,
    version: E2EE_RECOVERY_ARCHIVE_VERSION,
    documentBytes,
    documentDigest: deps.digest(documentBytes),
  };
}

/** Minimal reader over the length-prefixed part stream — the decode half of the codec. */
class PartReader {
  #offset = 0;

  constructor(private readonly source: Bytes) {}

  part(): Bytes {
    if (this.#offset + 4 > this.source.length) {
      throw new E2eeContractError('Recovery archive transcript is truncated.');
    }
    const length = new DataView(
      this.source.buffer,
      this.source.byteOffset + this.#offset,
      4,
    ).getUint32(0, false);
    this.#offset += 4;
    if (this.#offset + length > this.source.length) {
      throw new E2eeContractError('Recovery archive transcript is truncated.');
    }
    const out = this.source.slice(this.#offset, this.#offset + length);
    this.#offset += length;
    return out;
  }

  u8Part(label: string): number {
    const part = this.part();
    if (part.length !== 1) throw new E2eeContractError(`${label} must be a 1-byte part.`);
    return part[0] ?? 0;
  }

  u32Part(label: string): number {
    const part = this.part();
    if (part.length !== 4) throw new E2eeContractError(`${label} must be a 4-byte part.`);
    return new DataView(part.buffer, part.byteOffset, 4).getUint32(0, false);
  }

  u64Part(label: string): bigint {
    const part = this.part();
    if (part.length !== 8) throw new E2eeContractError(`${label} must be an 8-byte part.`);
    return new DataView(part.buffer, part.byteOffset, 8).getBigUint64(0, false);
  }

  stringPart(label: string): string {
    try {
      return new TextDecoder().decode(this.part());
    } catch {
      throw new E2eeContractError(`${label} is not valid UTF-8.`);
    }
  }

  end(): void {
    if (this.#offset !== this.source.length) {
      throw new E2eeContractError('Recovery archive transcript has trailing bytes.');
    }
  }
}

/**
 * Decodes archive plaintext back into a fully validated view. **Closed**: rejects an
 * unknown domain separator, an unknown version, truncated input, and trailing bytes —
 * which is precisely how "the archive never carries session state" stays mechanically
 * true rather than aspirational. A document from a future format version is refused, not
 * best-effort parsed, so v2 fields can never be silently reinterpreted as v1 ones.
 */
export function decodeRecoveryArchiveDocument(
  bytes: Bytes,
  deps: { readonly digest: DigestFunction },
): E2eeRecoveryArchiveView {
  try {
    const reader = new PartReader(bytes);
    const domain = reader.stringPart('Recovery archive domain');
    if (domain !== E2EE_RECOVERY_ARCHIVE_DOMAIN) {
      throw new E2eeContractError('Recovery archive bytes carry a foreign domain separator.');
    }
    const version = reader.u8Part('Recovery archive version');
    if (version !== E2EE_RECOVERY_ARCHIVE_VERSION) {
      throw new E2eeContractError('Recovery archive version is not one v1 defines.');
    }
    const actorId = reader.stringPart('Recovery archive actor id');
    const rootGeneration = reader.u32Part('Recovery archive root generation');
    const rootPrivateKey = reader.part();
    const rootPublicKey = reader.part();
    const rootBytes = reader.part();
    const rootSelfSignature = reader.part();
    const rosterBytes = reader.part();
    const rosterSignature = reader.part();
    const rosterSequence = reader.u64Part('Recovery archive roster sequence');
    const rosterDigest = reader.part();
    const createdAtMs = reader.u64Part('Recovery archive creation time');
    const conversationCount = reader.u32Part('Recovery archive conversation count');
    const conversations: E2eeRecoveryConversationEntry[] = [];
    for (let index = 0; index < conversationCount; index += 1) {
      conversations.push({
        conversationId: reader.stringPart('Recovery conversation id'),
        membershipEpoch: reader.u64Part('Recovery conversation membership epoch'),
        groupControlDigest: reader.part(),
      });
    }
    const historyCount = reader.u32Part('Recovery archive history count');
    const history: E2eeHistoryEntryFields[] = [];
    for (let index = 0; index < historyCount; index += 1) {
      history.push({
        conversationId: reader.stringPart('Recovery history conversation id'),
        logicalMessageId: reader.stringPart('Recovery history logical message id'),
        senderActorId: reader.stringPart('Recovery history sender actor id'),
        senderDeviceId: reader.stringPart('Recovery history sender device id'),
        membershipEpoch: reader.u64Part('Recovery history membership epoch'),
        acceptedAtMs: Number(reader.u64Part('Recovery history accepted-at')),
        plaintext: reader.part(),
      });
    }
    const settingsPart = reader.part();
    reader.end();
    const document: E2eeRecoveryArchiveDocument = {
      actorId,
      rootGeneration,
      rootPrivateKey,
      rootPublicKey,
      rootBytes,
      rootSelfSignature,
      rosterBytes,
      rosterSignature,
      rosterSequence,
      rosterDigest,
      createdAtMs: Number(createdAtMs),
      conversations,
      history,
      settings: settingsPart.length === 0 ? undefined : settingsPart,
    };
    return encodeRecoveryArchiveDocument(document, deps);
  } catch (error) {
    if (error instanceof E2eeContractError) throw error;
    throw new E2eeContractError('Recovery archive bytes are malformed.');
  }
}

// ---------------------------------------------------------------------------
// Restore preconditions — fresh enrollment, never silent resurrection
// ---------------------------------------------------------------------------

/**
 * The node's served roster tip must not be behind the archive's verified state.
 *
 * * served **below** the archive's sequence → the node is serving a rolled-back roster
 *   chain, and restoring against it would sign the next roster off a rewrite of the
 *   account's device history.
 * * served **at** the archive's sequence but with a different digest → a fork at the
 *   same height; one of the two chains is not the chain the archiving device verified.
 * * served **ahead** → acceptable *here*, but the extension must still be verified link
 *   by link via `ListDeviceRosters` before the restored device signs `sequence + 1`;
 *   this check is the gate in front of that walk, not a replacement for it.
 */
export function assertServedRosterAcceptsRestore(
  archive: { readonly rosterSequence: bigint; readonly rosterDigest: Bytes },
  served: { readonly sequence: bigint; readonly digest: Bytes },
): void {
  if (served.sequence < archive.rosterSequence) {
    throw new E2eeContractError(
      `Node serves roster sequence ${String(served.sequence)} below the archive's verified ${String(archive.rosterSequence)}; refusing to restore against a rolled-back chain.`,
    );
  }
  if (
    served.sequence === archive.rosterSequence &&
    !bytesEqual(served.digest, archive.rosterDigest)
  ) {
    throw new E2eeContractError(
      'Node serves a roster digest that forks the archive chain at the same sequence.',
    );
  }
}

/**
 * A restored device's certificate may not predate the archive it restores from. This is
 * the freshness rule that makes "recovery creates a fresh device certificate" (ADR 0020
 * §10) mechanical: a certificate issued before the archive existed cannot be the fresh
 * enrollment this flow produces — it is either a replayed old enrollment or a smuggled
 * old device identity key, and both are refused.
 */
export function assertRestoredDeviceCertificateIsFresh(
  archiveCreatedAtMs: number,
  deviceCertificateCreatedAtMs: number,
): void {
  if (
    !Number.isSafeInteger(deviceCertificateCreatedAtMs) ||
    deviceCertificateCreatedAtMs < archiveCreatedAtMs
  ) {
    throw new E2eeContractError(
      'A restored device certificate may not predate the archive it restores from.',
    );
  }
}

/**
 * Turns a validated archive view into the inputs of a fresh enrollment — and nothing
 * else. The caller (client vault layer) separately verifies root-key coherence (private
 * half matches public half and the self-signature — needs real crypto, so it cannot live
 * here), generates fresh device keys, certifies them with `rootPrivateKey`, and walks the
 * normal `EnrollDevice`/`PublishDeviceRoster` machinery.
 */
export function planRecoveryRestore(view: E2eeRecoveryArchiveView): E2eeRecoveryRestorePlan {
  assertRecoveryArchiveShape(view);
  return {
    actorId: view.actorId,
    rootGeneration: view.rootGeneration,
    rootPrivateKey: view.rootPrivateKey,
    rootPublicKey: view.rootPublicKey,
    rootBytes: view.rootBytes,
    rootSelfSignature: view.rootSelfSignature,
    roster: {
      bytes: view.rosterBytes,
      signature: view.rosterSignature,
      sequence: view.rosterSequence,
      digest: view.rosterDigest,
    },
    conversations: view.conversations,
    history: view.history,
    settings: view.settings,
  };
}
