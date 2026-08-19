import {
  AccountDeletionRequest,
  Actor,
  appendAdminAuditLog,
  Credential,
  OutboxJob,
  RefreshToken,
  User,
  type JobType,
} from '@patches/database';
import { ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT } from '@patches/domain';
import { IsNull } from 'typeorm';

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

/** `user list|show|suspend|unsuspend|delete` (spec §65). */
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
    default:
      throw new Error(
        `Unknown "user" action "${action}". Try list, show, suspend, unsuspend, or delete.`,
      );
  }
}

function handleArg(args: ParsedArgs, usage: string): string {
  return requirePositional(args.positionals, 2, usage);
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
  const handle = handleArg(args, 'Usage: user suspend <handle> --reason <text>');
  const reason = requireStringOption(args.options, 'reason');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const { user } = await findUserByHandle(manager, handle);
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
 */
async function deleteUser(args: ParsedArgs, context: AdminContext): Promise<void> {
  const handle = handleArg(args, 'Usage: user delete <handle> [--reason <text>]');
  const reason = optionalStringOption(args.options, 'reason');
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
  });

  process.stdout.write(`${handle} deleted.\n`);
}
