/**
 * Encrypted conversation control envelopes (B-093/B-100; ADR 0020 §7).
 *
 * Read receipts, typing indicators, edits, and deletes are conversation metadata the
 * node must never see in plaintext — §183's "no read receipts" bound the legacy
 * server-visible mode, and this is the E2EE counterpart: the same events exist, but as
 * **control envelopes** sealed inside ordinary `SendEnvelopes` device payloads. To the
 * node a control is indistinguishable from a chat message beyond its padding bucket;
 * no RPC in `e2ee.proto` knows this format exists (the same stance the history-transfer
 * record takes).
 *
 * One deliberate exception, and it is an act, not an oversight: a **DELETE** control is
 * sent reusing the deleted message's `logical_message_id` as the carrying send's own
 * logical id. The node-visible signal is exactly "the sender that composed logical
 * message L re-sent under id L" — never any content — and the fanout accept core treats
 * that as an authenticated request to supersede: drop L's stored ciphertext mailboxes
 * for every recipient and store the control fanout under L as the tombstone. Deletion
 * that left the deleted ciphertext sitting in undelivered mailboxes would not be
 * deletion.
 *
 * Authorization is **sender-scoped and client-enforced**: nothing here is signed
 * (deniability, ADR 0020 §9), so an EDIT or DELETE is only meaningful from the device
 * ratchet that delivered the original message. Clients MUST apply an EDIT or DELETE
 * only when the control's sender is the original message's sender; the codec states
 * the rule, it cannot enforce it.
 *
 * Nothing in this module encrypts, decrypts, or derives anything. Digests are injected.
 */
import { E2eeContractError, E2EE_MAX_ENVELOPE_BYTES, E2EE_PROTOCOL_V1 } from './modes.js';
import { bytesEqual, E2EE_DIGEST_BYTES, type Bytes, type DigestFunction } from './types.js';

/** Domain separator for the control-envelope transcript. Distinct from every other v1 transcript. */
export const E2EE_CONTROL_ENVELOPE_DOMAIN = `${E2EE_PROTOCOL_V1}:control-envelope` as const;

/** Control-envelope format version this contract describes. */
export const E2EE_CONTROL_ENVELOPE_VERSION = 1;

/** Every control type v1 defines. Closed set; unknown wire types fail closed. */
export const E2EE_CONTROL_TYPES = [
  'READ_RECEIPT',
  'TYPING_START',
  'TYPING_STOP',
  'EDIT',
  'DELETE',
] as const;
export type E2eeControlType = (typeof E2EE_CONTROL_TYPES)[number];

/**
 * Logical message ids one read receipt may cover. A receipt is one logical message, so
 * the batch is bounded by the envelope it must fit inside, not by a separate knob. A
 * protocol constant, not node configuration.
 */
export const E2EE_CONTROL_MAX_READ_RECEIPT_IDS = 100;

/**
 * Plaintext bytes an EDIT may carry, aligned with the history-transfer entry bound (the
 * repo's per-block body bound). An edit body is a body; it may not claim more room than
 * one.
 */
export const E2EE_CONTROL_MAX_EDIT_PLAINTEXT_BYTES = 8 * 1_024;

/**
 * Whole-envelope ceiling. The control rides as the *padded* plaintext of a device
 * envelope, so it keeps the history-transfer record's headroom under
 * `E2EE_MAX_ENVELOPE_BYTES` (64 KiB) rather than the full budget.
 */
export const E2EE_CONTROL_MAX_BYTES = E2EE_MAX_ENVELOPE_BYTES - 4 * 1_024;

/**
 * How long a TYPING_START stays live before the indicator disappears on its own
 * (B-093: ephemeral by construction — a missed TYPING_STOP must not pin "typing…" to
 * the screen forever). Exported so every client times it out identically.
 */
export const E2EE_CONTROL_TYPING_TTL_MS = 3_000;

/** A read receipt: the sender has decrypted these logical messages. */
export interface E2eeReadReceiptControl {
  readonly type: 'READ_RECEIPT';
  readonly createdAtMs: number;
  /**
   * Canonical order is strictly ascending, unique. A receipt that reordered or repeated
   * ids would be claiming a different read event than the bytes it rode in.
   */
  readonly messageIds: readonly string[];
}

/** A typing indicator's edges. Carries nothing else on purpose: no body, no draft. */
export interface E2eeTypingControl {
  readonly type: 'TYPING_START' | 'TYPING_STOP';
  readonly createdAtMs: number;
}

/** A message edit: the sender's replacement plaintext for a logical message they sent. */
export interface E2eeEditControl {
  readonly type: 'EDIT';
  readonly createdAtMs: number;
  readonly logicalMessageId: string;
  readonly newPlaintext: string;
}

/** A message delete: the sender's tombstone for a logical message they sent. */
export interface E2eeDeleteControl {
  readonly type: 'DELETE';
  readonly createdAtMs: number;
  readonly logicalMessageId: string;
}

