import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor as ActorEntity,
  Block as BlockEntity,
  Conversation as ConversationEntity,
  ConversationMember as ConversationMemberEntity,
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeIdentityRoot as E2eeIdentityRootEntity,
  E2eeMailboxEnvelope as E2eeMailboxEnvelopeEntity,
  type ConversationKind as DbConversationKind,
} from '@patches/database';
import { E2EE_GROUP_MAX_MEMBERS, E2EE_PROTOCOL_V1 } from '@patches/domain';
import { e2eeEnvelopeListAgeSeconds } from '@patches/observability/metrics';
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
import { acceptE2eeLogicalMessage, transcriptDigestsForStoredMessages } from './e2ee-fanout.js';
import { decodeCertificateTranscript } from './e2ee.codec.js';
import { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import { loadCurrentGroupControl } from './group-control.js';
import { NODE_FRANKING_KEY_RING } from './node-franking-key-ring.js';
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
    private readonly rateLimits: E2eeRateLimitService,
    // Concrete class, not an interface: `design:paramtypes` has to carry a real token Nest can
    // resolve, so this parameter must never be widened to an interface without `@Inject`.
    private readonly notifications: NotificationsService,
  ) {
    this.#keys = keys;
  }

  // ADR 0035: `CreateE2eeConversation` reserves a conversation — it establishes membership and
  // returns the id, and carries no message. The former one-shot form asked a client to seal an
  // initial envelope for a conversation id it could not yet know, which no honest client could
  // do; the first message is now an ordinary `sendEnvelopes` into the id this method returns.
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
    if (request.senderDeviceId.length === 0) {
      throw AppError.validation('sender_device_id is required.');
    }

    // Replay before touching budget or authorization (ADR 0035 §4, spec §45) — a retry must not
    // create a second conversation or burn budget twice. `client_request_id` is scoped to the
    // creator, independent of `e2ee_logical_messages`' own replay anchor: a reservation writes
    // no logical message, so that anchor never covers it.
    const replayed = await this.dataSource.getRepository(ConversationEntity).findOne({
      where: { createdByActorId: actorId, creationClientRequestId: request.clientRequestId },
    });
    if (replayed !== null) return this.#toReservationResponse(replayed);

    await this.rateLimits.consumeConversationCreate(actorId, peer);

    return this.dataSource.transaction(async (manager) => {
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

      // The sender-device check ADR 0035 moves up: it used to run inside
      // `acceptE2eeLogicalMessage`, which no longer runs for a reservation. This is the
      // caller's own device, so it is not an oracle about anyone else.
      const senderDevice = await manager.getRepository(E2eeDeviceIdentityEntity).findOne({
        where: { actorId, deviceId: request.senderDeviceId },
      });
      const now = new Date();
      if (
        senderDevice === null ||
        senderDevice.revokedAt !== null ||
        senderDevice.expiresAt.getTime() <= now.getTime()
      ) {
        throw new AppError(
          'E2EE_DEVICE_NOT_FOUND',
          'The sending device is not an active certified device of this actor.',
        );
      }

      let conversation: ConversationEntity;
      try {
        conversation = await manager.getRepository(ConversationEntity).save(
          manager.getRepository(ConversationEntity).create({
            kind,
            securityMode: 'E2EE_V1',
            createdByActorId: actorId,
            // Reserved, unmessaged conversations are invisible to every actor, including their
            // creator, until `acceptE2eeLogicalMessage` sets this on the first accepted message
            // (ADR 0035 §5 — an early-visible empty conversation is a coarse typing indicator,
            // which spec §183.3 forbids).
            lastMessageAt: null,
            creationClientRequestId: request.clientRequestId,
          }),
        );
      } catch (error) {
        // `uq_conversations_creator_client_request_id` — a concurrent duplicate reservation
        // raced us to the insert. The other transaction is authoritative; replay its result
        // rather than erroring (ADR 0035 §4, same shape `acceptE2eeLogicalMessage` uses for its
        // own raced insert).
        const raced = await manager.getRepository(ConversationEntity).findOne({
          where: { createdByActorId: actorId, creationClientRequestId: request.clientRequestId },
        });
        if (raced === null) throw error;
        return this.#toReservationResponse(raced);
      }

      await manager
        .getRepository(ConversationMemberEntity)
        .insert(allIds.map((memberId) => ({ conversationId: conversation.id, actorId: memberId })));

      // Nothing else. No `e2ee_logical_messages` row, no `e2ee_mailbox_envelopes` rows, no
      // `e2ee_group_control_events` row, and — because `#notifyRecipients` is called only on a
      // non-replay accepted message, which this is not — no notification. A reservation is
      // silent by construction, not by a flag someone can flip (ADR 0035 §3.5).
      return this.#toReservationResponse(conversation);
    });
  }

  #toReservationResponse(conversation: ConversationEntity): CreateE2eeConversationResponse {
    return {
      conversationId: conversation.id,
      securityMode: ConversationSecurityMode.CONVERSATION_SECURITY_MODE_E2EE_V1,
    };
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

    // ADR 0032 commits every open TUI thread to a 5 s poll of this exact RPC; budgeted before
    // any query runs (same ordering `sendEnvelopes` above uses) so a caller that ignores the
    // cadence learns that without the mailbox query and per-message digest work running first.
    await this.rateLimits.consumeMailboxPoll(actorId);

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
    // #152: filter to one conversation server-side so an open thread's 5 s poll stops
    // walking (and re-fetching, forever) every other conversation's queued mail just to
    // discard it client-side.
    // proto3 `optional` scalars can arrive as either `undefined` or `null` depending on the
    // decoder (`@grpc/proto-loader` vs ts-proto's own type) — check both rather than trusting
    // the TS type alone.
    if (
      request.conversationId !== undefined &&
      (request.conversationId as string | null) !== null &&
      request.conversationId.length > 0
    ) {
      qb.andWhere('message.conversationId = :conversationId', {
        conversationId: request.conversationId,
      });
    }
    if (cursor !== undefined) {
      qb.andWhere('("envelope"."received_at", "envelope"."id") > (:receivedAt, :id)', {
        receivedAt: cursor.createdAt,
        id: cursor.id,
      });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    // `transcript_digest` is never a persisted column (see `transcriptDigestsForStoredMessages`'s
    // own doc comment); one query for every distinct logical message on this page rather than
    // one query per envelope (P19-019 part 2 — the previous per-envelope loop was an N+1: up to
    // `limit` round trips per poll, every ~5 s, per device).
    const digestsByMessageId = await transcriptDigestsForStoredMessages(
      this.dataSource.manager,
      page.map((envelope) => envelope.logicalMessage),
    );

    const envelopes = page.map((envelope): E2eeMailboxEnvelopeProto => {
      const forThisMessage = digestsByMessageId.get(envelope.logicalMessageId);
      if (forThisMessage === undefined) {
        // Unreachable: every envelope on this page contributed its own `logicalMessage` to the
        // batch above, so its id is always a key in the returned map.
        throw AppError.internal('No transcript digest computed for a listed envelope.');
      }
      const { digest } = forThisMessage;
      // ADR 0032 T1 instrument (`e2eeEnvelopeListAgeSeconds`'s own doc comment has the full
      // "why this and not exact first-delivery latency" reasoning): a duration value only,
      // no envelope/conversation/actor/device id ever reaches this metric.
      e2eeEnvelopeListAgeSeconds.observe((Date.now() - envelope.receivedAt.getTime()) / 1000);
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
    });

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
