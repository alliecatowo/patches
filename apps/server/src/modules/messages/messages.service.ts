import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Block,
  Conversation,
  ConversationMember,
  E2eeLogicalMessage,
} from '@patches/database';
import { DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { toActorSummary } from '../auth/auth.dto.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import type { ConversationView, ListPage } from './messages.dto.js';
import { parseInput, uuidInputSchema } from './validation.js';

/**
 * The application service behind `patches.v1.DirectMessageService` (spec §183, §188–190). The
 * plaintext send/read/request paths this service used to own (`SendMessage`, `ListMessages`,
 * `DeleteMessage`, `CreateConversation`, and the whole `MessageRequest` flow) were removed by
 * ADR 0030 §B-095 alongside `LEGACY_SERVER_VISIBLE` conversations. What remains is the generic
 * conversation surface every security mode shares: listing, reading, membership, and read-state
 * tracking — content lives entirely in `E2eeService` now (`CreateE2eeConversation`,
 * `SendEnvelopes`), which the node never gets to see in plaintext (ADR 0020).
 */
@Injectable()
export class MessagesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
      // ADR 0035 §5: a conversation reserved by `CreateE2eeConversation` but never messaged is
      // invisible to every member, including its creator — surfacing it early is a coarse
      // typing indicator (spec §183.3 forbids leaking presence).
      .andWhere('conversation.lastMessageAt IS NOT NULL')
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

    const { nextCursor } = pageInfoFor(page, hasMore, (row) => {
      const { lastMessageAt } = row.conversation;
      if (lastMessageAt === null) {
        // Unreachable: the query above filters `lastMessageAt IS NOT NULL`.
        throw AppError.internal('Listed conversation has no last_message_at.');
      }
      return { createdAt: lastMessageAt, id: row.conversation.id };
    });
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

  /**
   * Always rejected (ADR 0030 §B-095): every conversation is `E2EE_V1`, so leaving is a
   * group-control transition, not a column flip — a silent `left_at` write would desync the
   * membership epoch and the roster chain every other member verifies. Self-removal goes
   * through `E2eeService.RemoveE2eeMember` with `actor_id` set to the caller, which bumps the
   * epoch and emits the signed `REMOVED` event. The rejection is uniform and precedes any
   * database work, so it leaks nothing (spec §62).
   */
  // Not `async`: there is nothing to await, and the rejection must precede any database work.
  leaveConversation(_actorId: string, _conversationIdRaw: string): Promise<void> {
    return Promise.reject(
      new AppError(
        'NOT_IMPLEMENTED',
        'Leaving a conversation is not supported: use E2eeService.RemoveE2eeMember to leave.',
      ),
    );
  }

  /** `through_message_id` is an `E2eeLogicalMessage.id` (ADR 0030 §B-095 — the node has no
   * plaintext `messages` table to point at anymore). Read progress is per-viewer only and never
   * surfaced to any other member (§183.3 — no read receipts). */
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

      let throughMessage: E2eeLogicalMessage;
      if (throughMessageIdRaw.length === 0) {
        const latest = await manager
          .getRepository(E2eeLogicalMessage)
          .findOne({ where: { conversationId }, order: { acceptedAt: 'DESC', id: 'DESC' } });
        if (latest === null) return;
        throughMessage = latest;
      } else {
        const throughMessageId = parseInput(uuidInputSchema, throughMessageIdRaw);
        const message = await manager
          .getRepository(E2eeLogicalMessage)
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
          .getRepository(E2eeLogicalMessage)
          .findOne({ where: { id: membership.lastReadMessageId, conversationId } });
        if (current !== null && messageAtOrBefore(throughMessage, current)) return;
      }

      await manager
        .getRepository(ConversationMember)
        .update({ conversationId, actorId }, { lastReadMessageId: throughMessage.id });
    });
  }

  // ---------------------------------------------------------------- internals

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
      if (await this.blockedEitherDirection(manager, viewerActorId, other.actorId)) return null;
    }

    // ADR 0035 §5: a reservation with no accepted message yet (`lastMessageAt` still NULL) is
    // not a visible product state for anyone, including its creator — treated identically to
    // "not found"/"not a member" rather than as a distinguishable empty conversation.
    const { lastMessageAt } = conversation;
    if (lastMessageAt === null) return null;

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
      lastMessageAt,
      unreadCount,
    };
  }

  /** Throws `CONVERSATION_NOT_FOUND` uniformly for a missing conversation, a caller who isn't
   * an active member, and a caller blocked-either-direction with a fellow active member (spec
   * §183.4, §62 — no block oracle: a blocked send fails the same way any other unavailable
   * conversation does). */
  private async requireActiveUnblockedMembership(
    manager: EntityManager,
    conversationId: string,
    actorId: string,
  ): Promise<ConversationMember> {
    const members = await manager
      .getRepository(ConversationMember)
      .find({ where: { conversationId } });
    const viewerMembership = members.find((member) => member.actorId === actorId) ?? null;
    if (viewerMembership === null || viewerMembership.leftAt !== null) throw conversationNotFound();

    const activeOthers = members.filter(
      (member) => member.actorId !== actorId && member.leftAt === null,
    );
    for (const other of activeOthers) {
      if (await this.blockedEitherDirection(manager, actorId, other.actorId))
        throw conversationNotFound();
    }
    return viewerMembership;
  }

  /** Counts logical messages sent by anyone but the viewer, after the viewer's last-read
   * marker (ADR 0030 §B-095 — `E2eeLogicalMessage` is metadata-only, so this counts arrivals
   * the node knows exist without ever knowing what they say). */
  private unreadCountFor(
    manager: EntityManager,
    conversationId: string,
    membership: ConversationMember,
  ): Promise<number> {
    const messages = manager.getRepository(E2eeLogicalMessage);
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
        `(message.accepted_at, message.id) > (
          SELECT marker.accepted_at, marker.id
          FROM e2ee_logical_messages marker
          WHERE marker.id = :lastReadMessageId
            AND marker.conversation_id = :conversationId
        )`,
        { lastReadMessageId: membership.lastReadMessageId },
      );
    }

    return qb.getCount();
  }

  private async blockedEitherDirection(
    manager: EntityManager,
    actorAId: string,
    actorBId: string,
  ): Promise<boolean> {
    const blocks = manager.getRepository(Block);
    const [aBlocksB, bBlocksA] = await Promise.all([
      blocks.findOne({ where: { blockerActorId: actorAId, blockedActorId: actorBId } }),
      blocks.findOne({ where: { blockerActorId: actorBId, blockedActorId: actorAId } }),
    ]);
    return aBlocksB !== null || bBlocksA !== null;
  }
}

function conversationNotFound(): AppError {
  return new AppError('CONVERSATION_NOT_FOUND', 'That conversation does not exist.');
}

/** Matches the service's canonical `(accepted_at, id)` ordering for a monotonic read marker. */
function messageAtOrBefore(candidate: E2eeLogicalMessage, current: E2eeLogicalMessage): boolean {
  const timeDifference = candidate.acceptedAt.getTime() - current.acceptedAt.getTime();
  return timeDifference < 0 || (timeDifference === 0 && candidate.id <= current.id);
}
