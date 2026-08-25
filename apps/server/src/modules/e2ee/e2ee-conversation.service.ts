import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor as ActorEntity,
  Block as BlockEntity,
  Conversation as ConversationEntity,
  ConversationMember as ConversationMemberEntity,
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeIdentityRoot as E2eeIdentityRootEntity,
  E2eeLogicalMessage as E2eeLogicalMessageEntity,
  E2eeMailboxEnvelope as E2eeMailboxEnvelopeEntity,
  type ConversationKind as DbConversationKind,
} from '@patches/database';
import { E2EE_GROUP_MAX_MEMBERS, E2EE_PROTOCOL_V1 } from '@patches/domain';
import { dateToTimestamp } from '@patches/proto';
import {
  ConversationSecurityMode,
  type AcknowledgeEnvelopesRequest,
  type AcknowledgeEnvelopesResponse,
  type CreateE2eeConversationRequest,
  type CreateE2eeConversationResponse,
  type E2eeConversationMemberState,
  type E2eeMailboxEnvelope as E2eeMailboxEnvelopeProto,
  type GetE2eeConversationStateRequest,
  type GetE2eeConversationStateResponse,
  type ListMailboxEnvelopesRequest,
  type ListMailboxEnvelopesResponse,
  type SendEnvelopesRequest,
  type SendEnvelopesResponse,
} from '@patches/proto/nest';
import { DataSource, In, IsNull, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { mayMessageDirectly } from '../messages/direct-message-eligibility.js';
import { NotificationsService } from '../notifications/notification.service.js';
import {
  acceptE2eeLogicalMessage,
  transcriptDigestForStoredMessage,
  type AcceptedLogicalMessage,
} from './e2ee-fanout.js';
import { decodeCertificateTranscript } from './e2ee.codec.js';
import { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import { loadCurrentGroupControl } from './group-control.js';
import { NODE_FRANKING_KEY_RING } from './node-franking-key-ring.js';
import {
  E2EE_RUNTIME_APPROVAL_POLICY,
  type E2eeRuntimeApprovalPolicy,
} from './e2ee-runtime-approval-policy.js';
import { type NodeFrankingKeyRing } from './report-evidence.js';
import { loadCurrentRosterRow } from './roster-chain.js';

/**
 * `E2eeService`'s conversation/fanout/mailbox RPCs (ADR 0020 §7–§8, P13-007):
 * `CreateE2eeConversation`, `GetE2eeConversationState`, `SendEnvelopes`,
 * `ListMailboxEnvelopes`, `AcknowledgeEnvelopes`. The actual fanout-accept logic — the
 * revocation-race-safe, dedup-safe, atomic-and-exact part — lives in `e2ee-fanout.ts`; this
 * class owns the transaction boundary, request validation, membership/authorization, and proto
 * mapping, the same split `device-roster.service.ts`/`roster-chain.ts` use.
 */
@Injectable()
export class E2eeConversationService {
  readonly #keys: NodeFrankingKeyRing;
  /** Only ever receives ids — never message content, ciphertext, or franking material (§183.1). */
  readonly #logger = new Logger(E2eeConversationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    // See `E2eeReportEvidenceService`'s identical `@Inject(NODE_FRANKING_KEY_RING)` comment:
    // `NodeFrankingKeyRing` is an interface, so a bare, undecorated parameter would make Nest
    // try to resolve it as a provider token and fail to boot.
    @Inject(NODE_FRANKING_KEY_RING) keys: NodeFrankingKeyRing,
    @Inject(E2EE_RUNTIME_APPROVAL_POLICY)
    private readonly approvalPolicy: E2eeRuntimeApprovalPolicy,
    private readonly rateLimits: E2eeRateLimitService,
    // Concrete class, not an interface: `design:paramtypes` has to carry a real token Nest can
    // resolve, so this parameter must never be widened to an interface without `@Inject`.
    private readonly notifications: NotificationsService,
  ) {
    this.#keys = keys;
  }

  async createE2eeConversation(
    actorId: string,
    request: CreateE2eeConversationRequest,
    peer: string | undefined = undefined,
  ): Promise<CreateE2eeConversationResponse> {
    if (request.clientRequestId.length === 0) {
      throw AppError.validation('client_request_id is required.');
    }
    const recipientIds = Array.from(new Set(request.recipientActorIds));
    if (recipientIds.length !== request.recipientActorIds.length) {
      throw AppError.validation('recipient_actor_ids must not contain duplicates.');
    }
    if (recipientIds.includes(actorId)) {
      throw AppError.validation('recipient_actor_ids must not include yourself.');
    }
    if (recipientIds.length === 0 || recipientIds.length + 1 > E2EE_GROUP_MAX_MEMBERS) {
      throw AppError.validation(
        `An E2EE conversation may have at most ${String(E2EE_GROUP_MAX_MEMBERS)} members including you.`,
      );
    }

    // Idempotent replay before touching anything else, matching `MessagesService.createConversation`'s
    // own "same client_request_id, same result" contract (spec §45) — a retry must not create a
    // second conversation. Delegating straight to `acceptE2eeLogicalMessage` (rather than
    // hand-building the response here) reuses its exact dedup/replay reconstruction, including
    // `transcript_digest`, instead of a second implementation that has to agree with it.
    const existing = await this.dataSource.getRepository(E2eeLogicalMessageEntity).findOne({
      where: { senderActorId: actorId, clientRequestId: request.clientRequestId },
    });
    if (existing !== null) {
      return this.dataSource.transaction(async (manager) => {
        const accepted = await acceptE2eeLogicalMessage(manager, {
          conversationId: existing.conversationId,
          senderActorId: actorId,
          senderDeviceId: request.senderDeviceId,
          clientRequestId: request.clientRequestId,
          message: request.message,
          keys: this.#keys,
          approvalPolicy: this.approvalPolicy,
        });
        return this.#toCreateResponse(existing.conversationId, accepted);
      });
    }

    // Dedup replay first, budgets second, transaction last — a retried send never burns
    // budget twice.
    await this.rateLimits.consumeConversationCreate(actorId, peer);

    const created = await this.dataSource.transaction(async (manager) => {
      const kind: DbConversationKind = recipientIds.length === 1 ? 'DIRECT' : 'GROUP';

      const recipients = await manager
        .getRepository(ActorEntity)
        .find({ where: { id: In(recipientIds) } });
      if (
        recipients.length !== recipientIds.length ||
        recipients.some((actor) => actor.deletedAt !== null || !actor.isLocal)
      ) {
        throw actorNotFound();
      }

      const allIds = [actorId, ...recipientIds];
      for (let i = 0; i < allIds.length; i += 1) {
        for (let j = i + 1; j < allIds.length; j += 1) {
          if (await blockedEitherDirection(manager, allIds[i]!, allIds[j]!)) throw actorNotFound();
        }
      }

      // First-contact eligibility, identical to the legacy DM paths' `mayMessageDirectly`
      // semantics (spec §183.2; audit P1 — blocks alone let an ineligible stranger demand
      // first contact here). Uniform `actorNotFound()` keeps it indistinguishable from any
      // other unavailable recipient (spec §62).
      for (const recipientId of recipientIds) {
        if (!(await mayMessageDirectly(manager, actorId, recipientId))) throw actorNotFound();
      }

      const conversation = await manager.getRepository(ConversationEntity).save(
        manager.getRepository(ConversationEntity).create({
          kind,
          securityMode: 'E2EE_V1',
          createdByActorId: actorId,
          lastMessageAt: new Date(),
        }),
      );
      await manager
        .getRepository(ConversationMemberEntity)
        .insert(allIds.map((memberId) => ({ conversationId: conversation.id, actorId: memberId })));

      const accepted = await acceptE2eeLogicalMessage(manager, {
        conversationId: conversation.id,
        senderActorId: actorId,
        senderDeviceId: request.senderDeviceId,
        clientRequestId: request.clientRequestId,
        message: request.message,
        keys: this.#keys,
        approvalPolicy: this.approvalPolicy,
      });

      return { response: this.#toCreateResponse(conversation.id, accepted), accepted };
    });

    // Content-free MESSAGE notification (spec §187, ADR 0030 §B-095) — recipientIds is
    // already the exact "every other member" set for a brand-new conversation, so no
    // extra membership query is needed the way `sendEnvelopes` (an existing conversation)
    // requires below.
    if (!created.accepted.replay) {
      await this.#notifyRecipients(recipientIds, actorId, created.response.conversationId);
    }

    return created.response;
  }

  /**
   * The `MESSAGE` notification, re-pointed at E2EE arrivals (ADR 0030 §"Application 1", point 3).
   *
   * Deliberately content-free, and structurally incapable of carrying content: the only inputs
   * are actor ids and a conversation id — all node-side routing metadata the node already holds
   * in `e2ee_logical_messages`. It never sees plaintext (ADR 0020: it does not exist server-side)
   * and never touches the ciphertext or the franking material either, so there is nothing here
   * for a §183.1 leak to travel through. `Notification` itself has no body/preview column and the
   * proto message has no such field, so this stays true at the wire boundary too.
   *
   * Runs after the fanout transaction commits, never inside it: an accepted, franked message must
   * not be rolled back because a notification insert lost a race, and `NotificationsService` reads
   * blocks/mutes on its own connection anyway. For the same reason a failure here is logged and
   * swallowed rather than surfaced — the message *was* accepted, and reporting failure would make
   * the client retry a send that already succeeded.
   */
  async #notifyRecipients(
    recipientActorIds: readonly string[],
    senderActorId: string,
    conversationId: string,
  ): Promise<void> {
    for (const recipientActorId of recipientActorIds) {
      try {
        await this.notifications.notifyMessage(recipientActorId, senderActorId, conversationId);
      } catch (error) {
        this.#logger.warn(
          `Failed to write MESSAGE notification for conversation ${conversationId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }

  /** Every other still-active member of an existing conversation — the notification audience for
   * `sendEnvelopes`, where (unlike conversation creation) the recipient set is not in the request.
   * Membership only; no device or envelope data is read, so no ciphertext is in reach. */
  async #activeCoMemberIds(conversationId: string, senderActorId: string): Promise<string[]> {
    const members = await this.dataSource
      .getRepository(ConversationMemberEntity)
      .find({ where: { conversationId, leftAt: IsNull() } });
    return members
      .filter((member) => member.actorId !== senderActorId)
      .map((member) => member.actorId);
  }

  #toCreateResponse(
    conversationId: string,
    accepted: AcceptedLogicalMessage,
  ): CreateE2eeConversationResponse {
    return {
      conversationId,
      securityMode: ConversationSecurityMode.CONVERSATION_SECURITY_MODE_E2EE_V1,
      logicalMessageId: accepted.logicalMessageId,
      acceptedAt: dateToTimestamp(accepted.acceptedAt),
      frankingTag: accepted.frankingTag,
    };
  }

  async getE2eeConversationState(
    actorId: string,
    request: GetE2eeConversationStateRequest,
  ): Promise<GetE2eeConversationStateResponse> {
    if (request.conversationId.length === 0) {
      throw AppError.validation('conversation_id is required.');
    }
    const conversation = await this.dataSource
      .getRepository(ConversationEntity)
      .findOne({ where: { id: request.conversationId } });
    const membership =
      conversation === null
        ? null
        : await this.dataSource.getRepository(ConversationMemberEntity).findOne({
            where: { conversationId: request.conversationId, actorId, leftAt: IsNull() },
          });
    if (conversation === null || conversation.securityMode !== 'E2EE_V1' || membership === null) {
      throw new AppError(
        'E2EE_CONVERSATION_NOT_FOUND',
        'No E2EE conversation with this id has you as an active member.',
      );
    }

    const members = await this.dataSource
      .getRepository(ConversationMemberEntity)
      .find({ where: { conversationId: request.conversationId, leftAt: IsNull() } });
    const now = new Date();
    const memberStates = await Promise.all(
      members.map((member) => this.#loadMemberState(member.actorId, now)),
    );
    const { epoch, digest } = await loadCurrentGroupControl(
      this.dataSource.manager,
      request.conversationId,
    );

    return {
      conversationId: conversation.id,
      securityMode: ConversationSecurityMode.CONVERSATION_SECURITY_MODE_E2EE_V1,
      membershipEpoch: epoch.toString(),
      groupControlDigest: Buffer.from(digest),
      members: memberStates,
    };
  }

  async #loadMemberState(actorId: string, now: Date): Promise<E2eeConversationMemberState> {
    const root = await this.dataSource
      .getRepository(E2eeIdentityRootEntity)
      .findOne({ where: { actorId, rotatedAt: IsNull() } });
    const rosterRow = await loadCurrentRosterRow(this.dataSource.manager, actorId);
    const devices = await this.dataSource
      .getRepository(E2eeDeviceIdentityEntity)
      .find({ where: { actorId, revokedAt: IsNull() } });
    const activeDevices = devices.filter((device) => device.expiresAt.getTime() > now.getTime());
    const supportsE2eeV1 =
      activeDevices.length > 0 &&
      activeDevices.every((device) =>
        decodeCertificateTranscript(device.certificateBytes).supportedProtocolVersions.includes(
          E2EE_PROTOCOL_V1,
        ),
      );

    return {
      actorId,
      rootGeneration: root?.generation ?? 0,
      rootPublicKey: root?.publicKey ?? Buffer.alloc(0),
      rosterSequence: rosterRow?.sequence ?? '0',
      rosterDigest: rosterRow?.digest ?? Buffer.alloc(0),
      activeDeviceIds: activeDevices.map((device) => device.deviceId),
      supportsE2eeV1,
    };
  }

  async sendEnvelopes(
    actorId: string,
    request: SendEnvelopesRequest,
    peer: string | undefined = undefined,
  ): Promise<SendEnvelopesResponse> {
    if (request.conversationId.length === 0) {
      throw AppError.validation('conversation_id is required.');
    }

    // Before the transaction, matching `MessagesService.sendMessage`'s ordering (§188): a
    // rejected send must not have held row locks, and a budgeted-out caller learns that
    // without the fanout machinery running.
    await this.rateLimits.consumeEnvelopeSend(actorId, peer);

    const accepted = await this.dataSource.transaction(async (manager) => {
      const conversation = await manager
        .getRepository(ConversationEntity)
        .findOne({ where: { id: request.conversationId } });
      if (conversation === null || conversation.securityMode !== 'E2EE_V1') {
        throw new AppError('E2EE_CONVERSATION_NOT_FOUND', 'No such E2EE conversation.');
      }

      return acceptE2eeLogicalMessage(manager, {
        conversationId: request.conversationId,
        senderActorId: actorId,
        senderDeviceId: request.senderDeviceId,
        clientRequestId: request.clientRequestId,
        message: request.message,
        keys: this.#keys,
        approvalPolicy: this.approvalPolicy,
      });
    });

    // Content-free MESSAGE notification for the arrival (see `#notifyRecipients`). Skipped on a
    // dedup replay: the same logical message must not notify twice.
    if (!accepted.replay) {
      await this.#notifyRecipients(
        await this.#activeCoMemberIds(request.conversationId, actorId),
        actorId,
        request.conversationId,
      );
    }

    return {
      logicalMessageId: accepted.logicalMessageId,
      acceptedAt: dateToTimestamp(accepted.acceptedAt),
      frankingTag: accepted.frankingTag,
      fanoutDigest: Buffer.from(accepted.fanoutDigest),
      acceptedRecipientDeviceIds: [...accepted.acceptedRecipientDeviceIds],
    };
  }

  async listMailboxEnvelopes(
    actorId: string,
    request: ListMailboxEnvelopesRequest,
  ): Promise<ListMailboxEnvelopesResponse> {
    if (request.deviceId.length === 0) throw AppError.validation('device_id is required.');
    // Not gated on `revokedAt IS NULL`, deliberately, same as `acknowledgeEnvelopes` below: a
    // device revoked after mail already arrived for it must still be able to read (and then
    // acknowledge) what it durably received before revocation stopped *future* delivery
    // (ADR 0020 §10) — this is what lets it finish converging rather than losing history.
    const device = await this.dataSource.getRepository(E2eeDeviceIdentityEntity).findOne({
      where: { actorId, deviceId: request.deviceId },
    });
    if (device === null) {
      throw new AppError('E2EE_DEVICE_NOT_FOUND', 'No device with this id belongs to this actor.');
    }

    const cursor = decodeCursor(request.cursor);
    const take = clampLimit(request.limit);
    const qb = this.dataSource
      .getRepository(E2eeMailboxEnvelopeEntity)
      .createQueryBuilder('envelope')
      .innerJoinAndSelect('envelope.logicalMessage', 'message')
      .where('envelope.recipientDeviceIdentityId = :deviceId', { deviceId: device.id })
      .andWhere('envelope.acknowledgedAt IS NULL')
      .andWhere('envelope.deletedAt IS NULL')
      .orderBy('envelope.receivedAt', 'ASC')
      .addOrderBy('envelope.id', 'ASC')
      .take(take + 1);
    if (cursor !== undefined) {
      qb.andWhere('("envelope"."received_at", "envelope"."id") > (:receivedAt, :id)', {
        receivedAt: cursor.createdAt,
        id: cursor.id,
      });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const envelopes = await Promise.all(
      page.map(async (envelope): Promise<E2eeMailboxEnvelopeProto> => {
        // `transcript_digest` is never a persisted column (see the function's own doc comment);
        // recomputed per envelope from this device's own logical message row.
        const { digest } = await transcriptDigestForStoredMessage(
          this.dataSource.manager,
          envelope.logicalMessage,
        );
        return {
          envelopeId: envelope.id,
          logicalMessageId: envelope.logicalMessageId,
          conversationId: envelope.logicalMessage.conversationId,
          membershipEpoch: envelope.logicalMessage.epoch,
          senderActorId: envelope.logicalMessage.senderActorId,
          senderDeviceId: envelope.logicalMessage.senderDeviceId,
          recipientDeviceId: request.deviceId,
          encryptedHeader: envelope.encryptedHeader,
          ciphertext: envelope.ciphertext,
          openingCiphertext: envelope.openingCiphertext,
          ciphertextDigest: envelope.ciphertextDigest,
          frankingCommitment: envelope.logicalMessage.frankingCommitment,
          frankingTag: {
            profile: envelope.logicalMessage.frankingProfile,
            keyEra: envelope.logicalMessage.frankingKeyEra,
            tag: envelope.logicalMessage.frankingTag,
            transcriptDigest: digest,
          },
          fanoutDigest: envelope.logicalMessage.fanoutDigest,
          acceptedAt: dateToTimestamp(envelope.logicalMessage.acceptedAt),
          receivedAt: dateToTimestamp(envelope.receivedAt),
        };
      }),
    );

    return {
      envelopes,
      page: pageInfoFor(page, hasMore, (row) => ({ createdAt: row.receivedAt, id: row.id })),
    };
  }

  async acknowledgeEnvelopes(
    actorId: string,
    request: AcknowledgeEnvelopesRequest,
  ): Promise<AcknowledgeEnvelopesResponse> {
    if (request.deviceId.length === 0) throw AppError.validation('device_id is required.');
    if (request.envelopeIds.length === 0) return { acknowledgedCount: 0 };

    const device = await this.dataSource.getRepository(E2eeDeviceIdentityEntity).findOne({
      where: { actorId, deviceId: request.deviceId },
    });
    // Not gated on `revokedAt IS NULL`, deliberately: a device that was revoked after receiving
    // mail must still be able to acknowledge what it already durably committed (ADR 0020 §4) —
    // revocation stops *future* delivery, it is not a remote wipe of what already arrived.
    if (device === null) {
      throw new AppError('E2EE_DEVICE_NOT_FOUND', 'No device with this id belongs to this actor.');
    }

    const uniqueIds = [...new Set(request.envelopeIds)];
    const result = await this.dataSource
      .getRepository(E2eeMailboxEnvelopeEntity)
      .update(
        { id: In(uniqueIds), recipientDeviceIdentityId: device.id, acknowledgedAt: IsNull() },
        { acknowledgedAt: new Date() },
      );

    return { acknowledgedCount: result.affected ?? 0 };
  }
}

function actorNotFound(): AppError {
  // Same generic-failure/no-block-oracle reasoning `MessagesService`'s own `actorNotFound()`
  // documents: a caller must not be able to tell "blocked" from "doesn't exist" apart (spec §62).
  return new AppError(
    'E2EE_CONVERSATION_NOT_FOUND',
    'One or more recipients are unavailable for an E2EE conversation.',
  );
}

async function blockedEitherDirection(
  manager: EntityManager,
  first: string,
  second: string,
): Promise<boolean> {
  const block = await manager.getRepository(BlockEntity).findOne({
    where: [
      { blockerActorId: first, blockedActorId: second },
      { blockerActorId: second, blockedActorId: first },
    ],
  });
  return block !== null;
}
