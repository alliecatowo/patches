import { appendAdminAuditLog, Post } from '@patches/database';

import { requirePositional, requireStringOption, type ParsedArgs } from '../cli/arg-parser.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';

/** `post remove <id> --reason <text>` (spec §65). */
export async function runPostCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  if (action !== 'remove') {
    throw new Error(`Unknown "post" action "${action}". Try remove.`);
  }

  const id = requirePositional(args.positionals, 2, 'Usage: post remove <id> --reason <text>');
  const reason = requireStringOption(args.options, 'reason');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(Post);
    const post = await repository.findOne({ where: { id } });
    if (post === null) throw new Error(`Post "${id}" not found.`);
    if (post.deletedAt !== null) throw new Error(`Post "${id}" is already removed.`);

    // Same tombstone shape as an author self-delete (§25) — `removedByUserId` is what tells
    // an operator removal apart from that, both here and wherever a post is rendered.
    await repository.update(
      { id },
      { deletedAt: new Date(), removedByUserId: operatorUserId, removalReason: reason },
    );

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'post.remove',
      subjectType: 'POST',
      subjectId: id,
      metadata: { reason },
    });
  });

  process.stdout.write(`Post ${id} removed.\n`);
}
