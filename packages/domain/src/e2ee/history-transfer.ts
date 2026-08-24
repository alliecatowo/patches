/**
 * Authenticated peer history transfer (ADR 0020 §7, §10; P13-011).
 *
 * A device that joins an `E2EE_V1` conversation late — a recovered device with fresh
 * sessions, or a new group member — can read future messages but cannot read the past:
 * it holds no ratchet state old enough to decrypt it, and **that must stay true**. ADR
 * 0020 §10 forbids restoring live Double Ratchet counters, skipped keys, one-time
 * prekeys, or old device identity keys precisely because a restored ratchet can reuse
 * keys/nonces and orphan Sesame sessions. History therefore travels as *already-decrypted
 * plaintext*, re-delivered by a member who holds it.
 *
 * This module is that payload's contract. One transfer record is the logical plaintext of
 * an ordinary `E2EE_V1` message sent through the existing exact fanout
 * (`SendEnvelopes`): the same device-pair Double Ratchet sessions, the same franking
 * commitment, the same AEAD associated data. There is deliberately **no new wire
 * surface** — a node cannot tell a transfer from a chat message beyond its size bucket,
 * and no RPC in `e2ee.proto` knows this format exists.
 *
 * Because the fanout is exact over every active device, a transfer is inherently a
 * conversation-wide act: every member device decrypts the same record under the same
 * franking commitment. Sending a different plaintext per device is exactly the
 * equivocation shape ADR 0025 exists to make infeasible, so the format does not even
 * pretend to support it — one record, one plaintext, every recipient.
 *
 * **Display-only.** Nothing here may ever feed a ratchet. The record type shares no
 * field with session state, carries no keys, and is authenticated only as "the device
 * whose session delivered it claims these were the messages" — no content signature
 * exists or will be added (deniability, ADR 0020 §9). A recipient renders transferred
 * history with its provenance, never as cryptographically verified original traffic.
 *
 * Nothing here encrypts, decrypts, or derives anything. Digests are injected.
 */
import { E2eeContractError, E2EE_MAX_ENVELOPE_BYTES, E2EE_PROTOCOL_V1 } from './modes.js';
import { bytesEqual, E2EE_DIGEST_BYTES, type Bytes, type DigestFunction } from './types.js';

/** Domain separator for the history-transfer transcript. Distinct from every other v1 transcript. */
export const E2EE_HISTORY_TRANSFER_DOMAIN = `${E2EE_PROTOCOL_V1}:history-transfer` as const;

/** History-transfer record format version this contract describes. */
export const E2EE_HISTORY_TRANSFER_VERSION = 1;

/**
 * Entries per transfer batch. A transfer is one logical message, so the batch is bounded
 * by the envelope it must fit inside, not by a separate knob.
 */
export const E2EE_HISTORY_TRANSFER_MAX_ENTRIES = 32;

/**
 * Plaintext bytes per entry, aligned with the repo's per-block body bound (P45-001). A
 * protocol constant, not node configuration: a remote node must not be able to widen a
 * local memory bound by sending a huge "history".
 */
export const E2EE_HISTORY_TRANSFER_MAX_ENTRY_BYTES = 8 * 1_024;

/**
 * Whole-record ceiling. The record is the *padded* plaintext of a device envelope, and
 * `E2EE_MAX_ENVELOPE_BYTES` (64 KiB) covers header + ciphertext + AEAD tag; the 4 KiB
 * headroom keeps a maximal batch inside the bucket scheme after padding. A record above
 * this is rejected on both send and receive.
 */
export const E2EE_HISTORY_TRANSFER_MAX_RECORD_BYTES = E2EE_MAX_ENVELOPE_BYTES - 4 * 1_024;

const MAX_U64 = 0xffff_ffff_ffff_ffffn;

/** One already-decrypted message, as a holder of it chooses to re-deliver it. */
export interface E2eeHistoryEntryFields {
  readonly conversationId: string;
  readonly logicalMessageId: string;
  readonly senderActorId: string;
  readonly senderDeviceId: string;
  /** Membership epoch the original message was composed under. `bigint`: rosters chain on it. */
  readonly membershipEpoch: bigint;
  /** When the node accepted the original message, per its stored envelope. */
  readonly acceptedAtMs: number;
  /**
   * The original message's already-decrypted body. Never a key, a ratchet header, or any
   * other session material — the codec has no field for those and must never grow one
   * (ADR 0020 §10).
   */
  readonly plaintext: Bytes;
}

/** Everything a sender supplies to build one transfer batch. */
export interface E2eeHistoryTransferFields {
  readonly conversationId: string;
  /** The member device re-delivering the history. Authenticated by its ratchet session. */
  readonly fromActorId: string;
  readonly fromDeviceId: string;
  readonly entries: readonly E2eeHistoryEntryFields[];
}

/** A built or decoded transfer: the fields plus the authoritative canonical bytes and digest. */
export interface E2eeHistoryTransferView extends E2eeHistoryTransferFields {
  readonly version: number;
  /** The exact canonical bytes that were (or will be) the logical plaintext. Authoritative. */
  readonly recordBytes: Bytes;
  /** Digest over `recordBytes`. A stable batch fingerprint; recompute and compare anywhere. */
  readonly transferDigest: Bytes;
}

