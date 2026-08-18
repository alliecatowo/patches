import { appendAdminAuditLog, Invite } from '@patches/database';

import {
  booleanOption,
  optionalIntOption,
  optionalStringOption,
  type ParsedArgs,
  parseIsoDate,
  requirePositional,
} from '../cli/arg-parser.js';
import { generateInviteCode, hashInviteCode } from '../cli/crypto.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';

/** `invite create|list|revoke` (spec §65). */
export async function runInviteCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'create':
      return createInvite(args, context);
    case 'list':
      return listInvites(args, context);
    case 'revoke':
      return revokeInvite(args, context);
    default:
      throw new Error(`Unknown "invite" action "${action}". Try create, list, or revoke.`);
  }
}

async function createInvite(args: ParsedArgs, context: AdminContext): Promise<void> {
  const maxUses = optionalIntOption(args.options, 'max-uses') ?? 1;
  const expiresRaw = optionalStringOption(args.options, 'expires');
  const expiresAt = expiresRaw === undefined ? null : parseIsoDate(expiresRaw, 'expires');
  const operatorUserId = await requireOperatorUserId(context);

  // The plaintext code exists only in this process's memory and in the one line printed
  // below — only its hash is ever written to the database (§66's "never log ... a reset
  // code" applies equally to an invite code, and the CLI's own stdout is the one place it is
  // allowed to appear, exactly once).
  const code = generateInviteCode();

  const invite = await context.dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(Invite);
    const row = await repository.save(
      repository.create({
        codeHash: hashInviteCode(code),
        createdByUserId: operatorUserId,
        maxUses,
        expiresAt,
      }),
    );

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'invite.create',
      subjectType: 'INVITE',
      subjectId: row.id,
      metadata: { maxUses, expiresAt: expiresAt === null ? null : expiresAt.toISOString() },
    });

    return row;
  });

  if (booleanOption(args.options, 'json')) {
    printJson({
      id: invite.id,
      code,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt === null ? null : invite.expiresAt.toISOString(),
    });
    return;
  }

  process.stdout.write(`Invite code (shown once): ${code}\n`);
  printTable([
    { id: invite.id, maxUses: invite.maxUses, expiresAt: invite.expiresAt } satisfies Row,
  ]);
}

async function listInvites(args: ParsedArgs, context: AdminContext): Promise<void> {
  const rows = await context.dataSource
    .getRepository(Invite)
    .createQueryBuilder('invite')
    .orderBy('invite.createdAt', 'DESC')
    .limit(100)
    .getMany();

  const table: Row[] = rows.map((invite) => ({
    id: invite.id,
    uses: `${String(invite.uses)}/${String(invite.maxUses)}`,
    revoked: invite.revokedAt !== null,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}

async function revokeInvite(args: ParsedArgs, context: AdminContext): Promise<void> {
  const id = requirePositional(args.positionals, 2, 'Usage: invite revoke <id>');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const result = await manager
      .getRepository(Invite)
      .createQueryBuilder()
      .update(Invite)
      .set({ revokedAt: new Date() })
      .where('id = :id', { id })
      .andWhere('revoked_at IS NULL')
      .execute();

    if (result.affected !== 1) {
      throw new Error(`Invite "${id}" was not found, or is already revoked.`);
    }

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'invite.revoke',
      subjectType: 'INVITE',
      subjectId: id,
    });
  });

  process.stdout.write(`Invite ${id} revoked.\n`);
}