export type E2eeControlEnvelope =
  E2eeReadReceiptControl | E2eeTypingControl | E2eeEditControl | E2eeDeleteControl;

/** A built or decoded control: the fields plus the authoritative canonical bytes and digest. */
export interface E2eeControlEnvelopeView {
  readonly control: E2eeControlEnvelope;
  readonly version: number;
  /** The exact canonical bytes that were (or will be) the logical plaintext payload. */
  readonly envelopeBytes: Bytes;
  /** Digest over `envelopeBytes`. A stable control fingerprint; recompute and compare anywhere. */
  readonly envelopeDigest: Bytes;
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

/**
 * Structural checks on a control, independent of encoding.
 *
 * Rejected, each because it is a way a control could lie about what it is:
 *   * a READ_RECEIPT with no ids (an empty receipt is not a receipt), more ids than the
 *     bound allows, or ids that are not strictly ascending and unique — canonical
 *     ordering is what makes the transcript deterministic;
 *   * an EDIT with no replacement plaintext, or one above the body bound;
 *   * an EDIT or DELETE naming an empty logical message id;
 *   * a non-safe-integer timestamp.
 */
export function assertControlEnvelopeShape(control: E2eeControlEnvelope): void {
  assertSafeMs(control.createdAtMs, 'Control created-at');
  switch (control.type) {
    case 'READ_RECEIPT': {
      if (control.messageIds.length === 0) {
        throw new E2eeContractError('A read receipt covers at least one logical message.');
      }
      if (control.messageIds.length > E2EE_CONTROL_MAX_READ_RECEIPT_IDS) {
        throw new E2eeContractError(
          `A read receipt covers at most ${String(E2EE_CONTROL_MAX_READ_RECEIPT_IDS)} logical messages.`,
        );
      }
      let previous: string | undefined;
      for (const id of control.messageIds) {
        assertId(id, 'Read receipt logical message id');
        if (previous !== undefined && previous >= id) {
          throw new E2eeContractError(
            'Read receipt ids must be strictly ascending and unique; one logical message, one entry.',
          );
        }
        previous = id;
      }
      return;
    }
    case 'TYPING_START':
    case 'TYPING_STOP':
      return;
    case 'EDIT': {
      assertId(control.logicalMessageId, 'Edit logical message id');
      const bytes = new TextEncoder().encode(control.newPlaintext);
      if (bytes.length === 0) {
        throw new E2eeContractError('An edit carries a non-empty replacement plaintext.');
      }
      if (bytes.length > E2EE_CONTROL_MAX_EDIT_PLAINTEXT_BYTES) {
        throw new E2eeContractError(
          `Edit plaintext exceeds ${String(E2EE_CONTROL_MAX_EDIT_PLAINTEXT_BYTES)} bytes.`,
        );
      }
      return;
    }
    case 'DELETE':
      assertId(control.logicalMessageId, 'Delete logical message id');
      return;
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

function u64Part(value: bigint | number): Bytes {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), false);
  return out;
}

/**
 * The exact canonical bytes a control's digest is taken over — and the exact bytes that
 * ride (franked and padded) as the carrying message's logical plaintext payload.
 *
 * Length-prefixed like every other v1 transcript so no field boundary is ambiguous. The
 * encoder runs {@link assertControlEnvelopeShape} first: shape is what makes the
 * encoding canonical, so an encoder that accepted a malformed control would mint a
 * digest a well-formed recipient must reject.
 */
export function canonicalControlEnvelopeBytes(control: E2eeControlEnvelope): Bytes {
  assertControlEnvelopeShape(control);
  const encoder = new TextEncoder();
  const parts: Bytes[] = [
    encoder.encode(E2EE_CONTROL_ENVELOPE_DOMAIN),
    u8Part(E2EE_CONTROL_ENVELOPE_VERSION),
    encoder.encode(control.type),
    u64Part(control.createdAtMs),
  ];
  switch (control.type) {
    case 'READ_RECEIPT':
      parts.push(u64Part(control.messageIds.length));
      for (const id of control.messageIds) parts.push(encoder.encode(id));
      break;
    case 'TYPING_START':
    case 'TYPING_STOP':
      break;
    case 'EDIT':
      parts.push(encoder.encode(control.logicalMessageId));
      parts.push(encoder.encode(control.newPlaintext));
      break;
    case 'DELETE':
      parts.push(encoder.encode(control.logicalMessageId));
      break;
  }
  return encodeLengthPrefixed(parts);
}

/** Builds a control view: canonical bytes plus its digest, ready to frank, seal, and pad. */
export function encodeControlEnvelope(
  control: E2eeControlEnvelope,
  deps: { readonly digest: DigestFunction },
): E2eeControlEnvelopeView {
  const envelopeBytes = canonicalControlEnvelopeBytes(control);
  if (envelopeBytes.length > E2EE_CONTROL_MAX_BYTES) {
    throw new E2eeContractError(
      `Control envelope exceeds the ${String(E2EE_CONTROL_MAX_BYTES)}-byte ceiling.`,
    );
  }
  return {
    control,
    version: E2EE_CONTROL_ENVELOPE_VERSION,
    envelopeBytes,
    envelopeDigest: deps.digest(envelopeBytes),
  };
}

/** Minimal reader over the length-prefixed part stream — the decode half of the codec. */
class PartReader {
  #offset = 0;

