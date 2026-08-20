/**
 * Message franking primitives (ADR 0020 §9). Every logical E2EE message carries a hidden,
 * sender-chosen commitment over its plaintext; a reporter later discloses the plaintext and the
 * opening key, and the node re-derives both the commitment and its own symmetric report tag to
 * decide whether disclosed evidence is authentic. This is a byte-level building block only: it
 * does not decide report retention, evidence UI copy, or how the opening travels to recipient
 * devices (that is inner-plaintext wiring the proto/domain contract owns).
 *
 * Threat model, per Grubbs/Lu/Ristenpart (CRYPTO 2017) "Message Franking via Committing
 * Authenticated Encryption": ordinary AEAD integrity is not enough, because a malicious sender
 * could construct a ciphertext whose plaintext differs from what an honest recipient decrypts,
 * making a later report's opening fail to match. Binding the commitment to the plaintext with a
 * keyed MAC, and having the *sender* choose and disclose the key, prevents the sender from later
 * disavowing content the recipient actually saw. The node's report tag is a symmetric MAC over a
 * transcript it controls: it proves the node accepted this exact evidence, not that a third party
 * can verify authorship (§9 explicitly rejects public per-message signatures to preserve
 * deniability).
 */
import { ByteWriter, bytesEqual } from './codec.js';
import { FrankingError } from './errors.js';
import { hmacSha256, randomBytes } from './primitives.js';
import { E2EE_ALGORITHM, E2EE_PROTOCOL, E2EE_VERSION, KEY_BYTES } from './types.js';

const COMMITMENT_CONTEXT = 'patches-e2ee-v1/franking/commitment';
const REPORT_CONTEXT = 'patches-e2ee-v1/franking/report';

function requireKeyBytes(value: Uint8Array, label: string): void {
  if (value.length !== KEY_BYTES) throw new FrankingError(`${label} has an invalid length.`);
}

function requireNonEmptyString(value: string, label: string): void {
  if (value.length === 0 || value.length > 256) throw new FrankingError(`${label} is invalid.`);
}

/** A random, sender-chosen 32-byte opening. Embed it in the inner plaintext sent to recipients. */
export function createFrankingOpeningKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

/**
 * Binds `plaintext` to `openingKey` with a keyed MAC. The sender computes this once per logical
 * message and includes both the opening key and the commitment in the AEAD-protected inner
 * plaintext delivered to every recipient device, so every device authenticates the same
 * commitment regardless of fanout.
 */
export function commitFranking(openingKey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  requireKeyBytes(openingKey, 'Franking opening key');
  return hmacSha256(
    openingKey,
    new ByteWriter().string(COMMITMENT_CONTEXT).string(E2EE_ALGORITHM).bytes(plaintext).finish(),
  );
}

/** Constant-time check that `commitment` is the correct binding of `openingKey` to `plaintext`. */
export function verifyFrankingCommitment(
  openingKey: Uint8Array,
  plaintext: Uint8Array,
  commitment: Uint8Array,
): boolean {
  requireKeyBytes(openingKey, 'Franking opening key');
  requireKeyBytes(commitment, 'Franking commitment');
  return bytesEqual(commitFranking(openingKey, plaintext), commitment);
}

/**
 * Canonical fields the node binds into its report tag (ADR 0020 §9). `ciphertextDigests` is one
 * SHA-256 digest per recipient-device payload accepted in the fanout, so tampering with any
 * single device's ciphertext after acceptance invalidates the tag.
 */
export interface FrankingReportTranscript {
  readonly frankingKeyEra: number;
  readonly conversationId: string;
  readonly membershipEpoch: number;
  readonly logicalMessageId: string;
  readonly senderActorId: string;
  readonly senderDeviceId: string;
  readonly recipientFanoutDigest: Uint8Array;
  readonly acceptedAtMs: number;
  readonly commitment: Uint8Array;
  readonly ciphertextDigests: readonly Uint8Array[];
}

/**
 * The exact bytes {@link createNodeReportTag}/{@link verifyNodeReportTag} MAC.
 *
 * Exported (not just an internal helper) so a caller that stores or recomputes the transcript
 * out of band — a node reconstructing it from its own persisted `E2eeLogicalMessage`/envelope
 * rows for report ingestion, say — can produce the identical canonical bytes rather than
 * re-deriving a second encoder that has to agree with this one by coincidence. Every field is
 * length- or width-prefixed (`ByteWriter#string`/`u32`/`u64`/`fixed` with a fixed 32-byte
 * digest), so no two distinct field splits — e.g. `conversationId="ab", logicalMessageId="c"`
 * vs. `conversationId="a", logicalMessageId="bc"` — can ever encode to the same bytes.
 */
