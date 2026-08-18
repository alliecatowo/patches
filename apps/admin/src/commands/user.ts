import { Actor, appendAdminAuditLog, User } from '@patches/database';

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

/** Soft delete (spec §25's tombstone convention, applied to the account): `users.status`
 * flips to `DELETED` and both `users.deleted_at`/`actors.deleted_at` are set, mirroring how
 * `PostService`/`patches-admin post remove` tombstone a post rather than destroying the row. */
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
