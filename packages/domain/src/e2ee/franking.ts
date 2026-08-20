/**
 * Message franking and reporter-disclosed evidence (ADR 0020 §9).
 *
 * Franking is what keeps abuse reports actionable when the node cannot read the conversation. It
 * has two halves, and conflating them is the classic mistake:
 *
 *   * a **sender commitment** to the plaintext, hidden from the node, whose opening is sealed to
 *     each recipient — so a recipient, and only a recipient, can later prove what was sent; and
 *   * the **node's own symmetric tag** over the metadata transcript it accepted, which proves to
 *     *this node* that it routed this content under this metadata.
 *
 * The node's tag is deliberately symmetric and node-keyed, and therefore forgeable by the node
 * itself. That is a feature: a public per-message signature would make every message a
 * transferable, non-repudiable receipt, destroying sender deniability for the sake of an
 * assurance no moderation flow needs. Franking answers "did this node accept this?", never "can
 * a third party prove this person said it?" — and the moderator UI has to say so, because a
 * moderator who thinks a franking tag is courtroom-grade proof will misuse it.
 *
 * Nothing here computes a commitment or a tag; both are injected. What is enforced here is the
 * disclosure discipline around them: consent is explicit, the selection is bounded, failure is
 * "unverifiable" rather than "discarded", and no diagnostic ever carries a byte of the disclosed
 * plaintext.
 */
import { E2eeContractError, E2EE_REPORT_MAX_SURROUNDING_MESSAGES } from './modes.js';
import { bytesEqual, E2EE_DIGEST_BYTES, type Bytes, type DigestFunction } from './types.js';

/** The node's symmetric tag over an accepted logical message. */
export interface E2eeFrankingTagView {
  readonly profile: string;
  /** Key-rotation era. Old eras stay verifiable against a retained key; unknown eras do not. */
  readonly keyEra: number;
  readonly tag: Bytes;
  readonly transcriptDigest: Bytes;
}

/**
 * The metadata a franking commitment binds alongside the plaintext (ADR 0025 §1).
 *
 * The node must build this from the `E2eeLogicalMessage` row **it** accepted, never from the
 * report request. Everything a reporter sends is a human-auditable copy; the cryptographic check
 * is against what the node stored, which is what makes it meaningful against a forged or replayed
 * disclosure.
 */
export interface E2eeFrankingCommitmentContext {
  readonly frankingProfile: string;
  readonly conversationId: string;
  readonly membershipEpoch: number;
  readonly senderActorId: string;
  readonly senderDeviceId: string;
}

/**
 * The committing half, injected.
 *
 * `verifyCommitment` MUST be the *binding* check of a committing scheme — given a commitment, an
 * opening, a plaintext, and the context the commitment was made under, it answers whether that
 * plaintext is the one the sender committed to. "Binding" is the whole requirement: an
 * implementation for which a second `(opening, plaintext)` pair could satisfy the same commitment
 * would accept fabricated evidence, which is precisely the attack franking exists to stop.
 *
 * This contract used to say "MUST be the binding check of a committing AEAD", and the shipped
 * implementation was a plain keyed MAC over the plaintext — the thing the sentence went on to
 * forbid (ADR 0024). What actually failed was not the primitive but the protocol around it: the
 * commitment was sender-chosen, unbound to any ciphertext, and verified by nobody. ADR 0025 fixes
 * that in `@patches/crypto` (`device-envelope.ts`), where the commitment is AEAD associated data
 * and the only plaintext-returning function checks it. A verifier plugged in here is doing the
 * *node's* half — re-checking a reporter's disclosure — and inherits its binding from the same
 * fixed-width-key HMAC the recipient already checked.
 *
 * `verifyNodeTag` is node-side only; a client has no franking key and must never be handed one.
 * Both return `false` on malformed input rather than throwing.
 */
export interface FrankingVerifier {
  verifyCommitment(input: {
    readonly commitment: Bytes;
    readonly opening: Bytes;
    readonly plaintext: Bytes;
    readonly context: E2eeFrankingCommitmentContext;
  }): boolean;

  verifyNodeTag(input: { readonly tag: E2eeFrankingTagView; readonly transcript: Bytes }): boolean;
}

/** Mirrors `E2eeEvidenceVerificationStatus` in `patches/v1/e2ee.proto`. */
export const E2EE_EVIDENCE_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'UNVERIFIABLE'] as const;
export type E2eeEvidenceVerificationStatus = (typeof E2EE_EVIDENCE_VERIFICATION_STATUSES)[number];

