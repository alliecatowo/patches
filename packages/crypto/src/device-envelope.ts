/**
 * Sealing and opening one recipient device's E2EE envelope (ADR 0025).
 *
 * This module is the reason franking works at all, so it is worth being blunt about what it is
 * for. Before ADR 0025, `franking_commitment` was 32 bytes the sender picked freely: the node
 * length-checked them, no device envelope authenticated them, and nothing on the receiving side
 * ever compared them to a plaintext. A sender could encrypt genuine abuse to every recipient
 * device, ship 32 random bytes as the commitment, and be permanently unreportable — the victim's
 * honest report came back `COMMITMENT_MISMATCH`, indistinguishable from a fabricated one. That
 * was ADR 0024's blocker B-045, and no amount of care inside `franking.ts` could fix it, because
 * the gap was between the commitment and the ciphertext rather than inside either.
 *
 * Three things close it, and all three live here:
 *
 *   1. **The opening travels in the inner authenticated plaintext** (ADR 0020 §8), so it is
 *      covered by the body AEAD tag and cannot be separated from the ciphertext it opens.
 *   2. **The commitment is associated data** for that AEAD, so a device envelope only decrypts
 *      under the one commitment the sender bound — and the recipient supplies that commitment
 *      from what the *node* stored and delivered, not from anything inside the envelope.
 *   3. **{@link openDeviceEnvelope} is the only function in `@patches/crypto` that returns E2EE
 *      plaintext, and it verifies the commitment before returning.** There is no flag to skip the
 *      check and no sibling that decrypts without it. `ratchetDecrypt` remains exported as the
 *      ratchet primitive it is, but it knows nothing about envelopes, commitments, or openings,
 *      so it cannot be mistaken for the message-open path.
 *
 * Point 3 is not defensive style. ADR 0024's verdict on the alternative — bind the commitment and
 * merely *require* recipients to check it — was that "without the third, the first two are
 * decoration". A mandatory-by-policy check is one that three clients each get to forget
 * independently. A check that the only plaintext-returning API performs is one they cannot.
 *
 * What this does **not** do: it does not let the node detect a mis-franked message. The node has
 * no plaintext and never will. The consequence of a sender lying changes from "message delivered
 * and unreportable" to "message not delivered at all", and that is the whole of the guarantee.
 */
import { ByteReader, ByteWriter, bytesEqual } from './codec.js';
import { ratchetDecrypt, ratchetEncrypt } from './double-ratchet.js';
import { FrankingError } from './errors.js';
import {
  commitFranking,
  verifyFrankingCommitment,
  type FrankingCommitmentContext,
} from './franking.js';
import {
  E2EE_PROTOCOL,
  E2EE_VERSION,
  KEY_BYTES,
  type DoubleRatchetState,
  type EncryptedRatchetMessage,
  type RatchetRandomSource,
  type RatchetTransition,
} from './types.js';
import { zeroize } from './zeroize.js';

const ENVELOPE_AD_CONTEXT = 'patches-e2ee-v1/franking/envelope-ad';

/**
 * Layout version of the inner authenticated plaintext, versioned independently of
 * `E2EE_VERSION`: this is the shape of the bytes under the body AEAD, not the wire protocol.
 * Bump it whenever a field is added, removed, or reordered, so an envelope written by a newer
 * sender is rejected rather than silently misparsed into a wrong opening.
 */
const INNER_PLAINTEXT_VERSION = 1;

/** The recipient half of an envelope's identity. One envelope addresses exactly one device. */
export interface DeviceEnvelopeRecipient {
  readonly recipientActorId: string;
  readonly recipientDeviceId: string;
}

/** What a sender hands {@link sealDeviceEnvelope}, once per recipient device. */
export interface SealDeviceEnvelopeInput {
  readonly context: FrankingCommitmentContext;
  readonly recipient: DeviceEnvelopeRecipient;
  /**
   * The logical message this envelope belongs to. Identical across every envelope in the fanout
   * and bound into the associated data, so one envelope cannot be presented under a different
   * logical message than the one it was sealed for.
   */
  readonly logicalMessageId: string;
  /** The logical plaintext, already padded to its bucket by the caller. */
  readonly plaintext: Uint8Array;
  /** One per logical message, shared by every envelope in the fanout. */
  readonly openingKey: Uint8Array;
  /** `commitFranking(openingKey, context, plaintext)`. Re-derived and checked here. */
  readonly commitment: Uint8Array;
}

