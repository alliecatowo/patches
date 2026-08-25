import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountDeletionRequest,
  AccountExport,
  Actor,
  ActorPrivacyPrefs,
  appendAdminAuditLog,
  Bookmark,
  CommunityMember,
  Credential,
  E2eeDeviceIdentity,
  E2eeDeviceRoster,
  E2eeGroupControlEvent,
  E2eeIdentityRoot,
  E2eeLogicalMessage,
  E2eeMailboxEnvelope,
  E2eeOneTimePrekey,
  E2eeSignedPrekey,
  FilterListSubscription,
  Follow,
  FollowRequest,
  LabelerSubscription,
  Like,
  Media,
  Post,
  purgeAccountPayloadSchema,
  RefreshToken,
  Repost,
  TagMute,
  User,
  type JobType,
} from '@patches/database';
import {
  MEDIA_VARIANTS,
  mediaOriginalKey,
  mediaVariantKey,
  type StorageClient,
} from '@patches/media';
import { In, IsNull, type EntityManager, type DataSource } from 'typeorm';

import { DATA_SOURCE } from '../../database/database.module.js';
import { STORAGE_CLIENT } from '../../storage/storage.module.js';
import { type JobContext, type JobHandler } from '../job-handler.js';

/**
 * `PURGE_ACCOUNT` (P14-010/P14-024, `INITIAL_VISION.md` §197.4): erases an account's content
 * once its grace period has elapsed. Scope: profile fields, posts and bodies, media objects,
 * follows, follow requests (both directions), reactions (likes), bookmarks, reposts, community
 * memberships, muted tags, filter-list subscriptions, labeler subscriptions, export
 * archives, sessions, and credentials — plus the notice acknowledgement itself
 * ("filters, lists, subscriptions, and acknowledgements", §197.4). Filter *lists* and labelers
 * themselves are not purged here — those are owned by the actor as author, not as subscriber,
 * and are out of this task's scope (owned by the filters/labels module).
 *
 * Also purges the account's E2EE material (audit P1; ADR 0020 §10): identity roots, device
 * identities/certificates, rosters, signed and one-time prekeys, mailbox envelopes addressed
 * to the account's devices, logical messages the account sent, and group-control events its
 * devices signed. `e2ee_report_evidence*` is deliberately exempt: reporter-disclosed abuse
 * evidence outlives accounts (ADR 0020), with its own access controls.
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

    // Same reasoning for export archives — an export row's `objectKey` points at storage this
    // purge is about to make orphaned data if left behind.
    const exportsWithObjects = await this.dataSource
      .getRepository(AccountExport)
      .find({ where: { actorId } });
    for (const row of exportsWithObjects) {
      if (row.objectKey !== null) await this.storage.deleteObject(row.objectKey);
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

    // Pending follow requests, both directions (P14-024) — a request this actor sent to
    // someone locked, or one someone else sent awaiting this actor's own approval.
    await manager
      .getRepository(FollowRequest)
      .createQueryBuilder()
      .delete()
      .where('requester_actor_id = :actorId OR target_actor_id = :actorId', { actorId })
      .execute();

    // Reactions (likes), bookmarks, and reposts (P14-024) — all private-to-the-actor pointer
    // rows, same shape/purge reasoning as `Follow`/`Like` already had.
    await manager.getRepository(Like).delete({ actorId });
    await manager.getRepository(Bookmark).delete({ actorId });
    await manager.getRepository(Repost).delete({ actorId });

    // Community memberships and muted tags (P14-024).
    await manager.getRepository(CommunityMember).delete({ actorId });
    await manager.getRepository(TagMute).delete({ actorId });

    // Filter-list and labeler subscriptions (P14-024, spec §197.4's "subscriptions"). The
    // filter lists / labelers this actor *authored* are out of this handler's scope (owned by
    // the filters/labels module) — only this actor's own subscription rows are purged here.
    await manager.getRepository(FilterListSubscription).delete({ actorId });
    await manager.getRepository(LabelerSubscription).delete({ actorId });

    // No DM-body tombstone step: ADR 0030 deleted the plaintext `messages` table with the
    // legacy security mode, so the only DM rows left are the encrypted ones handled below.

    // E2EE material (audit P1; ADR 0020 §10's "the node deletes its unused public prekeys"
    // generalized to the whole account). Order follows the FK graph: envelopes and prekeys
    // hang off device identities, which hang off identity roots. `E2eeReportEvidence`/
    // `E2eeReportEvidenceItems` are deliberately NOT touched — ADR 0020 keeps
    // reporter-disclosed abuse evidence alive after an account is gone (evidence outlives
    // accounts), with its own access controls.
    const deviceRows = await manager
      .getRepository(E2eeDeviceIdentity)
      .find({ where: { actorId }, select: { id: true } });
    if (deviceRows.length > 0) {
      const deviceIds = deviceRows.map((device) => device.id);
      // Mail addressed to this actor's devices: ciphertext only they could open.
      await manager.getRepository(E2eeMailboxEnvelope).delete({
        recipientDeviceIdentityId: In(deviceIds),
      });
      await manager.getRepository(E2eeOneTimePrekey).delete({ deviceIdentityId: In(deviceIds) });
      await manager.getRepository(E2eeSignedPrekey).delete({ deviceIdentityId: In(deviceIds) });
    }
    await manager.getRepository(E2eeDeviceIdentity).delete({ actorId });
    await manager.getRepository(E2eeDeviceRoster).delete({ actorId });
    await manager.getRepository(E2eeIdentityRoot).delete({ actorId });

    // Logical messages this actor sent (their ciphertext payloads node-wide; deleting a row
    // cascades to any recipient-device envelope copies still pointing at it) and the
    // group-control events their devices signed. Subject-of events are retained: they are
    // signed by *other* members' devices and belong to those members' transcript. Deleting a
    // signer's links intentionally truncates the transcript chain from the surviving tip —
    // ADR 0020 §7 makes that breakage detectable to members holding prior digests, which is
    // the accepted cost of erasing the purged account's signatures.
    await manager.getRepository(E2eeLogicalMessage).delete({ senderActorId: actorId });
    await manager.getRepository(E2eeGroupControlEvent).delete({ signerActorId: actorId });

    // Export archives (P14-024) — storage objects were already deleted above (outside the
    // transaction); this removes the rows themselves rather than merely expiring them, since
    // the account they describe no longer has data to re-export.
    await manager.getRepository(AccountExport).delete({ actorId });

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
