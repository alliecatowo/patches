import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountDeletionRequest,
  Actor,
  ActorPrivacyPrefs,
  appendAdminAuditLog,
  Credential,
  Follow,
  Like,
  Media,
  Message,
  Post,
  purgeAccountPayloadSchema,
  RefreshToken,
  User,
  type JobType,
} from '@patches/database';
import {
  MEDIA_VARIANTS,
  mediaOriginalKey,
  mediaVariantKey,
  type StorageClient,
} from '@patches/media';
import { IsNull, type EntityManager, type DataSource } from 'typeorm';

import { DATA_SOURCE } from '../../database/database.module.js';
import { STORAGE_CLIENT } from '../../storage/storage.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

/**
 * `PURGE_ACCOUNT` (P14-010, `INITIAL_VISION.md` §197.4): erases an account's content once its
 * grace period has elapsed. The scope purged here is the set the P14-010 task brief names —
 * profile fields, posts and bodies, media objects, follows, reactions (likes), DMs sent,
 * sessions, and credentials — plus the notice acknowledgement itself. Bookmarks, reposts,
 * community memberships, and muted tags are *not* purged yet (nor are filters/lists/labeler
 * subscriptions — this node doesn't implement those); see this task's final report for the
 * follow-up.
 *
 * Idempotent (`docs/architecture/jobs.md` §7) two different ways: a `CancelAccountDeletion`
 * that lands after this job was enqueued but before it ran makes this whole handler a no-op
 * (re-checks `cancelled_at` itself rather than trusting the enqueuer's snapshot); and a
 * redelivery *after* a first run already purged (`purged_at` set) is also a no-op — every
 * mutation below is itself idempotent (conditional on `IS NULL`, or naturally so for a delete/
 * no-op-on-missing), but the `purgedAt` check short-circuits before doing any of that work
 * twice.
 */
@Injectable()
export class PurgeAccountHandler implements JobHandler {
  readonly type: JobType = 'PURGE_ACCOUNT';
  private readonly logger = new Logger(PurgeAccountHandler.name);

  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
  ) {}

  async handle(payload: unknown, _ctx: JobContext): Promise<void> {
    const { actorId } = purgeAccountPayloadSchema.parse(payload);

    const request = await this.dataSource
      .getRepository(AccountDeletionRequest)
      .findOne({ where: { actorId } });
    if (request === null) {
      this.logger.warn(JSON.stringify({ actorId, outcome: 'DELETION_REQUEST_MISSING' }));
      return;
    }
    if (request.cancelledAt !== null) {
      this.logger.log(JSON.stringify({ actorId, outcome: 'PURGE_SKIPPED_CANCELLED' }));
      return;
    }
    if (request.purgedAt !== null) {
      // Already purged by a prior run of this same job — idempotent no-op.
      return;
    }

    // Media object deletes happen outside the transaction (storage isn't transactional with
    // Postgres); the row-level `state`/key updates inside it are what makes a partial storage
    // failure retry-safe — `deleteObject` is itself a no-op on an already-missing key
    // (`docs/architecture/jobs.md` §7), so re-running the whole handler after a crash mid-purge
    // never re-deletes anything meaningfully different.
    const media = await this.dataSource
      .getRepository(Media)
      .find({ where: { ownerActorId: actorId } });
    for (const item of media) {
      if (item.state === 'DELETED') continue;
      await Promise.all([
        this.storage.deleteObject(mediaOriginalKey(item.id)),
        ...MEDIA_VARIANTS.map((variant) =>
          this.storage.deleteObject(mediaVariantKey(item.id, variant)),
        ),
      ]);
    }

    await this.dataSource.transaction(async (manager) => this.purgeInTransaction(manager, actorId));

    this.logger.log(JSON.stringify({ actorId, outcome: 'PURGE_COMPLETE' }));
  }

  private async purgeInTransaction(manager: EntityManager, actorId: string): Promise<void> {
    const now = new Date();

    const actor = await manager.getRepository(Actor).findOne({ where: { id: actorId } });
    if (actor === null) {
      this.logger.warn(JSON.stringify({ actorId, outcome: 'ACTOR_ROW_MISSING' }));
      return;
    }

    // Profile fields (spec §197.4). The handle itself is kept — "the handle is not recycled".
    await manager.getRepository(Actor).update(
      { id: actorId },
      {
        displayName: null,
        bio: null,
        locationText: null,
        websiteUrl: null,
        deletedAt: actor.deletedAt ?? now,
      },
    );

    if (actor.userId !== null) {
      const userId = actor.userId;
      const user = await manager.getRepository(User).findOne({ where: { id: userId } });
      await manager.getRepository(User).update(
        { id: userId },
        {
          status: 'DELETED',
          deletedAt: user?.deletedAt ?? now,
          recoveryEmail: null,
          recoveryEmailNormalized: null,
        },
      );

      // Sessions and credentials (task brief scope). `RequestAccountDeletion` already revoked
      // every session at request time; this is the durable, redundant guarantee.
      await manager
        .getRepository(RefreshToken)
        .update({ userId, revokedAt: IsNull() }, { revokedAt: now });
      await manager
        .getRepository(Credential)
        .update({ userId, revokedAt: IsNull() }, { revokedAt: now });
    }

    // Posts and bodies (spec §197.4). `link_url` is left as-is on LINK posts: nulling it would
    // violate `chk_posts_link_url_required_for_link`, and a shared link isn't the kind of
    // private content this purge is erasing.
    await manager
      .getRepository(Post)
      .update({ authorActorId: actorId, deletedAt: IsNull() }, { deletedAt: now });
    await manager
      .getRepository(Post)
      .update({ authorActorId: actorId }, { body: null, contentWarning: null });

    // Media rows: storage objects were already deleted above (outside the transaction); this
    // is the row-level half.
    await manager.getRepository(Media).update(
      { ownerActorId: actorId },
      {
        state: 'DELETED',
        deletedAt: now,
        sourceObjectKey: null,
        displayObjectKey: null,
        thumbnailObjectKey: null,
      },
    );

    // Follows, both directions.
    await manager
      .getRepository(Follow)
      .createQueryBuilder()
      .delete()
      .where('follower_actor_id = :actorId OR followee_actor_id = :actorId', { actorId })
      .execute();

    // Reactions (likes).
    await manager.getRepository(Like).delete({ actorId });

    // DMs the actor sent — same tombstone convention `DirectMessageService.deleteMessage`
    // already uses (`body` cleared, `deletedAt` set), applied to every message this actor
    // ever sent rather than one at a time.
    await manager
      .getRepository(Message)
      .update({ senderActorId: actorId, deletedAt: IsNull() }, { body: '', deletedAt: now });

    // Acknowledgement records (spec §197.4's explicit purge list).
    await manager
      .getRepository(ActorPrivacyPrefs)
      .update({ actorId }, { privacyNoticeVersion: null, privacyNoticeAcknowledgedAt: null });

    await manager.getRepository(AccountDeletionRequest).update({ actorId }, { purgedAt: now });

    await appendAdminAuditLog(manager, {
      // No operator performed this — it is the account's own (grace-period-expired) request,
      // or an admin-initiated one that already went through this same path
      // (`patches-admin user delete`). `admin_audit_log.admin_user_id` is not a foreign key
      // (see its class doc), so recording the purged user's own id here is safe even though
      // that same row was just marked `DELETED` above.
      adminUserId: actor.userId ?? actorId,
      action: 'user.purge',
      subjectType: 'USER',
      subjectId: actor.userId ?? actorId,
      metadata: { actorId, trigger: 'account_deletion_grace_period_expired' },
    });
  }
}