/** What a recipient hands {@link openDeviceEnvelope}. */
export interface OpenDeviceEnvelopeInput {
  readonly context: FrankingCommitmentContext;
  readonly recipient: DeviceEnvelopeRecipient;
  /**
   * The logical message the delivered envelope claims to belong to
   * (`E2eeMailboxEnvelope.logical_message_id`), as the node delivered it — mirrored on seal and
   * open so a node that re-files an envelope under another logical message fails authentication.
   */
  readonly logicalMessageId: string;
  readonly message: EncryptedRatchetMessage;
  /**
   * The commitment **as the node delivered it** (`E2eeMailboxEnvelope.franking_commitment`),
   * never one parsed out of the envelope. That is the entire point: the value checked here is the
   * value the node stored and will later check a report against.
   */
  readonly commitment: Uint8Array;
}

/** A verified open. Reaching this type at all means the franking check already passed. */
export interface OpenedDeviceEnvelope {
  readonly plaintext: Uint8Array;
  /** Disclosed by the recipient, and only by the recipient, when it chooses to report. */
  readonly openingKey: Uint8Array;
}

function requireKeyBytes(value: Uint8Array, label: string): void {
  if (value.length !== KEY_BYTES) throw new FrankingError(`${label} has an invalid length.`);
}

function requireNonEmptyString(value: string, label: string): void {
  if (value.length === 0 || value.length > 256) throw new FrankingError(`${label} is invalid.`);
}

/**
 * The exact associated-data bytes every device envelope's body AEAD binds (ADR 0025 §2, as
 * amended by the 2026-08 E2EE audit hardening: `logicalMessageId` joined the transcript).
 *
 * Exported because the sender, every recipient, and any conformance test must produce identical
 * bytes from three different packages, and a second encoder that has to agree with this one by
 * coincidence is how interop bugs get "fixed" by weakening a check.
 *
 * Binding the recipient's `(actorId, deviceId)` costs nothing and makes a node that moves one
 * device's envelope into another device's mailbox produce an authentication failure rather than a
 * puzzle. Binding `logicalMessageId` extends the same treatment to the message axis: an envelope
 * re-filed under a different logical message — same conversation, epoch, sender, and commitment
 * slot — refuses to open. The commitment is written last and at fixed width, so no field boundary
 * is ambiguous.
 */
export function encodeDeviceEnvelopeAssociatedData(
  context: FrankingCommitmentContext,
  recipient: DeviceEnvelopeRecipient,
  logicalMessageId: string,
  commitment: Uint8Array,
): Uint8Array {
  requireNonEmptyString(context.frankingProfile, 'Franking profile');
  requireNonEmptyString(context.conversationId, 'Conversation id');
  requireNonEmptyString(context.senderActorId, 'Sender actor id');
  requireNonEmptyString(context.senderDeviceId, 'Sender device id');
  requireNonEmptyString(recipient.recipientActorId, 'Recipient actor id');
  requireNonEmptyString(recipient.recipientDeviceId, 'Recipient device id');
  requireNonEmptyString(logicalMessageId, 'Logical message id');
  if (!Number.isSafeInteger(context.membershipEpoch) || context.membershipEpoch < 0) {
    throw new FrankingError('Membership epoch is invalid.');
  }
  requireKeyBytes(commitment, 'Franking commitment');
  return new ByteWriter()
    .string(ENVELOPE_AD_CONTEXT)
    .string(context.frankingProfile)
    .string(E2EE_PROTOCOL)
    .u8(E2EE_VERSION)
    .string(context.conversationId)
    .u64(context.membershipEpoch)
    .string(context.senderActorId)
    .string(context.senderDeviceId)
    .string(recipient.recipientActorId)
    .string(recipient.recipientDeviceId)
    .string(logicalMessageId)
    .fixed(commitment, KEY_BYTES)
    .finish();
}

function encodeInnerPlaintext(openingKey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return new ByteWriter()
    .u8(INNER_PLAINTEXT_VERSION)
    .fixed(openingKey, KEY_BYTES)
    .bytes(plaintext)
    .finish();
}