function assertBigUint64(value: bigint, label: string): void {
  if (value < 0n || value > MAX_U64) {
    throw new E2eeContractError(`${label} is out of range.`);
  }
}

function assertId(value: string, label: string): void {
  if (value.length === 0 || value.length > 256) {
    throw new E2eeContractError(`${label} is invalid.`);
  }
}

function assertSafeMs(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new E2eeContractError(`${label} is invalid.`);
  }
}

/** Structural checks on one entry, independent of the batch around it. */
export function assertHistoryEntryFields(entry: E2eeHistoryEntryFields): void {
  assertId(entry.conversationId, 'History entry conversation id');
  assertId(entry.logicalMessageId, 'History entry logical message id');
  assertId(entry.senderActorId, 'History entry sender actor id');
  assertId(entry.senderDeviceId, 'History entry sender device id');
  assertBigUint64(entry.membershipEpoch, 'History entry membership epoch');
  if (entry.membershipEpoch < 1n) {
    throw new E2eeContractError('History entry membership epochs start at 1.');
  }
  assertSafeMs(entry.acceptedAtMs, 'History entry accepted-at');
  if (entry.plaintext.length === 0) {
    throw new E2eeContractError('History entry plaintext is empty.');
  }
  if (entry.plaintext.length > E2EE_HISTORY_TRANSFER_MAX_ENTRY_BYTES) {
    throw new E2eeContractError(
      `History entry plaintext exceeds ${String(E2EE_HISTORY_TRANSFER_MAX_ENTRY_BYTES)} bytes.`,
    );
  }
}

function compareEntries(a: E2eeHistoryEntryFields, b: E2eeHistoryEntryFields): number {
  if (a.acceptedAtMs !== b.acceptedAtMs) return a.acceptedAtMs < b.acceptedAtMs ? -1 : 1;
  if (a.logicalMessageId === b.logicalMessageId) return 0;
  return a.logicalMessageId < b.logicalMessageId ? -1 : 1;
}

/**
 * Structural checks on a whole transfer.
 *
 * Rejected, each because it is a way a transfer could lie about what it is:
 *   * a batch whose entries are not strictly ascending by `(acceptedAtMs, logicalMessageId)`
 *     — canonical ordering is what makes the transcript deterministic, and a reordering
 *     sender is rewriting the sequence of events it claims to re-deliver;
 *   * a duplicate logical message id — one original message, one entry;
 *   * an entry naming a conversation other than the batch's — a transfer may not smuggle
 *     a second conversation's history inside the first one's franked plaintext;
 *   * an entry count or total size above the envelope-bounded ceilings.
 */
export function assertHistoryTransferShape(fields: E2eeHistoryTransferFields): void {
  assertId(fields.conversationId, 'History transfer conversation id');
  assertId(fields.fromActorId, 'History transfer sender actor id');
  assertId(fields.fromDeviceId, 'History transfer sender device id');
  if (fields.entries.length === 0) {
    throw new E2eeContractError('A history transfer carries at least one entry.');
  }
  if (fields.entries.length > E2EE_HISTORY_TRANSFER_MAX_ENTRIES) {
    throw new E2eeContractError(
      `A history transfer carries at most ${String(E2EE_HISTORY_TRANSFER_MAX_ENTRIES)} entries.`,
    );
  }
  const seen = new Set<string>();
  let previous: E2eeHistoryEntryFields | undefined;
  for (const entry of fields.entries) {
    assertHistoryEntryFields(entry);
    if (entry.conversationId !== fields.conversationId) {
      throw new E2eeContractError(
        'History transfer entry names a conversation other than the batch it rides in.',
      );
    }
    if (seen.has(entry.logicalMessageId)) {
      throw new E2eeContractError(
        'History transfer lists one logical message more than once; one original message, one entry.',
      );
    }
    seen.add(entry.logicalMessageId);
    if (previous !== undefined && compareEntries(previous, entry) >= 0) {
      throw new E2eeContractError(
        'History transfer entries must be strictly ascending by (accepted_at, logical_message_id).',
      );
    }
    previous = entry;
  }
}

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

function u64Part(value: bigint): Bytes {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, false);
  return out;
}

/**
 * The exact canonical bytes a transfer's digest is taken over — and the exact bytes that
 * become the logical plaintext of the carrying message.
 *
 * Length-prefixed like every other v1 transcript so no field boundary is ambiguous. The
 * encoder runs {@link assertHistoryTransferShape} first: shape is what makes the encoding
 * canonical, so an encoder that accepted a malformed batch would mint a digest a
 * well-formed recipient must reject.
 */
