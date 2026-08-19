import {
  AccountDeletionRequest,
  Actor,
  appendAdminAuditLog,
  Credential,
  MODERATION_REASON_CATEGORIES,
  ModerationLogEntry,
  Notification,
  OutboxJob,
  RefreshToken,
  User,
  type JobType,
  type ModerationReasonCategory,
} from '@patches/database';
import { ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT } from '@patches/domain';
import { IsNull, type EntityManager } from 'typeorm';

import {
  booleanOption,
  optionalStringOption,
  type ParsedArgs,
  requirePositional,
  requireStringOption,
} from '../cli/arg-parser.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';
import { findUserByHandle } from '../lookups.js';

/** `user list|show|suspend|unsuspend|delete|deletion-status|cancel-deletion` (spec §65,
 * §197.4). */
export async function runUserCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'list':
      return listUsers(args, context);
    case 'show':
      return showUser(args, context);
    case 'suspend':
      return suspendUser(args, context);
    case 'unsuspend':
      return unsuspendUser(args, context);
    case 'delete':
      return deleteUser(args, context);
    case 'deletion-status':
      return deletionStatus(args, context);
    case 'cancel-deletion':
      return cancelDeletion(args, context);
    default:
      throw new Error(
        `Unknown "user" action "${action}". Try list, show, suspend, unsuspend, delete, ` +
          'deletion-status, or cancel-deletion.',
      );
  }
}

function handleArg(args: ParsedArgs, usage: string): string {
  return requirePositional(args.positionals, 2, usage);
}

/** Same closed vocabulary/parsing `patches-admin domain block` uses (`commands/domain.ts`'s
 * `parseReasonCategory`) — duplicated rather than shared because these are two independently
 * ownable, single-purpose CLI command files and the parse is three lines. Defaults to `OTHER`
 * for the same reason: `--reason-category` is new surface these actions never had before, and
 * an unset value must still produce a valid, publishable `moderation_log_entries` row (spec
 * §201.4) rather than forcing every existing caller to start passing it. */
function parseReasonCategory(args: ParsedArgs): ModerationReasonCategory {
  const raw = optionalStringOption(args.options, 'reason-category');
  if (raw === undefined) return 'OTHER';
  const upper = raw.trim().toUpperCase();
  if (!(MODERATION_REASON_CATEGORIES as readonly string[]).includes(upper)) {
    throw new Error(
      `--reason-category must be one of: ${MODERATION_REASON_CATEGORIES.join(', ').toLowerCase()}.`,
    );
  }
  return upper as ModerationReasonCategory;
}

async function listUsers(args: ParsedArgs, context: AdminContext): Promise<void> {
  const rows = await context.dataSource
    .getRepository(User)
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.actor', 'actor')
    .orderBy('user.createdAt', 'DESC')
    .limit(100)
    .getMany();

  const table: Row[] = rows.map((user) => ({
    id: user.id,
    handle: user.actor.handle,
    status: user.status,
    createdAt: user.createdAt,
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}

async function showUser(args: ParsedArgs, context: AdminContext): Promise<void> {
  const handle = handleArg(args, 'Usage: user show <handle>');
  const { user, actor } = await findUserByHandle(context.dataSource, handle);

  const row: Row = {
    id: user.id,
    handle: actor.handle,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
  };

  if (booleanOption(args.options, 'json')) {
    printJson(row);
  } else {
    printTable([row]);
  }
}

async function suspendUser(args: ParsedArgs, context: AdminContext): Promise<void> {
  const handle = handleArg(
    args,
    'Usage: user suspend <handle> --reason <text> [--reason-category <category>]',
  );
  const reason = requireStringOption(args.options, 'reason');
  const reasonCategory = parseReasonCategory(args);
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const { user, actor } = await findUserByHandle(manager, handle);
    if (user.status === 'DELETED') {
      throw new Error(`"${handle}" was deleted; there is nothing to suspend.`);
    }

    await manager.getRepository(User).update({ id: user.id }, { status: 'SUSPENDED' });
    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'user.suspend',
      subjectType: 'USER',
      subjectId: user.id,
      metadata: { reason },
    });

    // The public, anonymized account-kind transparency-log entry (spec §201.4) — no actor id
    // or handle on this row at all (see `ModerationLogEntry`'s doc comment); the suspended
    // account gets the fully-identified version via its own moderation notice, a read
    // projection of the `admin_audit_log` row written just above.
    await manager.getRepository(ModerationLogEntry).save(
      manager.getRepository(ModerationLogEntry).create({
        action: 'SUSPEND',
        subjectKind: 'ACCOUNT',
        subjectDomain: null,
        reasonCategory,
        appealed: false,
      }),
    );

    await writeModerationNotification(manager, actor.id);
  });

  process.stdout.write(`${handle} suspended.\n`);
}

