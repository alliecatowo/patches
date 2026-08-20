/**
 * Message franking primitives (ADR 0020 §9, as amended by **ADR 0025**). Every logical E2EE
 * message carries a hidden commitment over its plaintext *and its metadata context*; a reporter
 * later discloses the plaintext and the opening key, and the node re-derives both the commitment
 * and its own symmetric report tag to decide whether disclosed evidence is authentic.
 *
 * Threat model, per Grubbs/Lu/Ristenpart (CRYPTO 2017) "Message Franking via Committing
 * Authenticated Encryption": ordinary AEAD integrity is not enough, because a malicious sender
 * could construct a ciphertext whose plaintext differs from what an honest recipient decrypts,
 * making a later report's opening fail to match.
 *
 * ## Why this file alone is not franking (ADR 0024, ADR 0025 §4)
 *
 * A commitment the sender computes and then never has to honour is worth nothing: before ADR
 * 0025, `franking_commitment` was 32 sender-chosen bytes that the node length-checked and no
 * recipient ever verified, so any sender could repudiate any message by shipping random bytes.
 * The functions here are the *arithmetic*; the binding lives in `device-envelope.ts`, which is
 * the only place in this package that returns E2EE plaintext and which verifies the commitment
 * before it does. Do not add a second plaintext-returning path that skips it — the check being
 * unskippable is the security property, not a style preference.
 *
 * The node's report tag is a symmetric MAC over a transcript it controls: it proves the node
 * accepted this exact evidence, not that a third party can verify authorship (§9 explicitly
 * rejects public per-message signatures to preserve deniability).
 */
import { ByteWriter, bytesEqual } from './codec.js';
import { FrankingError } from './errors.js';
import { hmacSha256, randomBytes } from './primitives.js';
import { E2EE_ALGORITHM, E2EE_PROTOCOL, E2EE_VERSION, KEY_BYTES } from './types.js';

const COMMITMENT_CONTEXT = 'patches-e2ee-v1/franking/commitment';
const REPORT_CONTEXT = 'patches-e2ee-v1/franking/report';

/**
 * The anti-Grubbs/Lu/Ristenpart (CRYPTO 2017) invariant, not ordinary input validation: RFC 2104
 * key reduction makes `HMAC(K, M) === HMAC(SHA256(K), M)` whenever `|K| > 64`, which lets a
 * committer forge a second opening for the same commitment/tag once a key is long enough to be
 * reduced. Forcing every key here to exactly `KEY_BYTES` (32) keeps every key in this module well
 * below that 64-byte reduction boundary, which is the entire binding defense `commitFranking`/
 * `verifyFrankingCommitment`/`createNodeReportTag`/`verifyNodeReportTag` rely on (ADR 0024). A
 * future "widen this to accept a 64-byte key" change would look like an ordinary relaxation and
 * silently reopen the attack — do not loosen this check without re-deriving the binding argument.
 */
function requireKeyBytes(value: Uint8Array, label: string): void {
  if (value.length !== KEY_BYTES) throw new FrankingError(`${label} has an invalid length.`);
}

function requireNonEmptyString(value: string, label: string): void {
  if (value.length === 0 || value.length > 256) throw new FrankingError(`${label} is invalid.`);
}

function requireCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new FrankingError(`${label} is invalid.`);
}

/** A random, sender-chosen 32-byte opening. Embed it in the inner plaintext sent to recipients. */
export function createFrankingOpeningKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

/**
 * The metadata a commitment is bound to, alongside the plaintext (ADR 0025 §1).
 *
 * Binding these is what stops a commitment from being lifted out of the message it belongs to:
 * a value computed for one conversation, epoch, sender device, or franking profile does not
 * verify anywhere else. Everything here is per *logical message*, never per device — the
 * recipient's own identity is bound by the envelope associated data (`device-envelope.ts`)
 * instead, because one commitment covers the whole fanout.
 *
 * `frankingProfile` replaces the `E2EE_ALGORITHM` that used to be hashed in here. That constant
 * names the *ratchet suite*: it changes for reasons unrelated to franking and does not change
 * when franking does, so it was the wrong agility knob (ADR 0024's B-052). With the profile bound
 * instead, a future `patches-franking-v2` with a similar layout is not cross-acceptable with v1.
 */
