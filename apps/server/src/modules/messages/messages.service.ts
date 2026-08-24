import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Conversation,
  ConversationMember,
  Message,
  MessageRequest,
  type ConversationKind as DbConversationKind,
} from '@patches/database';
import { DM_GROUP_MAX } from '@patches/domain';
import { DataSource, In, IsNull, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { toActorSummary } from '../auth/auth.dto.js';
import { blockedEitherDirection, mayMessageDirectly } from './direct-message-eligibility.js';
import { applyActorHidePushdown, MAX_FILTER_ROUNDS } from '../feeds/feed.service.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import {
  evaluateCandidate,
  loadEffectiveFilterRules,
  type FilterMatchCandidate,
} from '../filters/filter-matching.js';
import { NotificationsService } from '../notifications/notification.service.js';
import { DmRateLimitService } from './dm-rate-limit.service.js';
import type {
  ConversationView,
  ListPage,
  MessageRequestView,
  MessageView,
} from './messages.dto.js';
import {
  createConversationInputSchema,
  normalizeMessageBody,
  parseInput,
  sendMessageInputSchema,
  uuidInputSchema,
} from './validation.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface SendMessageServiceInput {
  actorId: string;
  peer: string | undefined;
  clientRequestId: string;
  conversationId: string;
  body: string;
}

export interface CreateConversationServiceInput {
  actorId: string;
  peer: string | undefined;
  clientRequestId: string;
  recipientActorIds: string[];
  initialBody: string;
}

export interface CreateConversationResult {
  conversation: ConversationView | null;
  request: MessageRequestView | null;
}

export interface RespondToMessageRequestResult {
  request: MessageRequestView;
  conversation: ConversationView | null;
}

/** Stable, bounded hand-off to `ModerationService.ReportMessage`. Keeping this query here
 * makes message-table access and membership authorization part of the messages boundary. */
export interface MessageReportEvidence {
  messageId: string;
  snapshot: Array<{
    id: string;
    senderActorId: string | null;
    body: string;
    createdAt: string;
  }>;
}

/**
 * The application service behind `patches.v1.DirectMessageService` (spec §183, §188–190,
 * §192). Mutual-or-accepted gating, message requests, block-aware in both directions with no
 * block oracle (§62), database-backed rate limiting per actor and per peer, text-only, never
 * federated (P11-004).
 *
 * Message bodies never appear in logs (spec §194) — nothing here logs a `body`/`initialBody`
 * value; `AppError` messages thrown by this service never interpolate one either.
 */