async function unsuspendUser(args: ParsedArgs, context: AdminContext): Promise<void> {
  const handle = handleArg(args, 'Usage: user unsuspend <handle>');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const { user } = await findUserByHandle(manager, handle);
    if (user.status !== 'SUSPENDED') {
      throw new Error(`"${handle}" is not suspended (current status: ${user.status}).`);
    }

    await manager.getRepository(User).update({ id: user.id }, { status: 'ACTIVE' });
    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'user.unsuspend',
      subjectType: 'USER',
      subjectId: user.id,
    });
  });

  process.stdout.write(`${handle} unsuspended.\n`);
}

/**
 * Soft delete (spec §25's tombstone convention, applied to the account): `users.status`
 * flips to `DELETED` and both `users.deleted_at`/`actors.deleted_at` are set immediately,
 * mirroring how `PostService`/`patches-admin post remove` tombstone a post rather than
 * destroying the row.
 *
 * P14-010 (spec §197.4): this now also routes through the **same** grace-period-then-purge
 * path `PrivacyService.RequestAccountDeletion` uses, rather than being a second, weaker
 * deletion that only ever flipped a status column and never actually purged anything — an
 * `account_deletion_requests` row is written and a `PURGE_ACCOUNT` job is scheduled for
 * `purge_after`, exactly like the self-service RPC (`apps/server/src/modules/privacy/
 * privacy.service.ts`'s `requestAccountDeletion`, which this intentionally mirrors). The
 * immediate status flip above already satisfies §197.4's "disappears ... immediately"; the
 * grace period/purge job is what makes the actual content erasure happen for real instead of
 * never. Idempotent the same way the RPC is: an already-pending, uncancelled request for this
 * actor is left alone rather than restarting its clock.
 *
 * P14 follow-up: an operator-driven delete is the permanent enforcement action ("ban") in the
 * `moderation_log_entries` vocabulary (`ModerationActionType.BAN`, as distinct from the
 * reversible `SUSPEND` above) — it gets its own anonymized account-kind transparency-log row,
 * same as `suspendUser`.
 */
async function deleteUser(args: ParsedArgs, context: AdminContext): Promise<void> {
  const handle = handleArg(
    args,
    'Usage: user delete <handle> [--reason <text>] [--reason-category <category>]',
  );
  const reason = optionalStringOption(args.options, 'reason');
  const reasonCategory = parseReasonCategory(args);
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const { user, actor } = await findUserByHandle(manager, handle);
    if (user.status === 'DELETED') {
      throw new Error(`"${handle}" is already deleted.`);
    }

    const now = new Date();
    await manager
      .getRepository(User)
      .update({ id: user.id }, { status: 'DELETED', deletedAt: now });
    await manager.getRepository(Actor).update({ id: actor.id }, { deletedAt: now });

    // Same session/credential revocation `PrivacyService.requestAccountDeletion` does at
    // request time — belt and suspenders alongside the status flip above, which already blocks
    // `AuthGuard` (it only ever finds users with `deletedAt IS NULL`).
    await manager
      .getRepository(RefreshToken)
      .update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: now });
    await manager
      .getRepository(Credential)
      .update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: now });

    const deletionRequests = manager.getRepository(AccountDeletionRequest);
    const existing = await deletionRequests.findOne({ where: { actorId: actor.id } });
    if (existing === null || existing.cancelledAt !== null || existing.purgedAt !== null) {
      const purgeAfter = new Date(
        now.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT * 24 * 60 * 60 * 1000,
      );
      await deletionRequests.save(
        deletionRequests.create({
          actorId: actor.id,
          requestedAt: now,
          purgeAfter,
          cancelledAt: null,
          purgedAt: null,
        }),
      );
      const purgeJobType: JobType = 'PURGE_ACCOUNT';
      await manager.getRepository(OutboxJob).save(
        manager.getRepository(OutboxJob).create({
          type: purgeJobType,
          payload: { actorId: actor.id },
          availableAt: purgeAfter,
          idempotencyKey: `purge-account:${actor.id}:${now.toISOString()}`,
        }),
      );
    }

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'user.delete',
      subjectType: 'USER',
      subjectId: user.id,
      metadata: reason === undefined ? null : { reason },
    });

    await manager.getRepository(ModerationLogEntry).save(
      manager.getRepository(ModerationLogEntry).create({
        action: 'BAN',
        subjectKind: 'ACCOUNT',
        subjectDomain: null,
        reasonCategory,
        appealed: false,
      }),
    );

    await writeModerationNotification(manager, actor.id);
  });

  process.stdout.write(`${handle} deleted.\n`);
}