/**
 * Stable failure codes. A closed set, on purpose: a free-form reason string is exactly where a
 * fragment of disclosed plaintext eventually leaks into a log line.
 */
export const E2EE_EVIDENCE_FAILURE_CODES = [
  'COMMITMENT_MISMATCH',
  'NODE_TAG_MISMATCH',
  'UNKNOWN_FRANKING_PROFILE',
  'UNKNOWN_KEY_ERA',
  'TRANSCRIPT_MISMATCH',
] as const;
export type E2eeEvidenceFailureCode = (typeof E2EE_EVIDENCE_FAILURE_CODES)[number];

/** One reporter-selected message. `position` 0 is the reported message itself. */
export interface E2eeReportEvidenceItemView {
  readonly position: number;
  readonly logicalMessageId: string;
  /** The single intentional plaintext disclosure in the whole E2EE contract. */
  readonly disclosedPlaintext: Bytes;
  readonly opening: Bytes;
  readonly commitment: Bytes;
  /** Built from the node's own accepted row, never from the request (ADR 0025 §6). */
  readonly commitmentContext: E2eeFrankingCommitmentContext;
  readonly envelopeTranscript: Bytes;
  readonly frankingTag: E2eeFrankingTagView;
  readonly participantTranscript: Bytes;
  readonly rosterDigest: Bytes;
}

/** Maximum items in one submission: the reported message plus its bounded surrounding context. */
export const E2EE_REPORT_MAX_EVIDENCE_ITEMS = E2EE_REPORT_MAX_SURROUNDING_MESSAGES + 1;

/**
 * Consent is a positive act, checked before anything is read.
 *
 * The node stamps its own `consented_at`; the client cannot supply one. A client that could
 * backdate consent could construct a record showing a user agreed to a disclosure they were
 * never shown.
 */
export function assertReporterConsent(consented: boolean): void {
  if (!consented) {
    throw new E2eeContractError(
      'Report evidence requires explicit reporter consent; disclosure is never a default.',
    );
  }
}

/**
 * Shape of a submission, independent of any cryptography.
 *
 * The bound matters for its own sake. Without it, "report with context" is an unbounded
 * plaintext-extraction channel: a reporter — or malware acting as one — could disclose an entire
 * conversation under the label of a single complaint.
 */
export function assertReportEvidenceShape(items: readonly E2eeReportEvidenceItemView[]): void {
  if (items.length === 0) {
    throw new E2eeContractError('Report evidence must contain at least the reported message.');
  }
  if (items.length > E2EE_REPORT_MAX_EVIDENCE_ITEMS) {
    throw new E2eeContractError(
      `Report evidence is limited to ${String(E2EE_REPORT_MAX_EVIDENCE_ITEMS)} messages (the reported message plus ${String(E2EE_REPORT_MAX_SURROUNDING_MESSAGES)} surrounding).`,
    );
  }

  const positions = new Set<number>();
  for (const item of items) {
    if (!Number.isInteger(item.position) || item.position < 0) {
      throw new E2eeContractError('Report evidence positions must be non-negative integers.');
    }
    if (item.position > E2EE_REPORT_MAX_SURROUNDING_MESSAGES) {
      throw new E2eeContractError(
        `Report evidence position ${String(item.position)} is outside the disclosed window.`,
      );
    }
    if (positions.has(item.position)) {
      throw new E2eeContractError(
        `Report evidence has two items at position ${String(item.position)}.`,
      );
    }
    positions.add(item.position);
    if (item.logicalMessageId.length === 0) {
      throw new E2eeContractError('Report evidence item has no logical message id.');
    }
    if (item.rosterDigest.length !== E2EE_DIGEST_BYTES) {
      throw new E2eeContractError('Report evidence roster digest has the wrong length.');
    }
    if (item.opening.length === 0 || item.commitment.length === 0) {
      throw new E2eeContractError(
        'Report evidence item is missing its franking commitment or opening.',
      );
    }
  }
  if (!positions.has(0)) {
    throw new E2eeContractError('Report evidence must include position 0, the reported message.');
  }
}