function decodeInnerPlaintext(inner: Uint8Array): OpenedDeviceEnvelope {
  const reader = new ByteReader(inner);
  const version = reader.u8();
  if (version !== INNER_PLAINTEXT_VERSION) {
    throw new FrankingError('Unsupported inner plaintext layout.');
  }
  const openingKey = reader.fixed(KEY_BYTES);
  const plaintext = reader.bytes();
  reader.end();
  return { openingKey, plaintext };
}

/**
 * Seals one recipient device's envelope.
 *
 * `commitment` is re-derived from `openingKey`, `context`, and `plaintext` and compared, so a
 * sender cannot reach the wire with an envelope whose associated data disagrees with the
 * commitment it is about to declare to the node. That is not the security boundary — a hostile
 * sender simply would not call this function — but an honest client with a bug would otherwise
 * ship messages that every recipient silently discards, and that failure is invisible from the
 * sending side.
 */
export function sealDeviceEnvelope(
  state: DoubleRatchetState,
  input: SealDeviceEnvelopeInput,
  source?: RatchetRandomSource,
): RatchetTransition<EncryptedRatchetMessage> {
  requireKeyBytes(input.openingKey, 'Franking opening key');
  requireKeyBytes(input.commitment, 'Franking commitment');
  if (
    !bytesEqual(commitFranking(input.openingKey, input.context, input.plaintext), input.commitment)
  ) {
    throw new FrankingError(
      'Franking commitment does not bind this opening key to this plaintext under this context.',
    );
  }
  const associatedData = encodeDeviceEnvelopeAssociatedData(
    input.context,
    input.recipient,
    input.logicalMessageId,
    input.commitment,
  );
  const inner = encodeInnerPlaintext(input.openingKey, input.plaintext);
  try {
    return ratchetEncrypt(state, inner, associatedData, source);
  } finally {
    zeroize(inner);
  }
}

/**
 * Opens one device envelope, or refuses.
 *
 * **The only function in this package that returns E2EE plaintext.** Two independent checks stand
 * between an envelope and a returned plaintext, and both are fail-closed:
 *
 *   * AEAD decryption under associated data that includes `input.commitment`. A commitment other
 *     than the one the sender bound — whether the sender declared a different one to the node, or
 *     the node substituted one, or the node redirected this envelope to a different device — is
 *     an `AuthenticationError` from the ratchet, and no plaintext exists to leak.
 *   * The franking check itself: the opening recovered from the inner plaintext must actually
 *     open `input.commitment` over the recovered plaintext under `input.context`. This is what
 *     catches the sender who *did* bind its own bogus commitment consistently. It fails with
 *     {@link FrankingError} and the decrypted plaintext is discarded, never returned and never
 *     included in the error.
 *
 * ADR 0025 §4 specifies the UX on failure and it is deliberately strict: the caller renders a
 * neutral "this message could not be verified and was not shown" placeholder, discards the bytes,
 * and still acknowledges the envelope so the mailbox drains. It does **not** show the message
 * with a warning badge — that would hand the sender exactly what the attack is for, abuse
 * delivered and unreportable, in exchange for a badge.
 *
 * Callers must not log, attach to a metric, or include in an error report anything derived from
 * the returned value or from a failure here (§98, §101, §183.1).
 */
export function openDeviceEnvelope(
  state: DoubleRatchetState,
  input: OpenDeviceEnvelopeInput,
  source?: RatchetRandomSource,
): RatchetTransition<OpenedDeviceEnvelope> {
  requireKeyBytes(input.commitment, 'Franking commitment');
  const associatedData = encodeDeviceEnvelopeAssociatedData(
    input.context,
    input.recipient,
    input.logicalMessageId,
    input.commitment,
  );
  const decrypted = ratchetDecrypt(state, input.message, associatedData, source);
  const opened = decodeInnerPlaintext(decrypted.output);
  zeroize(decrypted.output);
  if (
    !verifyFrankingCommitment(opened.openingKey, input.context, opened.plaintext, input.commitment)
  ) {
    zeroize(opened.openingKey, opened.plaintext);
    // No detail beyond the failure itself: the plaintext that failed is exactly the byte string
    // §183.1 forbids putting anywhere it could be read, and a "expected X got Y" message is a
    // plaintext-disclosure channel wearing a diagnostic's clothes.
    throw new FrankingError('Message failed its franking check and was discarded.');
  }
  return { state: decrypted.state, output: opened };
}
