import {
  bytesEqual,
  encodeReportTranscript,
  hmacSha256,
  verifyFrankingCommitment,
  type FrankingReportTranscript,
} from '@patches/crypto';
import {
  assertReporterConsent,
  E2eeContractError,
  E2EE_FRANKING_PROFILE_V1,
  E2EE_REPORT_MAX_EVIDENCE_ITEMS,
  verifyReportEvidence,
  type E2eeEvidenceFailureCode,
  type E2eeEvidenceVerificationStatus,
  type E2eeFrankingTagView,
  type E2eeReportEvidenceItemView,
  type FrankingVerifier,
} from '@patches/domain';
import {
  E2eeEvidenceVerificationStatus as E2eeEvidenceVerificationStatusProto,
  type AttachReportEvidenceRequest,
  type AttachReportEvidenceResponse,
} from '@patches/proto/nest';
import {
  E2eeLogicalMessage as E2eeLogicalMessageEntity,
  E2eeMailboxEnvelope as E2eeMailboxEnvelopeEntity,
  E2eeReportEvidence as E2eeReportEvidenceEntity,
  E2eeReportEvidenceItem as E2eeReportEvidenceItemEntity,
  Report,
} from '@patches/database';
import type { EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';

/**
 * A node-held symmetric franking key, scoped to a rotation era (ADR 0020 §9). Injected rather
 * than read from disk/env directly in this file so the persisted key-custody design — which
 * does not exist as a `packages/database` entity yet — can be swapped in later without touching
 * the verification logic. See the module doc comment for why `EnvNodeFrankingKeyRing` below is
 * explicitly a stand-in, not the reviewed key-management design ADR 0020 §12.7 still requires.
 */
export interface NodeFrankingKeyRing {
  keyForEra(era: number): Uint8Array | undefined;
  knownEras(): readonly number[];
  /**
   * Which era `SendEnvelopes`/`CreateE2eeConversation` (`e2ee-fanout.ts`) sign new tags under.
   * `undefined` means this node has no franking key to sign with at all, which the fanout path
   * treats as "cannot accept a send" rather than silently issuing an unkeyed or wrong-era tag —
   * consistent with `E2EE_APPROVED_FRANKING_PROFILES` being empty today (ADR 0020 §12.7): no
   * node actually reaches this method with `E2EE_V1` enabled yet.
   */
  currentEra(): number | undefined;
}

/**
 * Reads `E2EE_NODE_FRANKING_KEYS` (JSON: era string → base64 32-byte key) once at construction.
 *
 * This is scaffolding, not the reviewed key-management design ADR 0020 §12.7 requires: there is
 * no rotation schedule, no persisted key-era table, and no operational story for provisioning
 * this env var safely. It exists so `AttachReportEvidence` can be wired and adversarially tested
 * end-to-end now, while remaining inert (`knownEras()` is empty, so every item fails closed to
 * `UNKNOWN_KEY_ERA`) on every node that has not set the variable — which is every node today,
 * since `E2EE_APPROVED_FRANKING_PROFILES` is still empty and `E2EE_V1` stays disabled regardless.
 */
export class EnvNodeFrankingKeyRing implements NodeFrankingKeyRing {
  readonly #keys: ReadonlyMap<number, Uint8Array>;

  constructor(env: Readonly<Record<string, string | undefined>> = process.env) {
    const raw = env.E2EE_NODE_FRANKING_KEYS;
    const keys = new Map<number, Uint8Array>();
    if (raw !== undefined && raw.length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        throw new Error('E2EE_NODE_FRANKING_KEYS is not valid JSON.', { cause });
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('E2EE_NODE_FRANKING_KEYS must be a JSON object of era to base64 key.');
      }
      for (const [eraText, value] of Object.entries(parsed as Record<string, unknown>)) {
        const era = Number(eraText);
        if (!Number.isInteger(era) || era <= 0) {
          throw new Error(`E2EE_NODE_FRANKING_KEYS has a non-positive-integer era "${eraText}".`);
        }
        if (typeof value !== 'string') {
          throw new Error(`E2EE_NODE_FRANKING_KEYS era ${eraText} is not a base64 string.`);
        }
        const key = Buffer.from(value, 'base64');
        if (key.length !== 32) {
          throw new Error(`E2EE_NODE_FRANKING_KEYS era ${eraText} is not a 32-byte key.`);
        }
        keys.set(era, new Uint8Array(key));
      }
    }
    this.#keys = keys;
  }

  keyForEra(era: number): Uint8Array | undefined {
    return this.#keys.get(era);
  }

  knownEras(): readonly number[] {
    return [...this.#keys.keys()];
  }

  /** The highest configured era: eras are meant to only increase as keys rotate, so the newest
   * one a node holds is the one it signs new content under. `undefined` when no key is
   * configured at all, which is every node today (see the interface doc comment). */
  currentEra(): number | undefined {
    return this.#keys.size === 0 ? undefined : Math.max(...this.#keys.keys());
  }
}

/**
 * Wires `@patches/crypto`'s franking primitives into `@patches/domain`'s injected
 * `FrankingVerifier` interface (ADR 0020 §14.14.2's "one validator, three processes" rule).
 * `verifyCommitment` delegates straight to `verifyFrankingCommitment` — the exact function
 * `commitFranking`'s own binding check uses — rather than re-deriving the commitment encoding
 * here, so there is exactly one implementation of "does this opening bind this plaintext to this
 * commitment" in the whole codebase. `verifyNodeTag` re-derives the tag over `transcript`, which
 * by construction (see `attachReportEvidence` below) is always `encodeReportTranscript`'s
 * canonical bytes for the same `FrankingReportTranscript` `createNodeReportTag` MACs — the same
 * encoder, just consumed on the `Bytes`-in side of the interface `@patches/domain` requires.
 */
export function e2eeReportFrankingVerifier(keys: NodeFrankingKeyRing): FrankingVerifier {
  return {
    verifyCommitment({ commitment, opening, plaintext }) {
      try {
        return verifyFrankingCommitment(opening, plaintext, commitment);
      } catch {
        // FrankingVerifier's contract requires `false` on malformed input, never a throw — a
        // hostile disclosure must not be able to turn a bad commitment into a different code
        // path than an ordinary mismatch.
        return false;
      }
    },
    verifyNodeTag({ tag, transcript }) {
      const key = keys.keyForEra(tag.keyEra);
      if (key === undefined) return false;
      try {
        return bytesEqual(hmacSha256(key, transcript), tag.tag);
      } catch {
        return false;
      }
    },
  };
}

const RESPONSE_STATUS: Record<E2eeEvidenceVerificationStatus, E2eeEvidenceVerificationStatusProto> =
  {
    PENDING: E2eeEvidenceVerificationStatusProto.E2EE_EVIDENCE_VERIFICATION_STATUS_PENDING,
    VERIFIED: E2eeEvidenceVerificationStatusProto.E2EE_EVIDENCE_VERIFICATION_STATUS_VERIFIED,
    UNVERIFIABLE:
      E2eeEvidenceVerificationStatusProto.E2EE_EVIDENCE_VERIFICATION_STATUS_UNVERIFIABLE,
  };

/**
 * A sentinel key era that can never appear in a real `E2eeLogicalMessage` row
 * (`chk_e2ee_logical_messages_franking_era` requires `era > 0`), used for an item whose
 * disclosed `logical_message_id` does not resolve to anything this node accepted. Routing it
 * through the ordinary `UNKNOWN_KEY_ERA` failure code — rather than inventing a new one — keeps
 * the closed failure-code set closed while still failing every such item, never discarding it.
 */
const UNRESOLVED_MESSAGE_KEY_ERA = 0;

/**
 * `E2eeService.AttachReportEvidence` (ADR 0020 §9, task P13-009): the moderation-ingestion path
 * from a reporter's explicit, consented disclosure to a verified-or-unverifiable evidence
 * record.
 *
 * Every cryptographic input the verifier checks — `commitment`, `frankingTag`, and the
 * transcript bytes tag-derived from it — comes from this node's own `E2eeLogicalMessage`/
 * `E2eeMailboxEnvelope` rows, never from the request. A reporter's client discloses
 * `disclosed_plaintext`/`opening` (the only things it uniquely knows) plus `envelope_transcript`/
 * `franking_tag`/`participant_transcript`/`roster_digest` as human-auditable copies; the
 * cryptographic check is against what the node actually stored, exactly as ADR 0020 §9 requires
 * ("The node verifies the commitment, node tag, envelope digests, sender, and conversation
 * authorization before marking evidence verified"). This is what makes the check meaningful
 * against a forged or replayed disclosure: a caller cannot talk the node into "verifying" bytes
 * it never accepted by supplying its own transcript/tag/commitment.
 *
 * A `logical_message_id` that does not resolve to a row under `conversation_id` is not silently
 * dropped from the submission (that would let a partial-lookup failure look like a smaller,
 * clean report) — it is kept as an item that can never verify (`UNRESOLVED_MESSAGE_KEY_ERA`),
 * so the overall submission still fails closed to `UNVERIFIABLE`.
 */
export async function attachReportEvidence(
  manager: EntityManager,
  actorId: string,
  request: AttachReportEvidenceRequest,
  keys: NodeFrankingKeyRing,
): Promise<AttachReportEvidenceResponse> {
  if (request.reportId.length === 0) throw AppError.validation('A report id is required.');
  if (request.conversationId.length === 0) {
    throw AppError.validation('A conversation id is required.');
  }
  if (request.items.length > E2EE_REPORT_MAX_EVIDENCE_ITEMS) {
    throw AppError.validation(
      `Report evidence is limited to ${String(E2EE_REPORT_MAX_EVIDENCE_ITEMS)} messages.`,
    );
  }

  // Consent is checked before anything else is read or looked up (mirrors
  // `assertReporterConsent`'s own ordering contract).
  assertReporterConsent(request.reporterConsented);

  const report = await manager.getRepository(Report).findOne({ where: { id: request.reportId } });
  // Uniform message for "no such report" and "not this caller's report" — same no-oracle
  // reasoning as every other `*_NOT_FOUND` code in this codebase (spec §62).
  if (report === null || report.reporterActorId !== actorId) {
    throw new AppError('REPORT_NOT_FOUND', 'Report not found.');
  }

  const existing = await manager
    .getRepository(E2eeReportEvidenceEntity)
    .findOne({ where: { reportId: report.id } });
  if (existing !== null) {
    throw AppError.validation('Evidence has already been attached to this report.');
  }

  const items: E2eeReportEvidenceItemView[] = [];
  const rows: {
    position: number;
    logicalMessageId: string;
    disclosedPlaintext: Buffer;
    opening: Buffer;
    envelopeTranscript: Buffer;
    frankingTag: Buffer;
    participantTranscript: Buffer;
    rosterDigest: Buffer;
  }[] = [];

  for (const raw of request.items) {
    if (raw.rosterDigest.length !== 32) {
      throw AppError.validation('Report evidence roster digest has the wrong length.');
    }
    // Mirrors `e2ee_report_evidence_items`'s own `chk_..._sizes` constraint (32 KiB plaintext
    // ceiling matches ADR 0020 §8's padding bucket ceiling for a single message): checked here
    // so an oversized disclosure is a clean `VALIDATION_ERROR`, not a raw constraint violation
    // surfaced as `INTERNAL_ERROR`.
    if (raw.disclosedPlaintext.length > 8192 || raw.opening.length > 4096) {
      throw AppError.validation('Report evidence item is too large to disclose.');
    }
    const logicalMessage = await manager.getRepository(E2eeLogicalMessageEntity).findOne({
      where: { id: raw.logicalMessageId, conversationId: request.conversationId },
    });

    if (logicalMessage === null) {
      // No authoritative record to verify against — build a view that is structurally valid
      // (so `assertReportEvidenceShape` still runs) but can never verify: era 0 is outside
      // every possible `knownEras()` result, so this always fails closed to `UNKNOWN_KEY_ERA`.
      const tag: E2eeFrankingTagView = {
        profile: E2EE_FRANKING_PROFILE_V1,
        keyEra: UNRESOLVED_MESSAGE_KEY_ERA,
        tag: new Uint8Array(32),
        transcriptDigest: new Uint8Array(32),
      };
      items.push({
        position: raw.position,
        logicalMessageId: raw.logicalMessageId,
        disclosedPlaintext: new Uint8Array(raw.disclosedPlaintext),
        opening: new Uint8Array(raw.opening),
        commitment: new Uint8Array(32),
        envelopeTranscript: new Uint8Array(raw.envelopeTranscript),
        frankingTag: tag,
        participantTranscript: new Uint8Array(raw.participantTranscript),
        rosterDigest: new Uint8Array(raw.rosterDigest),
      });
      rows.push({
        position: raw.position,
        logicalMessageId: raw.logicalMessageId,
        disclosedPlaintext: Buffer.from(raw.disclosedPlaintext),
        opening: Buffer.from(raw.opening),
        envelopeTranscript: Buffer.from(raw.envelopeTranscript),
        frankingTag: Buffer.alloc(32),
        participantTranscript: Buffer.from(raw.participantTranscript),
        rosterDigest: Buffer.from(raw.rosterDigest),
      });
      continue;
    }

    const envelopes = await manager
      .getRepository(E2eeMailboxEnvelopeEntity)
      .find({ where: { logicalMessageId: logicalMessage.id } });
    const transcript: FrankingReportTranscript = {
      frankingKeyEra: logicalMessage.frankingKeyEra,
      conversationId: logicalMessage.conversationId,
      membershipEpoch: Number(logicalMessage.epoch),
      logicalMessageId: logicalMessage.id,
      senderActorId: logicalMessage.senderActorId,
      senderDeviceId: logicalMessage.senderDeviceId,
      recipientFanoutDigest: new Uint8Array(logicalMessage.fanoutDigest),
      acceptedAtMs: logicalMessage.acceptedAt.getTime(),
      commitment: new Uint8Array(logicalMessage.frankingCommitment),
      ciphertextDigests: envelopes.map((envelope) => new Uint8Array(envelope.ciphertextDigest)),
    };
    const encodedTranscript = encodeReportTranscript(transcript);

    items.push({
      position: raw.position,
      logicalMessageId: logicalMessage.id,
      disclosedPlaintext: new Uint8Array(raw.disclosedPlaintext),
      opening: new Uint8Array(raw.opening),
      commitment: new Uint8Array(logicalMessage.frankingCommitment),
      envelopeTranscript: encodedTranscript,
      frankingTag: {
        profile: logicalMessage.frankingProfile,
        keyEra: logicalMessage.frankingKeyEra,
        tag: new Uint8Array(logicalMessage.frankingTag),
        transcriptDigest: encodedTranscript,
      },
      participantTranscript: new Uint8Array(raw.participantTranscript),
      rosterDigest: new Uint8Array(raw.rosterDigest),
    });
    rows.push({
      position: raw.position,
      logicalMessageId: logicalMessage.id,
      disclosedPlaintext: Buffer.from(raw.disclosedPlaintext),
      opening: Buffer.from(raw.opening),
      envelopeTranscript: Buffer.from(encodedTranscript),
      frankingTag: Buffer.from(logicalMessage.frankingTag),
      participantTranscript: Buffer.from(raw.participantTranscript),
      rosterDigest: Buffer.from(raw.rosterDigest),
    });
  }

  // `verifyReportEvidence` re-checks consent and the item shape itself; a shape violation (an
  // empty submission, a duplicate position, a malformed field) is a caller bug or policy
  // violation, not an evidence-quality outcome, so it throws rather than becoming
  // `UNVERIFIABLE` — translated to the same `AppError` shape every other domain-contract
  // violation in this module uses (`roster-chain.ts`'s `throwOnContractError` pattern).
  let result: ReturnType<typeof verifyReportEvidence>;
  try {
    result = verifyReportEvidence(
      { reporterConsented: request.reporterConsented, items },
      {
        verifier: e2eeReportFrankingVerifier(keys),
        acceptedProfiles: [E2EE_FRANKING_PROFILE_V1],
        knownKeyEras: keys.knownEras(),
      },
    );
  } catch (error) {
    if (error instanceof E2eeContractError) throw AppError.validation(error.message);
    throw error;
  }

  const now = new Date();
  await manager.getRepository(E2eeReportEvidenceEntity).save({
    reportId: report.id,
    verificationStatus: result.status,
    consentedAt: now,
    verifiedAt: result.status === 'VERIFIED' ? now : null,
    verificationFailureCode: result.failureCode ?? null,
  });
  for (const row of rows) {
    await manager.getRepository(E2eeReportEvidenceItemEntity).save({ reportId: report.id, ...row });
  }

  const failureCode: E2eeEvidenceFailureCode | undefined = result.failureCode;
  return {
    status: RESPONSE_STATUS[result.status],
    verificationFailureCode: failureCode ?? '',
    verifiedItemCount: result.verifiedItemCount,
    reporterSelectedContext: result.partialContext,
  };
}