@Injectable()
export class MessagesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfigService,
    private readonly dmRateLimit: DmRateLimitService,
  ) {}

  async listConversations(
    actorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListPage<ConversationView>> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(ConversationMember)
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.conversation', 'conversation')
      .leftJoinAndSelect('conversation.createdByActor', 'createdByActor')
      .where('member.actorId = :actorId', { actorId })
      .andWhere('member.leftAt IS NULL')
      .orderBy('conversation.lastMessageAt', 'DESC')
      .addOrderBy('conversation.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere(
        '(conversation.lastMessageAt, conversation.id) < (:cursorLastMessageAt, :cursorId)',
        {
          cursorLastMessageAt: cursor.createdAt,
          cursorId: cursor.id,
        },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const items: ConversationView[] = [];
    for (const row of page) {
      // A block hides the conversation from the blocker (spec §183.4) — filtered here, not
      // in SQL, since it needs a per-conversation membership scan; v0 accepts that a page may
      // come back shorter than `limit` when a block hides an entry (documented in this task's
      // report).
      const view = await this.tryBuildConversationView(
        this.dataSource.manager,
        row.conversation,
        actorId,
      );
      if (view !== null) items.push(view);
    }

    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.conversation.lastMessageAt,
      id: row.conversation.id,
    }));
    return { items, nextCursor, hasMore };
  }

  async getConversation(actorId: string, conversationIdRaw: string): Promise<ConversationView> {
    const conversationId = parseInput(uuidInputSchema, conversationIdRaw);
    const conversation = await this.dataSource
      .getRepository(Conversation)
      .findOne({ where: { id: conversationId }, relations: { createdByActor: true } });
    if (conversation === null) throw conversationNotFound();

    const view = await this.tryBuildConversationView(
      this.dataSource.manager,
      conversation,
      actorId,
    );
    if (view === null) throw conversationNotFound();
    return view;
  }

  async listMessages(
    actorId: string,
    conversationIdRaw: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListPage<MessageView>> {
    const conversationId = parseInput(uuidInputSchema, conversationIdRaw);
    await this.requireActiveUnblockedMembership(this.dataSource.manager, conversationId, actorId);

    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Message)
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.senderActor', 'senderActor')
      .where('message.conversationId = :conversationId', { conversationId })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(message.createdAt, message.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const items = page.map((row) => this.toMessageView(row));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { items, nextCursor, hasMore };
  }

  /**
   * Idempotent on `(sender_actor_id, client_request_id)` (spec §45) — same pattern as
   * `PostService.createPost`.
   */
  async sendMessage(input: SendMessageServiceInput): Promise<MessageView> {
    this.requireDmEnabled();
    const parsed = parseInput(sendMessageInputSchema, {
      clientRequestId: input.clientRequestId,
      conversationId: input.conversationId,
      body: input.body,
    });
    const body = normalizeMessageBody(parsed.body);

    const existing = await this.dataSource.getRepository(Message).findOne({
      where: { senderActorId: input.actorId, clientRequestId: parsed.clientRequestId },
      relations: { senderActor: true },
    });
    if (existing !== null) return this.toMessageView(existing);

    await this.dmRateLimit.consumeSend(input.actorId, input.peer);

    const result = await this.dataSource.transaction(async (manager) => {
      await this.requireActiveUnblockedMembership(
        manager,
        parsed.conversationId,
        input.actorId,
        true,
        { legacyPlaintextConversation: true },
      );

      const messages = manager.getRepository(Message);
      const created = messages.create({
        id: randomUUID(),
        conversationId: parsed.conversationId,
        senderActorId: input.actorId,
        body,
        clientRequestId: parsed.clientRequestId,
      });

      let saved: Message;
      try {
        saved = await messages.save(created);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const winner = await messages.findOne({
          where: { senderActorId: input.actorId, clientRequestId: parsed.clientRequestId },
          relations: { senderActor: true },
        });
        if (winner === null) throw error;
        return { view: this.toMessageView(winner), recipientActorIds: [] as string[] };
      }

      await manager
        .getRepository(Conversation)
        .update({ id: parsed.conversationId }, { lastMessageAt: saved.createdAt });

      const members = await manager
        .getRepository(ConversationMember)
        .find({ where: { conversationId: parsed.conversationId } });
      const recipientActorIds = members
        .filter((member) => member.actorId !== input.actorId && member.leftAt === null)
        .map((member) => member.actorId);

      const withSender = await messages.findOneOrFail({
        where: { id: saved.id },
        relations: { senderActor: true },
      });
      return { view: this.toMessageView(withSender), recipientActorIds };
    });

    for (const recipientActorId of result.recipientActorIds) {
      await this.notifications.notifyMessage(
        recipientActorId,
        input.actorId,
        parsed.conversationId,
      );
    }

    return result.view;
  }

  /** Sender-side delete = tombstone (spec §183.3): idempotent, clears `body`, never a hard
   * delete. `MESSAGE_NOT_FOUND` uniformly for a missing id or one the caller didn't send. */
  async deleteMessage(actorId: string, messageIdRaw: string): Promise<MessageView> {
    const messageId = parseInput(uuidInputSchema, messageIdRaw);

    return this.dataSource.transaction(async (manager) => {
      const messages = manager.getRepository(Message);
      const message = await messages.findOne({
        where: { id: messageId },
        relations: { senderActor: true },
      });
      if (message === null || message.senderActorId !== actorId) throw messageNotFound();

      if (message.deletedAt === null) {
        message.body = '';
        message.deletedAt = new Date();
        await messages.save(message);
      }
      return this.toMessageView(message);
    });
  }

  /**
   * Idempotent on `(sender_actor_id, client_request_id)`. A direct recipient the caller could
   * already message (mutual follow, or a request they accepted from the caller, spec §183.2)
   * gets a real `Conversation` + `Message`; otherwise this creates a `MessageRequest` — see
   * `MessageRequest`'s proto doc. A group creator may only add actors it could already message
   * directly, and no two members of a group may have a block relationship (spec §183.3).
   */
  async createConversation(
    input: CreateConversationServiceInput,
  ): Promise<CreateConversationResult> {
    this.requireDmEnabled();
    const parsed = parseInput(createConversationInputSchema, {
      clientRequestId: input.clientRequestId,
      recipientActorIds: input.recipientActorIds,
      initialBody: input.initialBody,
    });
    const initialBody = normalizeMessageBody(parsed.initialBody);

    if (parsed.recipientActorIds.includes(input.actorId)) {
      throw AppError.validation('recipient_actor_ids must not include yourself.');
    }
    const recipientIds = Array.from(new Set(parsed.recipientActorIds));
    if (recipientIds.length !== parsed.recipientActorIds.length) {
      throw AppError.validation('recipient_actor_ids must not contain duplicates.');
    }
    if (recipientIds.length + 1 > DM_GROUP_MAX) {
      throw AppError.validation(
        `A conversation may have at most ${String(DM_GROUP_MAX)} members including you.`,
      );
    }

    const existingMessage = await this.dataSource.getRepository(Message).findOne({
      where: { senderActorId: input.actorId, clientRequestId: parsed.clientRequestId },
    });
    if (existingMessage !== null) {
      const conversation = await this.dataSource.getRepository(Conversation).findOneOrFail({
        where: { id: existingMessage.conversationId },
        relations: { createdByActor: true },
      });
      const view = await this.tryBuildConversationView(
        this.dataSource.manager,
        conversation,
        input.actorId,
      );
      return { conversation: view, request: null };
    }
    const existingRequest = await this.dataSource.getRepository(MessageRequest).findOne({
      where: { senderActorId: input.actorId, clientRequestId: parsed.clientRequestId },
      relations: { senderActor: true, recipientActor: true },
    });
    if (existingRequest !== null) {
      return { conversation: null, request: this.toMessageRequestView(existingRequest) };
    }

    const kind: DbConversationKind = recipientIds.length === 1 ? 'DIRECT' : 'GROUP';

    const outcome = await this.dataSource.transaction(async (manager) => {
      const recipients = await manager
        .getRepository(Actor)
        .find({ where: { id: In(recipientIds) } });
      if (
        recipients.length !== recipientIds.length ||
        recipients.some((actor) => actor.deletedAt !== null || !actor.isLocal)
      ) {
        throw actorNotFound();
      }

      if (kind === 'GROUP') {
        const allIds = [input.actorId, ...recipientIds];
        for (let i = 0; i < allIds.length; i += 1) {
          for (let j = i + 1; j < allIds.length; j += 1) {
            if (await blockedEitherDirection(manager, allIds[i]!, allIds[j]!))
              throw actorNotFound();
          }
        }
        for (const recipientId of recipientIds) {
          if (!(await mayMessageDirectly(manager, input.actorId, recipientId)))
            throw actorNotFound();
        }

        await this.dmRateLimit.consumeSend(input.actorId, input.peer);
        const created = await this.createConversationWithMessage(
          manager,
          input.actorId,
          recipientIds,
          'GROUP',
          parsed.clientRequestId,
          initialBody,
        );
        return {
          conversation: created.view,
          recipientActorIds: created.recipientActorIds,
          requestNotificationRecipientId: null as string | null,
          request: null as MessageRequestView | null,
        };
      }

      const recipientId = recipientIds[0];
      if (recipientId === undefined) throw actorNotFound();
      if (await blockedEitherDirection(manager, input.actorId, recipientId)) throw actorNotFound();

      // A pair has one active direct thread. Reusing it prevents duplicate inbox entries and
      // also lets the actor who accepted a request initiate later messages from their side —
      // membership in the already-open thread is the authorization in that direction.
      const existingDirect = await this.findExistingDirectConversation(
        manager,
        input.actorId,
        recipientId,
      );
      if (existingDirect !== null) {
        await this.dmRateLimit.consumeSend(input.actorId, input.peer);
        const appended = await this.appendMessageToConversation(
          manager,
          existingDirect,
          input.actorId,
          parsed.clientRequestId,
          initialBody,
        );
        return {
          conversation: appended.view,
          recipientActorIds: [recipientId],
          requestNotificationRecipientId: null as string | null,
          request: null as MessageRequestView | null,
        };
      }

      if (await mayMessageDirectly(manager, input.actorId, recipientId)) {
        await this.dmRateLimit.consumeSend(input.actorId, input.peer);
        const created = await this.createConversationWithMessage(
          manager,
          input.actorId,
          [recipientId],
          'DIRECT',
          parsed.clientRequestId,
          initialBody,
        );
        return {
          conversation: created.view,
          recipientActorIds: created.recipientActorIds,
          requestNotificationRecipientId: null as string | null,
          request: null as MessageRequestView | null,
        };
      }

      // Gated (spec §183.2): goes through a `MessageRequest` instead.
      const declineBar = await manager.getRepository(MessageRequest).findOne({
        where: { senderActorId: input.actorId, recipientActorId: recipientId, status: 'DECLINED' },
        order: { createdAt: 'DESC' },
      });
      if (declineBar !== null && Date.now() - declineBar.createdAt.getTime() < THIRTY_DAYS_MS) {
        throw actorNotFound();
      }

      const existingPending = await manager.getRepository(MessageRequest).findOne({
        where: { senderActorId: input.actorId, recipientActorId: recipientId, status: 'PENDING' },
        relations: { senderActor: true, recipientActor: true },
      });
      if (existingPending !== null) {
        return {
          conversation: null as ConversationView | null,
          recipientActorIds: [] as string[],
          requestNotificationRecipientId: null as string | null,
          request: this.toMessageRequestView(existingPending),
        };
      }

      // The carried body is both a DM send and an unsolicited request, so both §188 budgets
      // apply. This prevents the request path from bypassing the general message-send cap.
      await this.dmRateLimit.consumeSend(input.actorId, input.peer);
      await this.dmRateLimit.consumeMessageRequest(input.actorId, input.peer);

      const requests = manager.getRepository(MessageRequest);
      const created = requests.create({
        id: randomUUID(),
        senderActorId: input.actorId,
        recipientActorId: recipientId,
        body: initialBody,
        status: 'PENDING',
        clientRequestId: parsed.clientRequestId,
      });

      let saved: MessageRequest;
      try {
        saved = await requests.save(created);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const winner = await requests.findOne({
          where: { senderActorId: input.actorId, recipientActorId: recipientId, status: 'PENDING' },
          relations: { senderActor: true, recipientActor: true },
        });
        if (winner === null) throw error;
        return {
          conversation: null as ConversationView | null,
          recipientActorIds: [] as string[],
          requestNotificationRecipientId: null as string | null,
          request: this.toMessageRequestView(winner),
        };
      }

      const withRelations = await requests.findOneOrFail({
        where: { id: saved.id },
        relations: { senderActor: true, recipientActor: true },
      });
      return {
        conversation: null as ConversationView | null,
        recipientActorIds: [] as string[],
        requestNotificationRecipientId: recipientId,
        request: this.toMessageRequestView(withRelations),
      };
    });

    if (outcome.conversation !== null) {
      for (const recipientActorId of outcome.recipientActorIds) {
        await this.notifications.notifyMessage(
          recipientActorId,
          input.actorId,
          outcome.conversation.id,
        );
      }
    }
    if (outcome.requestNotificationRecipientId !== null) {
      // §187: MESSAGE covers both ordinary messages and newly-created message requests. A
      // request has no conversation yet, so the notification carries a null conversation id.
      await this.notifications.notifyMessage(
        outcome.requestNotificationRecipientId,
        input.actorId,
        null,
      );
    }

    return { conversation: outcome.conversation, request: outcome.request };
  }

  /** Idempotent: leaving a conversation the caller isn't in is not an error (spec §189). An
   * E2EE_V1 conversation is rejected for an active member: `leftAt` here would be an unsigned
   * membership mutation on a cryptographically attested roster — leaving must go through
   * `E2eeService.RemoveE2eeMember`, whose device-signed event advances the membership epoch
   * (ADR 0020 §7). A non-member (or already-left member) keeps the §189 no-op. */
  async leaveConversation(actorId: string, conversationIdRaw: string): Promise<void> {
    const conversationId = parseInput(uuidInputSchema, conversationIdRaw);

    const conversation = await this.dataSource.getRepository(Conversation).findOne({
      where: { id: conversationId },
    });
    if (conversation === null) return;
    if (conversation.securityMode !== 'LEGACY_SERVER_VISIBLE') {
      const activeMembership = await this.dataSource
        .getRepository(ConversationMember)
        .findOne({ where: { conversationId, actorId, leftAt: IsNull() } });
      if (activeMembership !== null) {
        throw AppError.validation(
          'This conversation is end-to-end encrypted. Use RemoveE2eeMember to leave it; ' +
            'this command cannot alter its membership.',
        );
      }
      return;
    }

    await this.dataSource
      .getRepository(ConversationMember)
      .update({ conversationId, actorId, leftAt: IsNull() }, { leftAt: new Date() });
  }

  async markConversationRead(
    actorId: string,
    conversationIdRaw: string,
    throughMessageIdRaw: string,
  ): Promise<void> {
    const conversationId = parseInput(uuidInputSchema, conversationIdRaw);

    await this.dataSource.transaction(async (manager) => {
      const membership = await this.requireActiveUnblockedMembership(
        manager,
        conversationId,
        actorId,
      );

      let throughMessage: Message;
      if (throughMessageIdRaw.length === 0) {
        const latest = await manager
          .getRepository(Message)
          .findOne({ where: { conversationId }, order: { createdAt: 'DESC', id: 'DESC' } });
        if (latest === null) return;
        throughMessage = latest;
      } else {
        const throughMessageId = parseInput(uuidInputSchema, throughMessageIdRaw);
        const message = await manager
          .getRepository(Message)
          .findOne({ where: { id: throughMessageId, conversationId } });
        if (message === null) {
          throw AppError.validation(
            'through_message_id must reference a message in this conversation.',
          );
        }
        throughMessage = message;
      }

      // Read progress is monotonic. A stale client must not move the marker backwards and
      // make already-read messages unread again.
      if (membership.lastReadMessageId !== null) {
        const current = await manager
          .getRepository(Message)
          .findOne({ where: { id: membership.lastReadMessageId, conversationId } });
        if (current !== null && messageAtOrBefore(throughMessage, current)) return;
      }

      await manager
        .getRepository(ConversationMember)
        .update({ conversationId, actorId }, { lastReadMessageId: throughMessage.id });
    });
  }

  /**
   * The caller's own pending message requests (received), most-recent first.
   *
   * A-051 (spec §198.3): `MESSAGE_REQUESTS`-scope `hide` rules omit a request from a matching
   * sender/body server-side — "`message_requests` filters the request — sender, and the one
   * message a request may carry — because a message request is unsolicited contact". Same
   * bounded-over-fetch chokepoint as `FeedService`/`NotificationsService.listNotifications`
   * (`FeedService.MAX_FILTER_ROUNDS`): a `hide` match must never leave the page short, but the
   * re-fetching MUST stay bounded. Only `hide` is enforced — `collapse`/`warn` have no
   * request-inbox UI, documented on `FilterScope.MESSAGE_REQUESTS` in `filter-enums.ts`.
   */
  async listMessageRequests(
    actorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListPage<MessageRequestView>> {
    const take = clampLimit(limit);
    let cursor = decodeCursor(cursorRaw);

    const rules = await loadEffectiveFilterRules(this.dataSource, actorId, 'MESSAGE_REQUESTS');

    const collected: Array<MessageRequest & { senderActor: Actor; recipientActor: Actor }> = [];
    let roundHasMore = false;
    for (let round = 0; round < MAX_FILTER_ROUNDS && collected.length < take; round += 1) {
      const remaining = take - collected.length;
      const qb = this.dataSource
        .getRepository(MessageRequest)
        .createQueryBuilder('request')
        .innerJoinAndSelect('request.senderActor', 'senderActor')
        .innerJoinAndSelect('request.recipientActor', 'recipientActor')
        .where('request.recipientActorId = :actorId', { actorId })
        .andWhere(`request.status = 'PENDING'`)
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM blocks block
            WHERE (block.blocker_actor_id = request.sender_actor_id
                   AND block.blocked_actor_id = request.recipient_actor_id)
               OR (block.blocker_actor_id = request.recipient_actor_id
                   AND block.blocked_actor_id = request.sender_actor_id)
          )`,
        )
        .orderBy('request.createdAt', 'DESC')
        .addOrderBy('request.id', 'DESC');
      // Performance-only pushdown, mirroring the P14-021 pattern — `evaluateCandidate` below
      // still re-checks every row, including body-content (`SUBSTRING`/`WORD`/`DOMAIN`) kinds
      // this predicate does not cover.
      applyActorHidePushdown(qb, rules, '"request"."sender_actor_id"', 'requestHideActorIds');
      if (cursor !== undefined) {
        qb.andWhere('(request.createdAt, request.id) < (:cursorCreatedAt, :cursorId)', {
          cursorCreatedAt: cursor.createdAt,
          cursorId: cursor.id,
        });
      }
      qb.take(remaining + 1);

      const rows = await qb.getMany();
      roundHasMore = rows.length > remaining;
      const roundRows = roundHasMore ? rows.slice(0, remaining) : rows;
      if (roundRows.length === 0) break;

      for (const row of roundRows) {
        if (rules.length > 0) {
          const match = evaluateCandidate(rules, toMessageRequestFilterCandidate(row));
          if (match?.action === 'HIDE') continue;
        }
        collected.push(row);
      }

      const last = roundRows.at(-1);
      if (last !== undefined) cursor = { createdAt: last.createdAt, id: last.id };
      if (!roundHasMore) break;
    }

    const page = collected.slice(0, take);
    const items = page.map((row) => this.toMessageRequestView(row));
    const { nextCursor } = pageInfoFor(page, roundHasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { items, nextCursor, hasMore: roundHasMore };
  }

  /**
   * Accepting opens (or reuses, if one already exists) the direct conversation and returns
   * it; declining does not notify the sender and never auto-accepts anything else from them
   * (spec §192). Re-responding to an already-resolved request returns that request's current
   * state without re-notifying or re-creating anything.
   */
  async respondToMessageRequest(
    actorId: string,
    requestIdRaw: string,
    accept: boolean,
  ): Promise<RespondToMessageRequestResult> {
    this.requireDmEnabled();
    const requestId = parseInput(uuidInputSchema, requestIdRaw);

    const result = await this.dataSource.transaction(async (manager) => {
      const requests = manager.getRepository(MessageRequest);
      const request = await requests.findOne({
        where: { id: requestId },
        relations: { senderActor: true, recipientActor: true },
      });
      if (request === null || request.recipientActorId !== actorId) throw messageRequestNotFound();

      if (request.status !== 'PENDING') {
        return {
          request: this.toMessageRequestView(request),
          conversationId: null as string | null,
        };
      }

      if (!accept) {
        request.status = 'DECLINED';
        // Keep the lifecycle row as the 30-day bar record, timestamped from the decline, but
        // do not retain declined content after the recipient has rejected it.
        request.body = '';
        request.createdAt = new Date();
        await requests.save(request);
        return {
          request: this.toMessageRequestView(request),
          conversationId: null as string | null,
        };
      }

      // A block permanently bars the request (§183.2). Use the same uniform not-found result
      // as an unavailable request so this path cannot become a block oracle to a caller that
      // obtains or guesses the request id.
      if (await blockedEitherDirection(manager, request.senderActorId, request.recipientActorId)) {
        throw messageRequestNotFound();
      }

      const requestBody = request.body;
      request.status = 'ACCEPTED';
      // Once promoted, the authoritative copy lives in `messages`; retaining a second body
      // on the lifecycle row expands plaintext exposure for no product benefit.
      request.body = '';
      await requests.save(request);

      const existing = await this.findExistingDirectConversation(
        manager,
        request.senderActorId,
        request.recipientActorId,
      );

      let conversationId: string;
      let messageId: string;
      if (existing !== null) {
        conversationId = existing.id;
        const messages = manager.getRepository(Message);
        const message = await messages.save(
          messages.create({
            id: randomUUID(),
            conversationId,
            senderActorId: request.senderActorId,
            body: requestBody,
            clientRequestId: randomUUID(),
          }),
        );
        await manager
          .getRepository(Conversation)
          .update({ id: conversationId }, { lastMessageAt: message.createdAt });
        messageId = message.id;
      } else {
        const created = await this.createConversationWithMessage(
          manager,
          request.senderActorId,
          [request.recipientActorId],
          'DIRECT',
          randomUUID(),
          requestBody,
          actorId,
        );
        conversationId = created.view.id;
        messageId = created.messageId;
      }

      await manager
        .getRepository(ConversationMember)
        .update({ conversationId, actorId }, { lastReadMessageId: messageId });

      return { request: this.toMessageRequestView(request), conversationId };
    });

    let conversation: ConversationView | null = null;
    if (result.conversationId !== null) {
      const conversationRow = await this.dataSource.getRepository(Conversation).findOneOrFail({
        where: { id: result.conversationId },
        relations: { createdByActor: true },
      });
      conversation = await this.tryBuildConversationView(
        this.dataSource.manager,
        conversationRow,
        actorId,
      );
      // §192: accepting notifies the original sender (declining does not).
      await this.notifications.notifyMessage(
        result.request.sender.id,
        actorId,
        result.conversationId,
      );
    }

    return { request: result.request, conversation };
  }

  // ---------------------------------------------------------------- internals

  /**
   * Returns the reported message plus at most nine chronological neighbors. Former members
   * remain allowed to report content they received before leaving, and an intervening block
   * does not destroy the safety path. This method deliberately returns no entity and does not
   * log or include a body in any error (spec §183.4, §194).
   */
  async snapshotMessageForReport(
    reporterActorId: string,
    messageIdRaw: string,
  ): Promise<MessageReportEvidence> {
    const messageId = parseInput(uuidInputSchema, messageIdRaw);
    const messages = this.dataSource.getRepository(Message);
    const target = await messages.findOne({ where: { id: messageId } });
    if (target === null) throw messageNotFound();

    const membership = await this.dataSource.getRepository(ConversationMember).findOne({
      where: { conversationId: target.conversationId, actorId: reporterActorId },
    });
    if (membership === null) throw messageNotFound();

    const older = await messages
      .createQueryBuilder('message')
      .where('message.conversationId = :conversationId', {
        conversationId: target.conversationId,
      })
      .andWhere('(message.createdAt, message.id) < (:createdAt, :id)', {
        createdAt: target.createdAt,
        id: target.id,
      })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(4)
      .getMany();
    const newer = await messages
      .createQueryBuilder('message')
      .where('message.conversationId = :conversationId', {
        conversationId: target.conversationId,
      })
      .andWhere('(message.createdAt, message.id) > (:createdAt, :id)', {
        createdAt: target.createdAt,
        id: target.id,
      })
      .orderBy('message.createdAt', 'ASC')
      .addOrderBy('message.id', 'ASC')
      .take(5)
      .getMany();

    return {
      messageId,
      snapshot: [...older.reverse(), target, ...newer].map((message) => ({
        id: message.id,
        senderActorId: message.senderActorId,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  private requireDmEnabled(): void {
    if (!this.config.dmEnabled) {
      throw new AppError('DM_DISABLED', 'Direct messages are disabled on this node.');
    }
  }

  private async createConversationWithMessage(
    manager: EntityManager,
    authorActorId: string,
    otherMemberIds: string[],
    kind: DbConversationKind,
    clientRequestId: string,
    body: string,
    viewerActorId: string = authorActorId,
  ): Promise<{ view: ConversationView; recipientActorIds: string[]; messageId: string }> {
    const conversationId = randomUUID();
    const now = new Date();

    const conversations = manager.getRepository(Conversation);
    await conversations.save(
      conversations.create({
        id: conversationId,
        kind,
        createdByActorId: authorActorId,
        lastMessageAt: now,
      }),
    );

    const members = manager.getRepository(ConversationMember);
    const allMemberIds = [authorActorId, ...otherMemberIds];
    await members.save(allMemberIds.map((actorId) => members.create({ conversationId, actorId })));

    const messages = manager.getRepository(Message);
    const message = await messages.save(
      messages.create({
        id: randomUUID(),
        conversationId,
        senderActorId: authorActorId,
        body,
        clientRequestId,
      }),
    );

    // The author has implicitly read their own first message (no unread badge on your own
    // freshly-started conversation) — same reasoning `unreadCountFor` excludes your own sent
    // messages.
    await members.update(
      { conversationId, actorId: authorActorId },
      { lastReadMessageId: message.id },
    );

    const withRelations = await conversations.findOneOrFail({
      where: { id: conversationId },
      relations: { createdByActor: true },
    });
    const view = await this.tryBuildConversationView(manager, withRelations, viewerActorId);
    if (view === null) throw AppError.internal('Failed to build a just-created conversation.');
    return { view, recipientActorIds: otherMemberIds, messageId: message.id };
  }

  private async appendMessageToConversation(
    manager: EntityManager,
    conversation: Conversation,
    senderActorId: string,
    clientRequestId: string,
    body: string,
  ): Promise<{ view: ConversationView; messageId: string }> {
    const messages = manager.getRepository(Message);
    const message = await messages.save(
      messages.create({
        id: randomUUID(),
        conversationId: conversation.id,
        senderActorId,
        body,
        clientRequestId,
      }),
    );
    await manager
      .getRepository(Conversation)
      .update({ id: conversation.id }, { lastMessageAt: message.createdAt });

    const updated = await manager.getRepository(Conversation).findOneOrFail({
      where: { id: conversation.id },
      relations: { createdByActor: true },
    });
    const view = await this.tryBuildConversationView(manager, updated, senderActorId);
    if (view === null) throw AppError.internal('Failed to build an active conversation.');
    return { view, messageId: message.id };
  }

  /**
   * The pair's one active **legacy plaintext** direct thread, for reuse by every
   * plaintext-append path (`CreateConversation`, `RespondToMessageRequest` accept).
   *
   * Mode-aware deliberately (audit P0-1): `security_mode` is immutable (ADR 0020 §1.1) and a
   * row can never be interpreted as both modes, so this finder must only ever return a
   * `LEGACY_SERVER_VISIBLE` conversation. Reusing the pair's E2EE thread here would append a
   * server-readable body into a ciphertext-only transcript — the exact plaintext leak the DB
   * trigger added in this audit now rejects at the last line of defense.
   */
  private async findExistingDirectConversation(
    manager: EntityManager,
    actorAId: string,
    actorBId: string,
  ): Promise<Conversation | null> {
    const memberships = await manager
      .getRepository(ConversationMember)
      .find({ where: { actorId: actorAId, leftAt: IsNull() }, relations: { conversation: true } });

    for (const membership of memberships) {
      if (membership.conversation.kind !== 'DIRECT') continue;
      if (membership.conversation.securityMode !== 'LEGACY_SERVER_VISIBLE') continue;
      const otherMembers = await manager
        .getRepository(ConversationMember)
        .find({ where: { conversationId: membership.conversationId } });
      const activeOtherIds = otherMembers
        .filter((member) => member.actorId !== actorAId && member.leftAt === null)
        .map((member) => member.actorId);
      if (activeOtherIds.length === 1 && activeOtherIds[0] === actorBId) {
        return membership.conversation;
      }
    }
    return null;
  }

  /** Builds a viewer-scoped `ConversationView`, or `null` if the viewer isn't an active member
   * or is blocked-either-direction with any other active member (spec §183.4 — hides the
   * conversation from the blocker, no oracle for the blocked party either). */
  private async tryBuildConversationView(
    manager: EntityManager,
    conversation: Conversation & { createdByActor: Actor | null },
    viewerActorId: string,
  ): Promise<ConversationView | null> {
    const members = await manager
      .getRepository(ConversationMember)
      .find({ where: { conversationId: conversation.id }, relations: { actor: true } });

    const viewerMembership = members.find((member) => member.actorId === viewerActorId) ?? null;
    if (viewerMembership === null || viewerMembership.leftAt !== null) return null;

    const activeOthers = members.filter(
      (member) => member.actorId !== viewerActorId && member.leftAt === null,
    );
    for (const other of activeOthers) {
      if (await blockedEitherDirection(manager, viewerActorId, other.actorId)) return null;
    }

    const unreadCount = await this.unreadCountFor(manager, conversation.id, viewerMembership);

    return {
      id: conversation.id,
      kind: conversation.kind,
      securityMode: conversation.securityMode,
      createdBy:
        conversation.createdByActor === null ? null : toActorSummary(conversation.createdByActor),
      members: members.map((member) => ({
        actor: toActorSummary(member.actor),
        joinedAt: member.joinedAt,
        leftAt: member.leftAt,
        // Never disclose another member's marker: that would be a read receipt (§183.3).
        lastReadMessageId: member.actorId === viewerActorId ? member.lastReadMessageId : null,
        muted: member.muted,
      })),
      createdAt: conversation.createdAt,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount,
    };
  }

  /** Throws `CONVERSATION_NOT_FOUND` uniformly for a missing conversation, a caller who isn't
   * an active member, a caller blocked-either-direction with a fellow active member, and —
   * when `legacyPlaintextConversation` is set — a non-`LEGACY_SERVER_VISIBLE` one (spec §183.4,
   * §62; audit P0-1: the plaintext write RPCs must not distinguish "E2EE conversation" from any
   * other unavailable conversation, and must certainly not write into one). */
  private async requireActiveUnblockedMembership(
    manager: EntityManager,
    conversationId: string,
    actorId: string,
    requireActivePeer = false,
    options: { readonly legacyPlaintextConversation?: boolean } = {},
  ): Promise<ConversationMember> {
    const members = await manager
      .getRepository(ConversationMember)
      .find({ where: { conversationId } });
    const viewerMembership = members.find((member) => member.actorId === actorId) ?? null;
    if (viewerMembership === null || viewerMembership.leftAt !== null) throw conversationNotFound();

    if (options.legacyPlaintextConversation === true) {
      const conversation = await manager
        .getRepository(Conversation)
        .findOne({ where: { id: conversationId } });
      if (conversation?.securityMode !== 'LEGACY_SERVER_VISIBLE') throw conversationNotFound();
    }

    const activeOthers = members.filter(
      (member) => member.actorId !== actorId && member.leftAt === null,
    );
    // Fewer than two active members means the conversation is archived (§183.3). The schema
    // has no public archived flag, so the enforceable behavior is that it stays readable but
    // cannot receive new messages.
    if (requireActivePeer && activeOthers.length === 0) throw conversationNotFound();
    for (const other of activeOthers) {
      if (await blockedEitherDirection(manager, actorId, other.actorId))
        throw conversationNotFound();
    }
    return viewerMembership;
  }

  private async unreadCountFor(
    manager: EntityManager,
    conversationId: string,
    membership: ConversationMember,
  ): Promise<number> {
    const messages = manager.getRepository(Message);
    const qb = messages
      .createQueryBuilder('message')
      .where('message.conversationId = :conversationId', { conversationId })
      .andWhere('message.senderActorId IS DISTINCT FROM :viewerActorId', {
        viewerActorId: membership.actorId,
      });

    if (membership.lastReadMessageId !== null) {
      // Keep the comparison entirely in PostgreSQL. A round-trip through JavaScript `Date`
      // truncates PostgreSQL's microseconds to milliseconds, which can make the marker row
      // itself compare newer than its truncated timestamp and count as unread.
      qb.andWhere(
        `(message.created_at, message.id) > (
          SELECT marker.created_at, marker.id
          FROM messages marker
          WHERE marker.id = :lastReadMessageId
            AND marker.conversation_id = :conversationId
        )`,
        { lastReadMessageId: membership.lastReadMessageId },
      );
    }

    return qb.getCount();
  }

  private toMessageView(row: Message & { senderActor: Actor | null }): MessageView {
    return {
      id: row.id,
      conversationId: row.conversationId,
      sender: row.senderActor === null ? null : toActorSummary(row.senderActor),
      body: row.body,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    };
  }

  private toMessageRequestView(
    row: MessageRequest & { senderActor: Actor; recipientActor: Actor },
  ): MessageRequestView {
    return {
      id: row.id,
      sender: toActorSummary(row.senderActor),
      recipient: toActorSummary(row.recipientActor),
      body: row.body,
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}

/** A-051: `MessageRequest` has no tags/media, so most `FilterMatchCandidate` fields are
 * always empty — only `authorActorId` (the sender) and `body` are ever populated. */
function toMessageRequestFilterCandidate(request: MessageRequest): FilterMatchCandidate {
  return {
    id: request.id,
    authorActorId: request.senderActorId,
    quotedAuthorActorId: null,
    reposterActorIds: [],
    body: request.body,
    contentWarning: null,
    altTexts: [],
    linkUrl: null,
    tagNames: [],
  };
}

function conversationNotFound(): AppError {
  return new AppError('CONVERSATION_NOT_FOUND', 'That conversation does not exist.');
}

function messageNotFound(): AppError {
  return new AppError('MESSAGE_NOT_FOUND', 'That message does not exist.');
}

function messageRequestNotFound(): AppError {
  return new AppError('MESSAGE_REQUEST_NOT_FOUND', 'That message request does not exist.');
}

function actorNotFound(): AppError {
  return new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
}

/** Matches the service's canonical `(created_at, id)` ordering for a monotonic read marker. */
function messageAtOrBefore(candidate: Message, current: Message): boolean {
  const timeDifference = candidate.createdAt.getTime() - current.createdAt.getTime();
  return timeDifference < 0 || (timeDifference === 0 && candidate.id <= current.id);
}

/** PostgreSQL's `unique_violation` SQLSTATE, surfaced by `pg` as a plain `{ code: string }` —
 * same helper `PostService.createPost`/`GraphService.followActor` use for their own
 * idempotency races. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