  constructor(private readonly source: Bytes) {}

  part(): Bytes {
    if (this.#offset + 4 > this.source.length) {
      throw new E2eeContractError('Control envelope is truncated.');
    }
    const length = new DataView(
      this.source.buffer,
      this.source.byteOffset + this.#offset,
      4,
    ).getUint32(0, false);
    this.#offset += 4;
    if (this.#offset + length > this.source.length) {
      throw new E2eeContractError('Control envelope is truncated.');
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
      return new TextDecoder('utf-8', { fatal: true }).decode(this.part());
    } catch {
      throw new E2eeContractError(`${label} is not valid UTF-8.`);
    }
  }

  end(): void {
    if (this.#offset !== this.source.length) {
      throw new E2eeContractError('Control envelope has trailing bytes.');
    }
  }
}

/**
 * Decodes and fully validates control bytes a device received as a logical plaintext
 * payload. Fails closed on every malformed input: wrong domain separator, unknown
 * version, unknown type, truncated or trailing bytes, non-canonical ordering, or any
 * shape violation. Returns the control; the caller that wants its fingerprint uses
 * {@link encodeControlEnvelope}.
 */
export function decodeControlEnvelope(bytes: Bytes): E2eeControlEnvelope {
  if (bytes.length > E2EE_CONTROL_MAX_BYTES) {
    throw new E2eeContractError(
      `Control envelope exceeds the ${String(E2EE_CONTROL_MAX_BYTES)}-byte ceiling.`,
    );
  }
  let control: E2eeControlEnvelope;
  try {
    const reader = new PartReader(bytes);
    const domain = reader.stringPart('Control envelope domain');
    if (domain !== E2EE_CONTROL_ENVELOPE_DOMAIN) {
      throw new E2eeContractError('Control envelope bytes carry a foreign domain separator.');
    }
    const version = reader.u8Part('Control envelope version');
    if (version !== E2EE_CONTROL_ENVELOPE_VERSION) {
      throw new E2eeContractError('Control envelope version is not one v1 defines.');
    }
    const type = reader.stringPart('Control envelope type');
    const createdAtMs = Number(reader.u64Part('Control envelope created-at'));
    if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
      throw new E2eeContractError('Control envelope created-at is invalid.');
    }
    const controlType = type as E2eeControlType;
    switch (controlType) {
      case 'READ_RECEIPT': {
        const count = reader.u64Part('Read receipt id count');
        if (count > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new E2eeContractError('Read receipt id count is absurd.');
        }
        const messageIds: string[] = [];
        for (let index = 0; index < Number(count); index += 1) {
          messageIds.push(reader.stringPart('Read receipt logical message id'));
        }
        control = { type: 'READ_RECEIPT', createdAtMs, messageIds };
        break;
      }
      case 'TYPING_START':
      case 'TYPING_STOP':
        control = { type: controlType, createdAtMs };
        break;
      case 'EDIT':
        control = {
          type: 'EDIT',
          createdAtMs,
          logicalMessageId: reader.stringPart('Edit logical message id'),
          newPlaintext: reader.stringPart('Edit replacement plaintext'),
        };
        break;
      case 'DELETE':
        control = {
          type: 'DELETE',
          createdAtMs,
          logicalMessageId: reader.stringPart('Delete logical message id'),
        };
        break;
      default:
        throw new E2eeContractError('Control envelope type is not one v1 defines.');
    }
    reader.end();
  } catch (error) {
    if (error instanceof E2eeContractError) throw error;
    throw new E2eeContractError('Control envelope bytes are malformed.');
  }
  assertControlEnvelopeShape(control);
  // Canonical-bytes check: whatever parsed must re-encode to exactly the input, so a
  // non-canonical but structurally valid stream (unsorted ids, padded parts) is rejected
  // rather than normalized.
  if (!bytesEqual(canonicalControlEnvelopeBytes(control), bytes)) {
    throw new E2eeContractError('Control envelope bytes are not in canonical form.');
  }
  return control;
}

/** Recomputes and checks a view's digest against its canonical bytes. */
export function assertControlEnvelopeDigest(
  view: E2eeControlEnvelopeView,
  deps: { readonly digest: DigestFunction },
): void {
  if (view.envelopeDigest.length !== E2EE_DIGEST_BYTES) {
    throw new E2eeContractError(
      `Control envelope digest must be ${String(E2EE_DIGEST_BYTES)} bytes.`,
    );
  }
  if (!bytesEqual(deps.digest(view.envelopeBytes), view.envelopeDigest)) {
    throw new E2eeContractError('Control envelope digest does not match its transcript.');
  }
}