export interface FrankingCommitmentContext {
  readonly frankingProfile: string;
  readonly conversationId: string;
  readonly membershipEpoch: number;
  readonly senderActorId: string;
  readonly senderDeviceId: string;
}

/**
 * The exact bytes {@link commitFranking} MACs. Every field is length- or width-prefixed, so no
 * two distinct `(context, plaintext)` pairs encode to the same bytes and the commitment inherits
 * its binding from HMAC-SHA256's collision resistance over a fixed-length key.
 */
function encodeCommitmentTranscript(
  context: FrankingCommitmentContext,
  plaintext: Uint8Array,
): Uint8Array {
  requireNonEmptyString(context.frankingProfile, 'Franking profile');
  requireNonEmptyString(context.conversationId, 'Conversation id');
  requireNonEmptyString(context.senderActorId, 'Sender actor id');
  requireNonEmptyString(context.senderDeviceId, 'Sender device id');
  requireCount(context.membershipEpoch, 'Membership epoch');
  return new ByteWriter()
    .string(COMMITMENT_CONTEXT)
    .string(context.frankingProfile)
    .string(E2EE_PROTOCOL)
    .u8(E2EE_VERSION)
    .string(context.conversationId)
    .u64(context.membershipEpoch)
    .string(context.senderActorId)
    .string(context.senderDeviceId)
    .bytes(plaintext)
    .finish();
}

/**
 * Binds `plaintext` and `context` to `openingKey` with a keyed MAC. The sender computes this once
 * per logical message; `device-envelope.ts` then carries the opening inside every device's
 * AEAD-protected inner plaintext and binds the resulting commitment into every device's
 * associated data, so a recipient that can decrypt at all is looking at the one commitment the
 * node stored.
 *
 * Binding is the property that matters and it is worth naming: producing two openings that verify
 * two *different* plaintexts under one commitment would be an HMAC-SHA256 collision, because
 * `requireKeyBytes` fixes both openings at 32 bytes and `(K, M) ↦ (K ⊕ ipad) ‖ M` is injective at
 * a fixed key width. That is what closes ADR 0024's multi-device equivocation variant: a sender
 * cannot show `P₁` to one device and `P₂` to another under a single commitment.
 */
export function commitFranking(
  openingKey: Uint8Array,
  context: FrankingCommitmentContext,
  plaintext: Uint8Array,
): Uint8Array {
  requireKeyBytes(openingKey, 'Franking opening key');
  return hmacSha256(openingKey, encodeCommitmentTranscript(context, plaintext));
}

/** Constant-time check that `commitment` binds `openingKey` to `plaintext` under `context`. */
export function verifyFrankingCommitment(
  openingKey: Uint8Array,
  context: FrankingCommitmentContext,
  plaintext: Uint8Array,
  commitment: Uint8Array,
): boolean {
  requireKeyBytes(openingKey, 'Franking opening key');
  requireKeyBytes(commitment, 'Franking commitment');
  return bytesEqual(commitFranking(openingKey, context, plaintext), commitment);
}

/**
 * Canonical fields the node binds into its report tag (ADR 0020 §9).
 *
 * `ciphertextDigests` is one SHA-256 digest per recipient-device payload accepted in the fanout.
 * Note that these digests are **sender-asserted** and are not recomputed from the stored
 * ciphertext anywhere (B-053, open): the tag therefore commits to the digests the node accepted,
 * not to the bytes it stored.
 *
 * `frankingProfile` is bound here as well as in the commitment (ADR 0024's B-052): it selects the
 * construction, `verifyReportEvidence` branches on it, and unauthenticated data that a verifier
 * branches on is how two profiles end up cross-acceptable. It is a superset of
 * {@link FrankingCommitmentContext}, so {@link commitmentContextFor} can derive that context from
 * a transcript rather than letting a caller supply a second, possibly different, copy.
 */
