import {
  Actor,
  AdminAuditLog,
  Appeal,
  appendAdminAuditLog,
  type AppealStatus,
} from '@patches/database';

import {
  booleanOption,
  optionalStringOption,
  type ParsedArgs,
  requirePositional,
  requireStringOption,
} from '../cli/arg-parser.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';

const RESOLVE_OUTCOMES = ['upheld', 'overturned', 'modified'] as const;
type ResolveOutcome = (typeof RESOLVE_OUTCOMES)[number];
const OUTCOME_TO_STATUS: Readonly<Record<ResolveOutcome, AppealStatus>> = {
  upheld: 'UPHELD',
  overturned: 'OVERTURNED',
  modified: 'MODIFIED',
};

/**
 * `appeal list|inspect|resolve` (spec §201.3, §204, §65) — extends the existing
 * `admin_audit_log`/`report resolve` table rather than inventing a parallel one. Resolution
 * updates the `appeals` row directly (never the underlying enforcement action — an appeal
 * "never triggers an automated content change", spec §206: an admin who overturns a suspension
 * still runs `user unsuspend` separately) and writes its own `admin_audit_log` row, since
 * "an appeal outcome is an enforcement-adjacent action and gets the same accountability trail
 * the original action did" (spec §201.3).
 */
export async function runAppealCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'list':
      return listAppeals(args, context);
    case 'inspect':
      return inspectAppeal(args, context);
    case 'resolve':
      return resolveAppeal(args, context);
    default:
      throw new Error(`Unknown "appeal" action "${action}". Try list, inspect, or resolve.`);
  }
}

async function listAppeals(args: ParsedArgs, context: AdminContext): Promise<void> {
  const status = optionalStringOption(args.options, 'status');
  const query = context.dataSource
    .getRepository(Appeal)
    .createQueryBuilder('appeal')
    .leftJoinAndSelect('appeal.actor', 'actor')
    .orderBy('appeal.createdAt', 'DESC')
    .limit(100);

  if (status !== undefined) {
    query.andWhere('appeal.status = :status', { status: status.toUpperCase() });
  }

  const rows = await query.getMany();
  const table: Row[] = rows.map((appeal) => ({
    id: appeal.id,
    handle: appeal.actor.handle,
    status: appeal.status,
    moderationNoticeId: appeal.adminAuditLogId,
    createdAt: appeal.createdAt,
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}

async function inspectAppeal(args: ParsedArgs, context: AdminContext): Promise<void> {
  const id = requirePositional(args.positionals, 2, 'Usage: appeal inspect <id>');
  const appeal = await context.dataSource
    .getRepository(Appeal)
    .findOne({ where: { id }, relations: { actor: true } });
  if (appeal === null) throw new Error(`Appeal "${id}" not found.`);

  // The underlying enforcement action, for moderator context — same row `ModerationNotice`
  // (`ListMyModerationNotices`) projects from, read here directly since the admin CLI talks to
  // PostgreSQL, not gRPC (spec §65).
  const auditLog = await context.dataSource
    .getRepository(AdminAuditLog)
    .findOne({ where: { id: appeal.adminAuditLogId } });

  const row: Row = {
    id: appeal.id,
    handle: appeal.actor.handle,
    status: appeal.status,
    statement: appeal.statement,
    createdAt: appeal.createdAt,
    resolvedAt: appeal.resolvedAt,
    resolvedByUserId: appeal.resolvedByUserId,
    resolutionReason: appeal.resolutionReason,
    moderationNoticeId: appeal.adminAuditLogId,
    moderationAction: auditLog?.action ?? '(admin_audit_log row not found)',
    moderationMetadata:
      auditLog?.metadata === null || auditLog?.metadata === undefined
        ? ''
        : JSON.stringify(auditLog.metadata),
  };

  if (booleanOption(args.options, 'json')) {
    printJson(row);
  } else {
    printTable([row]);
  }
}

async function resolveAppeal(args: ParsedArgs, context: AdminContext): Promise<void> {
  const id = requirePositional(
    args.positionals,
    2,
    'Usage: appeal resolve <id> --outcome <upheld|overturned|modified> --reason <text>',
  );
  const outcomeRaw = requireStringOption(args.options, 'outcome');
  if (!RESOLVE_OUTCOMES.includes(outcomeRaw as ResolveOutcome)) {
    throw new Error(`--outcome must be one of: ${RESOLVE_OUTCOMES.join(', ')}.`);
  }
  const outcome = outcomeRaw as ResolveOutcome;
  const reason = requireStringOption(args.options, 'reason');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const appeal = await manager.getRepository(Appeal).findOne({ where: { id } });
    if (appeal === null) throw new Error(`Appeal "${id}" not found.`);
    if (appeal.status !== 'OPEN') {
      throw new Error(`Appeal "${id}" is already ${appeal.status.toLowerCase()}.`);
    }

    const status = OUTCOME_TO_STATUS[outcome];
    await manager.getRepository(Appeal).update(
      { id },
      {
        status,
        resolvedAt: new Date(),
        resolvedByUserId: operatorUserId,
        resolutionReason: reason,
      },
    );

    // Resolution is itself an enforcement-adjacent action and gets the same accountability
    // trail the original action did (spec §201.3, §66). `subjectType: 'USER'` mirrors
    // `user.suspend`/`user.delete` above rather than inventing an `APPEAL` subject type — the
    // appellant's own `user_id` is the natural subject of "your appeal was resolved".
    const appellant = await manager.getRepository(Actor).findOne({ where: { id: appeal.actorId } });
    if (appellant === null || appellant.userId === null) {
      throw new Error('The appellant has no local account to attribute this resolution to.');
    }
    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'appeal.resolve',
      subjectType: 'USER',
      subjectId: appellant.userId,
      metadata: { appealId: id, moderationNoticeId: appeal.adminAuditLogId, outcome, reason },
    });
  });

  process.stdout.write(`Appeal ${id} resolved (${outcome}).\n`);
}