/**
 * Delivers the moderation notice a node enforcement action owes the affected actor (spec
 * §201.2) as a `MODERATION`-type `notifications` row — the bell that tells them to go look at
 * `ListMyModerationNotices`, not a second copy of the notice's content: the row carries no
 * actor/post/conversation/community reference and no text of its own (see `Notification.
 * actorId`'s doc comment: "null for a MODERATION notification with no attributable actor"), so
 * there is nothing here that could ever leak a moderator's identity or `moderator_note`. Unlike
 * `NotificationsService.create` (`apps/server/src/modules/notifications`, a different app —
 * the admin CLI has no gRPC/Nest dependency, spec §128–129), this always inserts: each
 * enforcement action is its own distinct, non-collapsible event, not a repeat of the same
 * social interaction `LIKE`/`REPLY` dedupe.
 */
async function writeModerationNotification(
  manager: EntityManager,
  recipientActorId: string,
): Promise<void> {
  await manager.getRepository(Notification).save(
    manager.getRepository(Notification).create({
      recipientActorId,
      type: 'MODERATION',
      actorId: null,
      postId: null,
      conversationId: null,
      communityId: null,
    }),
  );
}

/**
 * `user deletion-status <handle>` (P14-010 follow-up, spec §197.4) — read-only: the same
 * `account_deletion_requests` row `PrivacyService.getDeletionStatus` reads for the self-service
 * RPC, whether the pending deletion was requested by the actor themselves or by
 * `patches-admin user delete`.
 */
async function deletionStatus(args: ParsedArgs, context: AdminContext): Promise<void> {
  const handle = handleArg(args, 'Usage: user deletion-status <handle>');
  const { user, actor } = await findUserByHandle(context.dataSource, handle);
  const existing = await context.dataSource
    .getRepository(AccountDeletionRequest)
    .findOne({ where: { actorId: actor.id } });

  const row: Row =
    existing === null
      ? {
          handle,
          userStatus: user.status,
          pending: false,
          requestedAt: null,
          purgeAfter: null,
          cancelledAt: null,
          purgedAt: null,
        }
      : {
          handle,
          userStatus: user.status,
          pending: existing.cancelledAt === null && existing.purgedAt === null,
          requestedAt: existing.requestedAt,
          purgeAfter: existing.purgeAfter,
          cancelledAt: existing.cancelledAt,
          purgedAt: existing.purgedAt,
        };

  if (booleanOption(args.options, 'json')) {
    printJson(row);
  } else {
    printTable([row]);
  }
}

/**
 * `user cancel-deletion <handle>` (P14-010 follow-up, spec §197.4) — mirrors
 * `PrivacyService.cancelAccountDeletion`'s DB effects (cancel the still-pending
 * `account_deletion_requests` row, remove any still-`PENDING` `PURGE_ACCOUNT` job for this
 * cycle) so an operator can undo *either* a self-service `RequestAccountDeletion` or a
 * `patches-admin user delete`, restoring the account "intact" (§197.4) in both cases.
 *
 * `patches-admin user delete` (unlike the self-service RPC) also flips `users.status`/
 * `actors.deleted_at` immediately (see `deleteUser`'s doc comment) — this restores both when
 * they were set, rather than leaving the account soft-deleted with no deletion actually
 * pending behind it.
 */
async function cancelDeletion(args: ParsedArgs, context: AdminContext): Promise<void> {
  const handle = handleArg(args, 'Usage: user cancel-deletion <handle>');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const { user, actor } = await findUserByHandle(manager, handle);
    const deletionRequests = manager.getRepository(AccountDeletionRequest);
    const existing = await deletionRequests.findOne({ where: { actorId: actor.id } });
    if (existing === null || existing.cancelledAt !== null || existing.purgedAt !== null) {
      throw new Error(`"${handle}" has no pending account deletion to cancel.`);
    }

    existing.cancelledAt = new Date();
    await deletionRequests.save(existing);

    const purgeJobType: JobType = 'PURGE_ACCOUNT';
    await manager
      .getRepository(OutboxJob)
      .createQueryBuilder()
      .delete()
      .where('type = :type', { type: purgeJobType })
      .andWhere('status = :status', { status: 'PENDING' })
      .andWhere(`payload->>'actorId' = :actorId`, { actorId: actor.id })
      .execute();

    if (user.status === 'DELETED') {
      await manager
        .getRepository(User)
        .update({ id: user.id }, { status: 'ACTIVE', deletedAt: null });
      await manager.getRepository(Actor).update({ id: actor.id }, { deletedAt: null });
    }

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'user.cancel-deletion',
      subjectType: 'USER',
      subjectId: user.id,
    });
  });

  process.stdout.write(`${handle}'s pending account deletion has been cancelled.\n`);
}
