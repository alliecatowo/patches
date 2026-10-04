import { appendAdminAuditLog, InviteRequest } from '@patches/database';
import { IsNull } from 'typeorm';

import { booleanOption, type ParsedArgs, requirePositional } from '../cli/arg-parser.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';

/** Strips anything a terminal could interpret (ESC sequences, bidi overrides) from text a
 * stranger typed into the landing page. */
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** `invite-requests list|handle` (ADR 0044): the landing-page invite request queue. */
export async function runInviteRequestsCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'list':
      return listRequests(args, context);
    case 'handle':
      return handleRequest(args, context);
    default:
      throw new Error(`Unknown "invite-requests" action "${action}". Try list or handle.`);
  }
}

async function listRequests(args: ParsedArgs, context: AdminContext): Promise<void> {
  const rows = await context.dataSource.getRepository(InviteRequest).find({
    where: { handledAt: IsNull() },
    order: { createdAt: 'ASC' },
    take: 200,
  });
  const table: Row[] = rows.map((request) => ({
    id: request.id,
    createdAt: request.createdAt,
    contact: request.contact.replace(UNSAFE, ''),
    message: (request.message ?? '').replace(UNSAFE, ''),
  }));
  if (booleanOption(args.options, 'json')) printJson(table);
  else printTable(table);
}

async function handleRequest(args: ParsedArgs, context: AdminContext): Promise<void> {
  const id = requirePositional(args.positionals, 2, 'Usage: invite-requests handle <id>');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const result = await manager
      .getRepository(InviteRequest)
      .createQueryBuilder()
      .update(InviteRequest)
      .set({ handledAt: new Date() })
      .where('id = :id', { id })
      .andWhere('handled_at IS NULL')
      .execute();
    if (result.affected !== 1) {
      throw new Error(`Invite request "${id}" was not found, or is already handled.`);
    }
    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'invite_request.handle',
      subjectType: 'INVITE',
      subjectId: id,
    });
  });

  process.stdout.write(`Invite request ${id} marked handled.\n`);
}
