import { randomUUID } from 'node:crypto';

import {
  Conversation as ConversationEntity,
  ConversationMember as ConversationMemberEntity,
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeLogicalMessage as E2eeLogicalMessageEntity,
  E2eeMailboxEnvelope as E2eeMailboxEnvelopeEntity,
} from '@patches/database';
import {
  assertCiphertextDigestsMatchCiphertexts,
  assertFanoutCovers,
  assertFanoutDigest,
  assertGroupFanoutBounds,
  assertMembershipEpochCurrent,
  E2eeContractError,
  E2EE_DIGEST_BYTES,
  E2EE_FRANKING_PROFILE_V1,
  sortFanoutTargets,
  type E2eeDeviceEnvelopeView,
  type E2eeFanoutTarget,
  type E2eeLogicalMessageView,
} from '@patches/domain';
import {
  createNodeReportTag,
  encodeReportTranscript,
  type FrankingReportTranscript,
} from '@patches/crypto';
import { type E2eeFrankingTag as E2eeFrankingTagProto } from '@patches/proto';
import { type E2eeLogicalMessage as E2eeLogicalMessageProto } from '@patches/proto/nest';
import { type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { parseInput, uuidInputSchema } from '../posts/validation.js';
import { e2eeDigest } from './e2ee-crypto.adapter.js';
import { toBytes } from './e2ee.codec.js';
import { loadCurrentGroupControl } from './group-control.js';
import { type NodeFrankingKeyRing } from './report-evidence.js';
import { type E2eeRuntimeApprovalPolicy } from './e2ee-runtime-approval-policy.js';

/**
 * `SendEnvelopes`/`CreateE2eeConversation`'s shared fanout-accept core (ADR 0020 §7, §14.14.5,
 * P13-007). "Accept" here means: given a signed logical message and the sender's claimed
 * device-envelope set, decide — atomically, against this node's own committed state, never the
 * sender's possibly-stale roster snapshot — whether that set is *exactly* every active device of
 * every current conversation member (minus the sending device itself, which never mails itself a
 * copy). Anything else is rejected whole; there is no partial acceptance.
 *
 * ## The revocation-race rule
 *
 * `RevokeDevice` (`device-roster.service.ts`) and this module's fanout accept both eventually
 * touch the same `e2ee_device_identities` row: revoke `UPDATE`s its `revoked_at`, and fanout
 * accept reads it. The race is resolved by locking, not by re-checking after the fact:
 *
 *   1. Before computing the expected device set, this module takes a `SELECT ... FOR SHARE` lock
 *      (`pessimistic_read`) on every device row belonging to a current conversation member —
 *      active or not, so a device that is about to be revoked is locked too.
 *   2. `RevokeDevice`'s `UPDATE` of that same row needs a conflicting lock. Postgres serializes
 *      the two transactions on this row: whichever commits first is authoritative for the other.
 *   3. If revoke commits first, this module's `SELECT` (in a fresh transaction) sees the
 *      committed `revoked_at` and excludes that device from the expected set. A sender who built
 *      an envelope for that device *before* seeing the revocation gets `E2EE_FANOUT_REJECTED`
 *      for the whole send — fail closed, never a silent partial delivery to a revoked device.
 *   4. If this module's `SELECT ... FOR SHARE` locks first, `RevokeDevice`'s `UPDATE` blocks
 *      until this transaction commits or rolls back. A device that was genuinely still active at
 *      accept time receives its legitimately composed envelope; the revocation takes effect for
 *      every send after it.
 *
 * The same mechanism — always recompute the expected set from the currently committed, locked
 * state, and require an *exact* match — also covers the opposite race: a device enrolled after
 * the sender last read the roster is active at accept time, so it appears in the expected set and
 * a fanout that does not address it is rejected as incomplete rather than silently delivered
 * without it. One rule, both directions: the sender always recomposes against a fresh
 * `GetE2eeConversationState` rather than the node ever guessing what "close enough" means.
 *
 * ## Dedup / retry
 *
 * `(sender_actor_id, client_request_id)` is unique on `e2ee_logical_messages` (P13-002). A retry
 * with the same pair short-circuits to the original acceptance — including under a concurrent
 * double-send, caught via the unique-violation path below — rather than re-running the fanout
 * check or inserting a second set of mailbox envelopes. A `client_request_id` reused for a
 * *different* conversation or message is a caller bug and is rejected, not silently replayed.
 *
 * ## Membership epoch
 *
 * Every conversation starts at epoch 1 — the creation membership `CreateE2eeConversation`
 * establishes — and each authenticated `AddE2eeMember`/`RemoveE2eeMember` appends exactly
 * one device-signed event to the conversation's group-control transcript
 * (`group-control.ts`), bumping the epoch by exactly one. This core loads that epoch from
 * committed state *after* taking the member and device locks below, and rejects any send
 * not composed under it (`assertMembershipEpochCurrent`): a message encrypted to a
 * departed member's devices is rejected whole rather than delivered, and the sender
 * recomposes under the new epoch. Replay of an already-accepted `client_request_id` keeps
 * the epoch it was originally accepted under — the stored row is authoritative.
 */
export interface AcceptedLogicalMessage {
  readonly logicalMessageId: string;
  readonly acceptedAt: Date;
  readonly fanoutDigest: Uint8Array;
  readonly frankingTag: E2eeFrankingTagProto;
  readonly acceptedRecipientDeviceIds: readonly string[];
  /** True when this result was reconstructed from an earlier acceptance of the same
   * `(senderActorId, clientRequestId)` rather than freshly accepted just now. */
  readonly replay: boolean;
}

export interface AcceptLogicalMessageInput {
  readonly conversationId: string;
  readonly senderActorId: string;
  readonly senderDeviceId: string;
  readonly clientRequestId: string;
  readonly message: E2eeLogicalMessageProto | undefined;
  readonly keys: NodeFrankingKeyRing;
  readonly approvalPolicy: E2eeRuntimeApprovalPolicy;
}

function toDeviceEnvelopeView(proto: {
  recipientActorId: string;
  recipientDeviceId: string;
  encryptedHeader: Buffer;
  ciphertext: Buffer;
  openingCiphertext: Buffer;
  ciphertextDigest: Buffer;
}): E2eeDeviceEnvelopeView {
  return {
    recipientActorId: proto.recipientActorId,
    recipientDeviceId: proto.recipientDeviceId,
    encryptedHeader: toBytes(proto.encryptedHeader),
    ciphertext: toBytes(proto.ciphertext),
    openingCiphertext: toBytes(proto.openingCiphertext),
    ciphertextDigest: toBytes(proto.ciphertextDigest),
  };
}

function wrapFanoutError(error: unknown): never {
  if (error instanceof E2eeContractError) throw new AppError('E2EE_FANOUT_REJECTED', error.message);
  throw error;
}

function targetKey(actorId: string, deviceId: string): string {
  return `${actorId} ${deviceId}`;
}

/** Every device row of every current member, active or not — the caller filters. Locked
 * `FOR SHARE` so a concurrent `RevokeDevice` serializes against this transaction (see the module
 * doc comment). Ordered by primary key so two concurrent fanout accepts over an overlapping
 * member set always request their shared locks in the same order and cannot deadlock each other;
 * `FOR SHARE` locks from different transactions do not conflict with each other regardless. */
function lockMemberDeviceRows(
  manager: EntityManager,
  memberActorIds: readonly string[],
): Promise<E2eeDeviceIdentityEntity[]> {
  return manager
    .createQueryBuilder(E2eeDeviceIdentityEntity, 'device')
    .where('device.actorId IN (:...ids)', { ids: [...memberActorIds] })
    .orderBy('device.id', 'ASC')
    .setLock('pessimistic_read')
    .getMany();
}

function isActiveDevice(device: E2eeDeviceIdentityEntity, now: Date): boolean {
  return device.revokedAt === null && device.expiresAt.getTime() > now.getTime();
}

/** Every current member's actor id — the same rows `loadActiveMemberActorIds` reads
 * elsewhere, but locked `FOR SHARE` and ordered by `actorId` so a concurrent
 * `RemoveE2eeMember` (a `leftAt` UPDATE on one of these rows) serializes against this
 * accept exactly the way `RevokeDevice` serializes against the device-row lock below: a
 * removal that commits first is visible here as an excluded member (the sender's fanout
 * for them is rejected as addressing a non-member's device); a removal whose UPDATE is
 * pending waits for this accept to commit, and the message lands under the epoch it was
 * composed in while the member was still active. Two concurrent accepts take compatible
 * `FOR SHARE` locks regardless, and the deterministic ordering keeps them out of deadlock
 * with each other and with the device locks taken next. */
async function lockActiveMemberActorIds(
  manager: EntityManager,
  conversationId: string,
): Promise<string[]> {
  const members = await manager
    .createQueryBuilder(ConversationMemberEntity, 'member')
    .where('member.conversationId = :conversationId', { conversationId })
    .andWhere('member.leftAt IS NULL')
    .orderBy('member.actorId', 'ASC')
    .setLock('pessimistic_read')
    .getMany();
  return members.map((member) => member.actorId);
}

/**
 * The batched form of {@link transcriptDigestForStoredMessage} — one query for every message in
 * `storedMessages` instead of one query per message (the N+1 `ListMailboxEnvelopes` used to run,
 * P19-019 part 2: a page of up to `limit` envelopes recomputed this per envelope, each a
 * round trip). `WHERE logical_message_id IN (...)` hits the same
 * `(logical_message_id, recipient_device_identity_id)` unique index a single-message
 * `WHERE logical_message_id = ...` would, and Postgres evaluates a `= ANY(array)` index
 * condition as a per-element probe of that index in array order — so each message's own subset
 * of the combined result comes back in exactly the order a standalone query for that one message
 * would have returned, and the per-message digest this computes is byte-for-byte what the old
 * one-query-per-message loop computed. Callers that don't care about order should still pass
 * `storedMessages` in a stable order (e.g. page order) since duplicate message ids are just
 * redundant work, not a correctness risk — the grouping below is keyed by id regardless of input
 * order.
 */
export async function transcriptDigestsForStoredMessages(
  manager: EntityManager,
  storedMessages: readonly E2eeLogicalMessageEntity[],
): Promise<
  ReadonlyMap<string, { readonly digest: Buffer; readonly recipientDeviceIds: readonly string[] }>
> {
  const result = new Map<
    string,
    { readonly digest: Buffer; readonly recipientDeviceIds: readonly string[] }
  >();
  if (storedMessages.length === 0) return result;

  const ids = [...new Set(storedMessages.map((message) => message.id))];
  const envelopes = await manager
    .getRepository(E2eeMailboxEnvelopeEntity)
    .createQueryBuilder('envelope')
    .innerJoinAndSelect('envelope.recipientDeviceIdentity', 'recipientDeviceIdentity')
    .where('envelope.logicalMessageId IN (:...ids)', { ids })
    .getMany();

  const byMessageId = new Map<string, E2eeMailboxEnvelopeEntity[]>();
  for (const envelope of envelopes) {
    const bucket = byMessageId.get(envelope.logicalMessageId);
    if (bucket === undefined) byMessageId.set(envelope.logicalMessageId, [envelope]);
    else bucket.push(envelope);
  }

  for (const stored of storedMessages) {
    if (result.has(stored.id)) continue; // duplicate input, already computed
    const group = byMessageId.get(stored.id) ?? [];
    const digest = e2eeDigest(
      encodeReportTranscript(
        reportTranscriptFor(
          stored,
          group.map((envelope) => toBytes(envelope.ciphertextDigest)),
        ),
      ),
    );
    result.set(stored.id, {
      digest: Buffer.from(digest),
      recipientDeviceIds: group.map((envelope) => envelope.recipientDeviceIdentity.deviceId),
    });
  }
  return result;
}

/**
 * Recomputes `E2eeFrankingTag.transcript_digest` for a single already-persisted logical message
 * — every reader that echoes a stored tag back onto the wire needs this, not just the dedup-
 * replay path below, since the digest itself is never a persisted column (same "recompute on
 * read" reasoning `e2ee.mapper.ts#toProtoCertificate` documents for `certificateDigest`). A one-
 * message call to {@link transcriptDigestsForStoredMessages} — callers computing this for more
 * than one message in the same request (e.g. a mailbox page) should call that directly instead,
 * to get one query rather than one per message.
 */
export async function transcriptDigestForStoredMessage(
  manager: EntityManager,
  stored: E2eeLogicalMessageEntity,
): Promise<{ readonly digest: Buffer; readonly recipientDeviceIds: readonly string[] }> {
  const result = await transcriptDigestsForStoredMessages(manager, [stored]);
  const forThisMessage = result.get(stored.id);
  if (forThisMessage === undefined) {
    // Unreachable: `transcriptDigestsForStoredMessages` always sets an entry for every id in
    // its input, `stored.id` included, even when that message currently has zero envelope rows.
    throw AppError.internal('transcriptDigestsForStoredMessages returned no entry for its input.');
  }
  return forThisMessage;
}

/** Reconstructs an `AcceptedLogicalMessage` from an already-persisted logical message row, for
 * the dedup-replay path. */
async function replayFromStoredMessage(
  manager: EntityManager,
  stored: E2eeLogicalMessageEntity,
): Promise<AcceptedLogicalMessage> {
  const { digest, recipientDeviceIds } = await transcriptDigestForStoredMessage(manager, stored);
  return {
    logicalMessageId: stored.id,
    acceptedAt: stored.acceptedAt,
    fanoutDigest: toBytes(stored.fanoutDigest),
    frankingTag: {
      profile: stored.frankingProfile,
      keyEra: stored.frankingKeyEra,
      tag: stored.frankingTag,
      transcriptDigest: digest,
    },
    acceptedRecipientDeviceIds: recipientDeviceIds,
    replay: true,
  };
}

/** Exactly the fields `FrankingReportTranscript` needs — accepted as a standalone shape (rather
 * than the full `E2eeLogicalMessageEntity`) so the not-yet-persisted accept path can build the
 * same transcript from in-flight values without constructing a fake entity row. */
interface ReportTranscriptSource {
  readonly frankingProfile: string;
  readonly frankingKeyEra: number;
  readonly conversationId: string;
  readonly epoch: string;
  readonly id: string;
  readonly senderActorId: string;
  readonly senderDeviceId: string;
  readonly fanoutDigest: Buffer;
  readonly acceptedAt: Date;
  readonly frankingCommitment: Buffer;
}

function reportTranscriptFor(
  message: ReportTranscriptSource,
  ciphertextDigests: readonly Uint8Array[],
): FrankingReportTranscript {
  return {
    frankingProfile: message.frankingProfile,
    frankingKeyEra: message.frankingKeyEra,
    conversationId: message.conversationId,
    membershipEpoch: Number(message.epoch),
    logicalMessageId: message.id,
    senderActorId: message.senderActorId,
    senderDeviceId: message.senderDeviceId,
    recipientFanoutDigest: toBytes(message.fanoutDigest),
    acceptedAtMs: message.acceptedAt.getTime(),
    commitment: toBytes(message.frankingCommitment),
    ciphertextDigests,
  };
}

/**
 * Accepts one logical message as one atomic, all-or-nothing fanout inside the caller's
 * transaction. See the module doc comment for the revocation-race and dedup rules this enforces.
 * The caller (`e2ee-conversation.service.ts`) owns the transaction boundary and any
 * conversation-existence/membership/security-mode checks that must happen before this is called.
 */
export async function acceptE2eeLogicalMessage(
  manager: EntityManager,
  input: AcceptLogicalMessageInput,
): Promise<AcceptedLogicalMessage> {
  if (input.message === undefined) throw AppError.validation('A logical message is required.');
  if (input.clientRequestId.length === 0) {
    throw AppError.validation('A client request id is required.');
  }
  if (input.senderDeviceId.length === 0) {
    throw AppError.validation('A sender device id is required.');
  }

  // ADR 0020 §12.7 is a ship gate, not merely a capability-advertisement gate. Enforce it
  // at the shared accept core before dedup lookup or any database write so create, send, and
  // replay all remain closed even if a node operator configures signing keys prematurely.
  try {
    input.approvalPolicy.assertProfileApproved(input.message.frankingProfile);
  } catch (error) {
    wrapFanoutError(error);
  }

  const existing = await manager.getRepository(E2eeLogicalMessageEntity).findOne({
    where: { senderActorId: input.senderActorId, clientRequestId: input.clientRequestId },
  });
  if (existing !== null) {
    if (existing.conversationId !== input.conversationId) {
      throw AppError.validation(
        'This client_request_id was already used for a different conversation.',
      );
    }
    return replayFromStoredMessage(manager, existing);
  }

  const memberActorIds = await lockActiveMemberActorIds(manager, input.conversationId);
  if (!memberActorIds.includes(input.senderActorId)) {
    throw new AppError(
      'E2EE_CONVERSATION_NOT_FOUND',
      'No E2EE conversation with this id has you as an active member.',
    );
  }

  const deviceRows = await lockMemberDeviceRows(manager, memberActorIds);
  const now = new Date();
  const activeDevices = deviceRows.filter((device) => isActiveDevice(device, now));

  // Loaded after the member and device locks, so the epoch this accept enforces can never
  // be older than the membership snapshot the expected device set was computed from (see
  // `lockActiveMemberActorIds`).
  const { epoch: currentEpoch } = await loadCurrentGroupControl(manager, input.conversationId);

  const senderDevice = activeDevices.find(
    (device) => device.actorId === input.senderActorId && device.deviceId === input.senderDeviceId,
  );
  if (senderDevice === undefined) {
    throw new AppError(
      'E2EE_DEVICE_NOT_FOUND',
      'The sending device is not an active certified device of this actor.',
    );
  }

  try {
    assertGroupFanoutBounds(memberActorIds.length, activeDevices.length);
  } catch (error) {
    wrapFanoutError(error);
  }

  // "Every active device of every current member ... including the sender's own other devices"
  // (ADR 0020 §7) — every active device except the one literal device doing the sending, which
  // already holds the plaintext it composed and never mails itself a copy.
  const expectedTargets: readonly E2eeFanoutTarget[] = sortFanoutTargets(
    activeDevices
      .filter((device) => device.id !== senderDevice.id)
      .map((device) => ({ actorId: device.actorId, deviceId: device.deviceId })),
  );

  let claimedEpoch: bigint;
  try {
    claimedEpoch = BigInt(input.message.membershipEpoch);
  } catch (error) {
    throw AppError.validation('membership_epoch is not a valid integer.', { cause: error });
  }
  try {
    assertMembershipEpochCurrent(claimedEpoch, currentEpoch);
  } catch (error) {
    wrapFanoutError(error);
  }

  if (input.message.frankingProfile !== E2EE_FRANKING_PROFILE_V1) {
    throw new AppError(
      'E2EE_FANOUT_REJECTED',
      `Unknown franking profile "${input.message.frankingProfile}".`,
    );
  }
  if (toBytes(input.message.frankingCommitment).length !== E2EE_DIGEST_BYTES) {
    throw new AppError(
      'E2EE_FANOUT_REJECTED',
      `Franking commitment must be ${String(E2EE_DIGEST_BYTES)} bytes.`,
    );
  }

  const view: E2eeLogicalMessageView = {
    membershipEpoch: currentEpoch,
    frankingCommitment: toBytes(input.message.frankingCommitment),
    frankingProfile: input.message.frankingProfile,
    fanoutDigest: toBytes(input.message.fanoutDigest),
    deviceEnvelopes: input.message.deviceEnvelopes.map(toDeviceEnvelopeView),
  };

  try {
    assertFanoutCovers(view, expectedTargets);
    assertFanoutDigest(view, { digest: e2eeDigest });
    // ADR 0024 B-053: reject a send whose declared `ciphertextDigest` does not match the
    // `ciphertext` bytes in the same envelope, rather than trusting the sender's assertion.
    assertCiphertextDigestsMatchCiphertexts(view, { digest: e2eeDigest });
  } catch (error) {
    wrapFanoutError(error);
  }

  const era = input.keys.currentEra();
  const frankingKey = era === undefined ? undefined : input.keys.keyForEra(era);
  if (era === undefined || frankingKey === undefined) {
    throw new AppError(
      'E2EE_FRANKING_UNAVAILABLE',
      'This node has no franking key configured to sign an acceptance receipt.',
    );
  }

  const deviceIdentityIdByTarget = new Map(
    activeDevices.map((d) => [targetKey(d.actorId, d.deviceId), d.id]),
  );

  // Canonical order (same sort `canonicalFanoutTranscript` uses internally) so the ciphertext
  // digests fed into the node's report-tag transcript, the mailbox rows inserted below, and any
  // later re-derivation of the same transcript (`report-evidence.ts#attachReportEvidence`) are
  // all built from one deterministic ordering rather than depending on database read order.
  const sortedEnvelopes = [...view.deviceEnvelopes].sort((a, b) =>
    a.recipientActorId === b.recipientActorId
      ? a.recipientDeviceId < b.recipientDeviceId
        ? -1
        : 1
      : a.recipientActorId < b.recipientActorId
        ? -1
        : 1,
  );

  // ADR 0025: the envelope AD binds the *sender's* pre-send logical id, so the stored
  // id must be exactly what the sender bound — a node-minted surrogate would make every
  // recipient-side open fail authentication. Honor the client-supplied id when present
  // (validated UUID); mint only for legacy callers that omitted it.
  const clientSuppliedId = input.message.logicalMessageId ?? '';
  const logicalMessageId =
    clientSuppliedId.length > 0 ? parseInput(uuidInputSchema, clientSuppliedId) : randomUUID();
  const acceptedAt = now;
  const transcript = reportTranscriptFor(
    {
      id: logicalMessageId,
      conversationId: input.conversationId,
      epoch: currentEpoch.toString(),
      senderActorId: input.senderActorId,
      senderDeviceId: input.senderDeviceId,
      fanoutDigest: Buffer.from(view.fanoutDigest),
      acceptedAt,
      frankingCommitment: Buffer.from(view.frankingCommitment),
      frankingProfile: view.frankingProfile,
      frankingKeyEra: era,
    },
    sortedEnvelopes.map((envelope) => envelope.ciphertextDigest),
  );
  const encodedTranscript = encodeReportTranscript(transcript);
  const tag = createNodeReportTag(frankingKey, transcript);
  const transcriptDigest = e2eeDigest(encodedTranscript);

  try {
    await manager.getRepository(E2eeLogicalMessageEntity).insert({
      id: logicalMessageId,
      conversationId: input.conversationId,
      epoch: currentEpoch.toString(),
      senderActorId: input.senderActorId,
      senderDeviceId: input.senderDeviceId,
      clientRequestId: input.clientRequestId,
      fanoutDigest: Buffer.from(view.fanoutDigest),
      frankingCommitment: Buffer.from(view.frankingCommitment),
      frankingProfile: view.frankingProfile,
      frankingKeyEra: era,
      frankingTag: Buffer.from(tag),
      acceptedAt,
      deletedAt: null,
    });
  } catch (error) {
    // Unique (sender_actor_id, client_request_id) — a concurrent duplicate send raced us to the
    // insert. The other transaction is authoritative; replay its result rather than erroring.
    const raced = await manager.getRepository(E2eeLogicalMessageEntity).findOne({
      where: { senderActorId: input.senderActorId, clientRequestId: input.clientRequestId },
    });
    if (raced === null) throw error;
    if (raced.conversationId !== input.conversationId) {
      throw AppError.validation(
        'This client_request_id was already used for a different conversation.',
      );
    }
    return replayFromStoredMessage(manager, raced);
  }

  await manager.getRepository(E2eeMailboxEnvelopeEntity).insert(
    sortedEnvelopes.map((envelope) => {
      const deviceIdentityId = deviceIdentityIdByTarget.get(
        targetKey(envelope.recipientActorId, envelope.recipientDeviceId),
      );
      if (deviceIdentityId === undefined) {
        // Unreachable: every envelope's target passed `assertFanoutCovers` against
        // `expectedTargets`, which was built from exactly the keys in this map.
        throw AppError.internal('Fanout target resolved to no locked device row.');
      }
      return {
        logicalMessageId,
        recipientDeviceIdentityId: deviceIdentityId,
        encryptedHeader: Buffer.from(envelope.encryptedHeader),
        ciphertext: Buffer.from(envelope.ciphertext),
        openingCiphertext: Buffer.from(envelope.openingCiphertext),
        ciphertextDigest: Buffer.from(envelope.ciphertextDigest),
      };
    }),
  );

  await manager
    .getRepository(ConversationEntity)
    .update({ id: input.conversationId }, { lastMessageAt: acceptedAt });

  return {
    logicalMessageId,
    acceptedAt,
    fanoutDigest: view.fanoutDigest,
    frankingTag: {
      profile: view.frankingProfile,
      keyEra: era,
      tag: Buffer.from(tag),
      transcriptDigest: Buffer.from(transcriptDigest),
    },
    acceptedRecipientDeviceIds: sortedEnvelopes.map((envelope) => envelope.recipientDeviceId),
    replay: false,
  };
}