export function encodeReportTranscript(transcript: FrankingReportTranscript): Uint8Array {
  requireNonEmptyString(transcript.conversationId, 'Conversation id');
  requireNonEmptyString(transcript.logicalMessageId, 'Logical message id');
  requireNonEmptyString(transcript.senderActorId, 'Sender actor id');
  requireNonEmptyString(transcript.senderDeviceId, 'Sender device id');
  requireKeyBytes(transcript.recipientFanoutDigest, 'Recipient fanout digest');
  requireKeyBytes(transcript.commitment, 'Commitment');
  if (!Number.isSafeInteger(transcript.frankingKeyEra) || transcript.frankingKeyEra < 0) {
    throw new FrankingError('Franking-key era is invalid.');
  }
  if (!Number.isSafeInteger(transcript.membershipEpoch) || transcript.membershipEpoch < 0) {
    throw new FrankingError('Membership epoch is invalid.');
  }
  if (!Number.isSafeInteger(transcript.acceptedAtMs) || transcript.acceptedAtMs < 0) {
    throw new FrankingError('Accepted-at timestamp is invalid.');
  }
  if (transcript.ciphertextDigests.length === 0) {
    throw new FrankingError('Report transcript must cover at least one ciphertext digest.');
  }
  const writer = new ByteWriter()
    .string(REPORT_CONTEXT)
    .string(E2EE_PROTOCOL)
    .u8(E2EE_VERSION)
    .string(E2EE_ALGORITHM)
    .u32(transcript.frankingKeyEra)
    .string(transcript.conversationId)
    .u32(transcript.membershipEpoch)
    .string(transcript.logicalMessageId)
    .string(transcript.senderActorId)
    .string(transcript.senderDeviceId)
    .fixed(transcript.recipientFanoutDigest)
    .u64(transcript.acceptedAtMs)
    .fixed(transcript.commitment)
    .u32(transcript.ciphertextDigests.length);
  for (const digest of transcript.ciphertextDigests) {
    requireKeyBytes(digest, 'Ciphertext digest');
    writer.fixed(digest);
  }
  return writer.finish();
}

/**
 * The node computes this once, after it has durably accepted every recipient-device payload in
 * the fanout, and returns it to the sender as an acceptance receipt. `nodeFrankingKey` is a
 * node-held symmetric secret scoped to `frankingKeyEra`; rotating the era invalidates tags signed
 * under a retired key without needing per-message revocation.
 */
export function createNodeReportTag(
  nodeFrankingKey: Uint8Array,
  transcript: FrankingReportTranscript,
): Uint8Array {
  requireKeyBytes(nodeFrankingKey, 'Node franking key');
  return hmacSha256(nodeFrankingKey, encodeReportTranscript(transcript));
}

/** Constant-time check that `tag` is the node's own tag for `transcript` under `nodeFrankingKey`. */
export function verifyNodeReportTag(
  nodeFrankingKey: Uint8Array,
  transcript: FrankingReportTranscript,
  tag: Uint8Array,
): boolean {
  requireKeyBytes(nodeFrankingKey, 'Node franking key');
  requireKeyBytes(tag, 'Node report tag');
  return bytesEqual(createNodeReportTag(nodeFrankingKey, transcript), tag);
}

/** Everything a moderator view needs to decide whether reporter-disclosed evidence is authentic. */
export interface FrankingReportEvidence {
  readonly plaintext: Uint8Array;
  readonly openingKey: Uint8Array;
  readonly commitment: Uint8Array;
  readonly transcript: FrankingReportTranscript;
  readonly nodeReportTag: Uint8Array;
}

/**
 * Verifies disclosed report evidence end to end: the plaintext matches the sender's hidden
 * commitment, the commitment matches the one bound into the node's accepted transcript, and the
 * node's own tag over that transcript is intact. Throws `FrankingError` (never returns partial
 * plaintext or a boolean that could be misread as "verified enough") the moment any check fails,
 * so callers cannot accidentally treat a forged, truncated, or replayed-transcript report as
 * verified. Per ADR 0020 §9, a failed report is not discarded by this function's caller — it is
 * marked unverifiable and still handled, just without the verified badge.
 */
export function verifyFrankingReport(
  nodeFrankingKey: Uint8Array,
  evidence: FrankingReportEvidence,
): void {
  if (!bytesEqual(evidence.commitment, evidence.transcript.commitment)) {
    throw new FrankingError('Disclosed commitment does not match the accepted transcript.');
  }
  if (!verifyFrankingCommitment(evidence.openingKey, evidence.plaintext, evidence.commitment)) {
    throw new FrankingError('Disclosed plaintext does not match the sender commitment.');
  }
  if (!verifyNodeReportTag(nodeFrankingKey, evidence.transcript, evidence.nodeReportTag)) {
    throw new FrankingError('Node report tag does not match the accepted transcript.');
  }
}