export interface FrankingReportTranscript {
  readonly frankingProfile: string;
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
 * The commitment context implied by an accepted transcript.
 *
 * The node must check a disclosed commitment against the metadata *it* accepted, never against
 * metadata a reporter supplied. Deriving the context here rather than accepting it as a separate
 * argument removes the call site that could get that wrong.
 */
export function commitmentContextFor(
  transcript: FrankingReportTranscript,
): FrankingCommitmentContext {
  return {
    frankingProfile: transcript.frankingProfile,
    conversationId: transcript.conversationId,
    membershipEpoch: transcript.membershipEpoch,
    senderActorId: transcript.senderActorId,
    senderDeviceId: transcript.senderDeviceId,
  };
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
  requireNonEmptyString(transcript.frankingProfile, 'Franking profile');
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
    .string(transcript.frankingProfile)
    .u32(transcript.frankingKeyEra)
    .string(transcript.conversationId)
    .u32(transcript.membershipEpoch)
    .string(transcript.logicalMessageId)
    .string(transcript.senderActorId)
    .string(transcript.senderDeviceId)
    .fixed(transcript.recipientFanoutDigest, KEY_BYTES)
    .u64(transcript.acceptedAtMs)
    .fixed(transcript.commitment, KEY_BYTES)
    .u32(transcript.ciphertextDigests.length);
  for (const digest of transcript.ciphertextDigests) {
    requireKeyBytes(digest, 'Ciphertext digest');
    writer.fixed(digest, KEY_BYTES);
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

/** `string(REPORT_CONTEXT)` — the exact prefix {@link encodeReportTranscript} always writes. */
const REPORT_TRANSCRIPT_PREFIX = new ByteWriter().string(REPORT_CONTEXT).finish();

/**
 * Constant-time check of `tag` against transcript bytes a caller already holds encoded, for the
 * one place that legitimately has them that way: `@patches/domain`'s `FrankingVerifier` contract
 * passes an opaque `Bytes` transcript because that package must not import this one.
 *
 * The domain separator is **checked, not assumed** (ADR 0024's B-050). The previous shape of this
 * call site was a raw `hmacSha256` under the node's long-term franking key over untyped bytes —
 * an unseparated equality oracle in an exported function whose signature promised nothing about
 * where the bytes came from. Requiring the canonical `REPORT_CONTEXT` prefix means the only
 * strings this key ever MACs are report transcripts, which is the property `verifyNodeReportTag`
 * gets for free from taking a structured transcript. Prefer that overload wherever the caller has
 * the structured value.
 */
export function verifyNodeReportTagOverEncodedTranscript(
  nodeFrankingKey: Uint8Array,
  encodedTranscript: Uint8Array,
  tag: Uint8Array,
): boolean {
  requireKeyBytes(nodeFrankingKey, 'Node franking key');
  requireKeyBytes(tag, 'Node report tag');
  if (encodedTranscript.length <= REPORT_TRANSCRIPT_PREFIX.length) return false;
  if (
    !bytesEqual(
      encodedTranscript.subarray(0, REPORT_TRANSCRIPT_PREFIX.length),
      REPORT_TRANSCRIPT_PREFIX,
    )
  ) {
    return false;
  }
  return bytesEqual(hmacSha256(nodeFrankingKey, encodedTranscript), tag);
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
  if (
    !verifyFrankingCommitment(
      evidence.openingKey,
      commitmentContextFor(evidence.transcript),
      evidence.plaintext,
      evidence.commitment,
    )
  ) {
    throw new FrankingError('Disclosed plaintext does not match the sender commitment.');
  }
  if (!verifyNodeReportTag(nodeFrankingKey, evidence.transcript, evidence.nodeReportTag)) {
    throw new FrankingError('Node report tag does not match the accepted transcript.');
  }
}