/** Outcome of verifying one submission. `failureCode` is set only when `UNVERIFIABLE`. */
export interface E2eeEvidenceVerification {
  readonly status: E2eeEvidenceVerificationStatus;
  readonly verifiedItemCount: number;
  readonly failureCode?: E2eeEvidenceFailureCode | undefined;
  /**
   * Always `true`. Carried in the result rather than assumed, so the moderator UI has something
   * concrete to render: reporter-selected context is not the whole context, and franking proves
   * that what was disclosed was accepted — never that it was all of it (ADR 0020 §9).
   */
  readonly partialContext: true;
}

/**
 * Verifies a submission and reports a status. Deliberately does not throw on a cryptographic
 * failure.
 *
 * A failed franking check means the node cannot vouch for the bytes — not that the report is
 * false and not that the reporter is lying. Reports are queued either way, marked unverifiable,
 * because a harassment report whose evidence fails a technical check is still a harassment
 * report. Throwing here would have made "drop it" the path of least resistance.
 *
 * It still *throws* for shape violations and absent consent: those are caller bugs or policy
 * violations, not evidence quality.
 *
 * `acceptedProfiles` and `knownKeyEras` describe the franking key material this node actually
 * holds. They are not a way around the ship gate: which profiles a node may *operate* is decided
 * by `assertFrankingProfileApproved` (`./modes.ts`) when the capability is enabled (ADR 0020 §12.7). By
 * the time evidence arrives, the only question left is whether this node can check it — and a
 * profile or era it cannot check makes the evidence unverifiable, never discarded.
 */
export function verifyReportEvidence(
  input: {
    readonly reporterConsented: boolean;
    readonly items: readonly E2eeReportEvidenceItemView[];
  },
  deps: {
    readonly verifier: FrankingVerifier;
    readonly acceptedProfiles: readonly string[];
    readonly knownKeyEras: readonly number[];
    /**
     * Recomputes a digest for the {@link E2eeFrankingTagView.transcriptDigest} check below. The
     * same injected-primitive pattern `certificates.ts`/`roster.ts` use, so this module still
     * never imports `@patches/crypto` directly.
     */
    readonly digest: DigestFunction;
  },
): E2eeEvidenceVerification {
  assertReporterConsent(input.reporterConsented);
  assertReportEvidenceShape(input.items);

  let verified = 0;
  let failure: E2eeEvidenceFailureCode | undefined;

  for (const item of input.items) {
    if (!deps.acceptedProfiles.includes(item.frankingTag.profile)) {
      failure ??= 'UNKNOWN_FRANKING_PROFILE';
      continue;
    }
    if (!deps.knownKeyEras.includes(item.frankingTag.keyEra)) {
      failure ??= 'UNKNOWN_KEY_ERA';
      continue;
    }
    // `transcriptDigest` is supposed to let a caller confirm the (potentially large)
    // `envelopeTranscript` handed to `verifyNodeTag` below actually corresponds to the compact
    // digest carried alongside the tag, before spending a MAC verification on it. Nothing
    // checked this — `TRANSCRIPT_MISMATCH` was in the closed failure-code set but assigned by no
    // code path (ADR 0024 B-056).
    if (!bytesEqual(deps.digest(item.envelopeTranscript), item.frankingTag.transcriptDigest)) {
      failure ??= 'TRANSCRIPT_MISMATCH';
      continue;
    }
    if (
      !deps.verifier.verifyCommitment({
        commitment: item.commitment,
        opening: item.opening,
        plaintext: item.disclosedPlaintext,
        context: item.commitmentContext,
      })
    ) {
      failure ??= 'COMMITMENT_MISMATCH';
      continue;
    }
    if (
      !deps.verifier.verifyNodeTag({
        tag: item.frankingTag,
        transcript: item.envelopeTranscript,
      })
    ) {
      failure ??= 'NODE_TAG_MISMATCH';
      continue;
    }
    verified += 1;
  }

  return failure === undefined
    ? { status: 'VERIFIED', verifiedItemCount: verified, partialContext: true }
    : {
        status: 'UNVERIFIABLE',
        verifiedItemCount: verified,
        failureCode: failure,
        partialContext: true,
      };
}

/**
 * The sentence a moderator surface MUST carry alongside franked evidence.
 *
 * Exported as text rather than left to each UI because the failure mode is a moderator treating
 * a symmetric, node-forgeable tag as transferable proof and acting on it as though it were.
 */
export const E2EE_FRANKING_MODERATOR_DISCLOSURE =
  'This evidence was disclosed by the reporter and verified against what this node accepted. ' +
  'It is not proof to anyone outside this node, and it is only the messages the reporter chose to show.';
