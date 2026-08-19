import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  Block,
  Mute,
  Notification,
  type NotificationType as DbNotificationType,
} from '@patches/database';
import { DataSource, IsNull } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { toActorSummary } from '../auth/auth.dto.js';
import { clampLimit, decodeCursor, pageInfoFor } from '../feeds/pagination.js';
import { parseInput, uuidInputSchema } from '../posts/validation.js';
import type { NotificationView } from './notification.dto.js';

/**
 * The application service behind `patches.v1.NotificationService` (spec §56, §113).
 *
 * `notifyFollow`/`notifyLike`/`notifyReply`/`notifyMention` are the write side, called from
 * other feature services (`ReactionsService`, `PostService`, and — once `GraphModule` wires it
 * in, see this task's report — `GraphService.followActor`) rather than exposed as their own
 * RPCs; spec §113 has "no separate event service", just rows created as a side effect of the
 * action that causes them.
 */

export interface ListNotificationsResult {
  notifications: NotificationView[];
  nextCursor: string;
  hasMore: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listNotifications(
    recipientActorId: string,
    cursorRaw: string,
    limit: number,
  ): Promise<ListNotificationsResult> {
    const cursor = decodeCursor(cursorRaw);
    const take = clampLimit(limit);

    const qb = this.dataSource
      .getRepository(Notification)
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.actor', 'actor')
      .where('notification.recipientActorId = :recipientActorId', { recipientActorId })
      .orderBy('notification.createdAt', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .take(take + 1);

    if (cursor !== undefined) {
      qb.andWhere('(notification.createdAt, notification.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const notifications = page.map((row) => toNotificationView(row));
    const { nextCursor } = pageInfoFor(page, hasMore, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
    return { notifications, nextCursor, hasMore };
  }

  /**
   * `markAll` marks every unread notification for the caller; otherwise `throughIdRaw` must
   * name one of the caller's own notifications and every notification at or before it (by the
   * canonical `created_at DESC, id DESC` ordering) is marked read. Idempotent either way —
   * re-marking an already-read notification is not an error, just a no-op row.
   */
  async markNotificationsRead(
    recipientActorId: string,
    throughIdRaw: string,
    markAll: boolean,
  ): Promise<number> {
    const notifications = this.dataSource.getRepository(Notification);

    if (markAll) {
      const result = await notifications
        .createQueryBuilder()
        .update(Notification)
        .set({ readAt: new Date() })
        .where('recipient_actor_id = :recipientActorId', { recipientActorId })
        .andWhere('read_at IS NULL')
        .execute();
      return result.affected ?? 0;
    }

    const throughId = parseInput(uuidInputSchema, throughIdRaw);
    const throughRow = await notifications.findOne({
      where: { id: throughId, recipientActorId },
    });
    if (throughRow === null) {
      throw AppError.validation('through_id must reference one of your own notifications.');
    }

    const result = await notifications
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('recipient_actor_id = :recipientActorId', { recipientActorId })
      .andWhere('read_at IS NULL')
      .andWhere('(created_at, id) <= (:throughCreatedAt, :throughId)', {
        throughCreatedAt: throughRow.createdAt,
        throughId,
      })
      .execute();
    return result.affected ?? 0;
  }

  async getUnreadCount(recipientActorId: string): Promise<number> {
    return this.dataSource
      .getRepository(Notification)
      .countBy({ recipientActorId, readAt: IsNull() });
  }

  async notifyFollow(recipientActorId: string, actorId: string): Promise<void> {
    await this.create('FOLLOW', recipientActorId, actorId, {});
  }

  async notifyLike(recipientActorId: string, actorId: string, postId: string): Promise<void> {
    await this.create('LIKE', recipientActorId, actorId, { postId });
  }

  async notifyReply(recipientActorId: string, actorId: string, postId: string): Promise<void> {
    await this.create('REPLY', recipientActorId, actorId, { postId });
  }

  async notifyMention(recipientActorId: string, actorId: string, postId: string): Promise<void> {
    await this.create('MENTION', recipientActorId, actorId, { postId });
  }

  async notifyRepost(recipientActorId: string, actorId: string, postId: string): Promise<void> {
    await this.create('REPOST', recipientActorId, actorId, { postId });
  }

  async notifyQuote(recipientActorId: string, actorId: string, postId: string): Promise<void> {
    await this.create('QUOTE', recipientActorId, actorId, { postId });
  }

  async notifyMessage(
    recipientActorId: string,
    actorId: string,
    conversationId: string | null,
  ): Promise<void> {
    await this.create(
      'MESSAGE',
      recipientActorId,
      actorId,
      conversationId === null ? {} : { conversationId },
    );
  }

  async notifyCommunityInvite(
    recipientActorId: string,
    actorId: string,
    communityId: string,
  ): Promise<void> {
    await this.create('COMMUNITY_INVITE', recipientActorId, actorId, { communityId });
  }

  // ---------------------------------------------------------------- internals

  /**
   * Common write path for every notify* method above. Never notifies the actor about their own
   * action, and respects blocks (§62) and mutes (§63) in both directions before ever inserting
   * a row — the caller does not have to know those rules.
   */
  private async create(
    type: DbNotificationType,
    recipientActorId: string,
    actorId: string,
    target: { postId?: string; conversationId?: string; communityId?: string },
  ): Promise<void> {
    if (recipientActorId === actorId) return;
    if (await this.blockedEitherDirection(recipientActorId, actorId)) return;
    if (await this.muted(recipientActorId, actorId)) return;

    const notifications = this.dataSource.getRepository(Notification);
    try {
      await notifications.save(
        notifications.create({
          recipientActorId,
          type,
          actorId,
          postId: target.postId ?? null,
          conversationId: target.conversationId ?? null,
          communityId: target.communityId ?? null,
        }),
      );
    } catch (error) {
      // The `Notification` entity's two partial unique indexes are the dedupe backstop (§113)
      // — a duplicate of an existing (recipient, type, actor, post) row is not an error, it is
      // exactly what "a retry must not produce a second notification" requires.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  private async blockedEitherDirection(actorAId: string, actorBId: string): Promise<boolean> {
    const blocks = this.dataSource.getRepository(Block);
    const [aBlocksB, bBlocksA] = await Promise.all([
      blocks.findOne({ where: { blockerActorId: actorAId, blockedActorId: actorBId } }),
      blocks.findOne({ where: { blockerActorId: actorBId, blockedActorId: actorAId } }),
    ]);
    return aBlocksB !== null || bBlocksA !== null;
  }

  private async muted(recipientActorId: string, actorId: string): Promise<boolean> {
    const mute = await this.dataSource
      .getRepository(Mute)
      .findOne({ where: { muterActorId: recipientActorId, mutedActorId: actorId } });
    return mute !== null;
  }
}

function toNotificationView(row: Notification & { actor: Actor | null }): NotificationView {
  return {
    id: row.id,
    type: row.type,
    actor: row.actor === null ? null : toActorSummary(row.actor),
    postId: row.postId,
    conversationId: row.conversationId,
    communityId: row.communityId,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
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