export function canonicalHistoryTransferTranscript(fields: E2eeHistoryTransferFields): Bytes {
  assertHistoryTransferShape(fields);
  const encoder = new TextEncoder();
  const parts: Bytes[] = [
    encoder.encode(E2EE_HISTORY_TRANSFER_DOMAIN),
    u8Part(E2EE_HISTORY_TRANSFER_VERSION),
    encoder.encode(fields.conversationId),
    encoder.encode(fields.fromActorId),
    encoder.encode(fields.fromDeviceId),
    u64Part(BigInt(fields.entries.length)),
  ];
  for (const entry of fields.entries) {
    parts.push(encoder.encode(entry.conversationId));
    parts.push(encoder.encode(entry.logicalMessageId));
    parts.push(encoder.encode(entry.senderActorId));
    parts.push(encoder.encode(entry.senderDeviceId));
    parts.push(u64Part(entry.membershipEpoch));
    parts.push(u64Part(BigInt(entry.acceptedAtMs)));
    parts.push(entry.plaintext);
  }
  return encodeLengthPrefixed(parts);
}

/**
 * Builds a transfer view: canonical bytes plus its digest, so the send path can frank and
 * seal the record exactly as it would any plaintext, and the recipient can fingerprint
 * the batch it received.
 */
export function encodeHistoryTransfer(
  fields: E2eeHistoryTransferFields,
  deps: { readonly digest: DigestFunction },
): E2eeHistoryTransferView {
  const recordBytes = canonicalHistoryTransferTranscript(fields);
  if (recordBytes.length > E2EE_HISTORY_TRANSFER_MAX_RECORD_BYTES) {
    throw new E2eeContractError(
      `History transfer record exceeds the ${String(E2EE_HISTORY_TRANSFER_MAX_RECORD_BYTES)}-byte ceiling.`,
    );
  }
  return {
    ...fields,
    version: E2EE_HISTORY_TRANSFER_VERSION,
    recordBytes,
    transferDigest: deps.digest(recordBytes),
  };
}

/** Minimal reader over the length-prefixed part stream — the decode half of the codec. */
class PartReader {
  #offset = 0;

  constructor(private readonly source: Bytes) {}

  part(): Bytes {
    if (this.#offset + 4 > this.source.length) {
      throw new E2eeContractError('History transfer record is truncated.');
    }
    const length = new DataView(
      this.source.buffer,
      this.source.byteOffset + this.#offset,
      4,
    ).getUint32(0, false);
    this.#offset += 4;
    if (this.#offset + length > this.source.length) {
      throw new E2eeContractError('History transfer record is truncated.');
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
      throw new E2eeContractError('Recovery-family transcript has trailing bytes.');
    }
  }
}

/**
 * Decodes and fully validates transfer bytes a device received as a logical plaintext.
 * Fails closed on every malformed input: unknown version, wrong domain separator,
 * truncated or trailing bytes, or any shape violation. Returns the view with the
 * recomputed digest — the caller that holds a claimed digest compares it with
 * {@link assertHistoryTransferDigest}.
 */
export function decodeHistoryTransfer(
  bytes: Bytes,
  deps: { readonly digest: DigestFunction },
): E2eeHistoryTransferView {
  let reader: PartReader;
  try {
    reader = new PartReader(bytes);
    const domain = reader.stringPart('History transfer domain');
    if (domain !== E2EE_HISTORY_TRANSFER_DOMAIN) {
      throw new E2eeContractError('History transfer bytes carry a foreign domain separator.');
    }
    const version = reader.u8Part('History transfer version');
    if (version !== E2EE_HISTORY_TRANSFER_VERSION) {
      throw new E2eeContractError('History transfer version is not one v1 defines.');
    }
    const conversationId = reader.stringPart('History transfer conversation id');
    const fromActorId = reader.stringPart('History transfer sender actor id');
    const fromDeviceId = reader.stringPart('History transfer sender device id');
    const entryCount = reader.u64Part('History transfer entry count');
    if (entryCount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new E2eeContractError('History transfer entry count is absurd.');
    }
    const entries: E2eeHistoryEntryFields[] = [];
    for (let index = 0; index < Number(entryCount); index += 1) {
      entries.push({
        conversationId: reader.stringPart('History entry conversation id'),
        logicalMessageId: reader.stringPart('History entry logical message id'),
        senderActorId: reader.stringPart('History entry sender actor id'),
        senderDeviceId: reader.stringPart('History entry sender device id'),
        membershipEpoch: reader.u64Part('History entry membership epoch'),
        acceptedAtMs: Number(reader.u64Part('History entry accepted-at')),
        plaintext: reader.part(),
      });
    }
    reader.end();
    return encodeHistoryTransfer({ conversationId, fromActorId, fromDeviceId, entries }, deps);
  } catch (error) {
    if (error instanceof E2eeContractError) throw error;
    throw new E2eeContractError('History transfer bytes are malformed.');
  }
}

/** Recomputes and checks a view's digest against its canonical bytes. */
export function assertHistoryTransferDigest(
  view: E2eeHistoryTransferView,
  deps: { readonly digest: DigestFunction },
): void {
  if (view.transferDigest.length !== E2EE_DIGEST_BYTES) {
    throw new E2eeContractError(
      `History transfer digest must be ${String(E2EE_DIGEST_BYTES)} bytes.`,
    );
  }
  if (!bytesEqual(deps.digest(view.recordBytes), view.transferDigest)) {
    throw new E2eeContractError('History transfer digest does not match its transcript.');
  }
}
