import { AdminAuditLog } from '@patches/database';

import {
  booleanOption,
  optionalIntOption,
  optionalStringOption,
  parseIsoDate,
  type ParsedArgs,
} from '../cli/arg-parser.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext } from '../context.js';

const DEFAULT_LIMIT = 50;

/**
 * `audit-log list` (spec §158, #172) — the read-side companion to `appendAdminAuditLog`. Every
 * mutating `patches-admin` command already writes an `admin_audit_log` row (§66); this is the
 * first general-purpose CLI surface to list them, rather than the incidental single-row lookup
 * `appeal inspect` does for report-driven suspensions only. Newest-first with `LIMIT`, no
 * `OFFSET` (spec §153 bars offset pagination even here, where there is no gRPC page token to
 * carry a cursor) — a caller wanting older rows narrows with `--since` instead.
 */
export async function runAuditLogCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'list':
      return listAuditLog(args, context);
    default:
      throw new Error(`Unknown "audit-log" action "${action}". Try list.`);
  }
}

async function listAuditLog(args: ParsedArgs, context: AdminContext): Promise<void> {
  const actorId = optionalStringOption(args.options, 'actor');
  const adminId = optionalStringOption(args.options, 'admin');
  const sinceRaw = optionalStringOption(args.options, 'since');
  const since = sinceRaw === undefined ? undefined : parseIsoDate(sinceRaw, 'since');
  const limit = optionalIntOption(args.options, 'limit') ?? DEFAULT_LIMIT;

  const query = context.dataSource
    .getRepository(AdminAuditLog)
    .createQueryBuilder('log')
    .orderBy('log.createdAt', 'DESC')
    .addOrderBy('log.id', 'DESC')
    .limit(limit);

  // `--actor` filters on the row's subject (the account/invite/post/etc the action was about),
  // `--admin` on the operator who performed it — the two ids `admin_audit_log` actually has,
  // named the way an operator reading `docs/operations/moderation.md` would expect.
  if (actorId !== undefined) {
    query.andWhere('log.subjectId = :actorId', { actorId });
  }
  if (adminId !== undefined) {
    query.andWhere('log.adminUserId = :adminId', { adminId });
  }
  if (since !== undefined) {
    query.andWhere('log.createdAt >= :since', { since });
  }

  const rows = await query.getMany();
  const table: Row[] = rows.map((log) => ({
    time: log.createdAt,
    admin: log.adminUserId,
    action: log.action,
    target: `${log.subjectType}:${log.subjectId}`,
    reason: extractReason(log.metadata),
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}

/** `metadata.reason` is the convention every mutating command already follows (`user.suspend`,
 * `domain.block`, ...) — not every action writes one (`user.unsuspend` has no reason to give),
 * so this prints blank rather than throwing or dumping the whole `metadata` blob. */
function extractReason(metadata: Record<string, unknown> | null): string {
  if (metadata === null) return '';
  const reason = metadata.reason;
  return typeof reason === 'string' ? reason : '';
}
