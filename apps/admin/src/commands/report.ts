import {
  Actor,
  appendAdminAuditLog,
  ModerationLogEntry,
  Post,
  Report,
  User,
  type ModerationReasonCategory,
  type ReportReason,
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

const RESOLVE_ACTIONS = ['none', 'remove-post', 'suspend'] as const;
type ResolveAction = (typeof RESOLVE_ACTIONS)[number];

/** `reports.reason` → `moderation_log_entries.reason_category` (spec §201.4, §202): the two
 * enums are separately declared (`REPORT_REASONS`/`MODERATION_REASON_CATEGORIES` in
 * `packages/database/src/entities/enums.ts`) but describe the same underlying guideline
 * categories, so a report-driven enforcement action publishes the closest match rather than
 * always falling back to `OTHER`. Only `HATE_SPEECH` needs renaming; everything else is an
 * identical string. */
const REPORT_REASON_TO_MODERATION_CATEGORY: Readonly<
  Record<ReportReason, ModerationReasonCategory>
> = Object.freeze({
  SPAM: 'SPAM',
  HARASSMENT: 'HARASSMENT',
  HATE_SPEECH: 'HATE',
  ILLEGAL_CONTENT: 'ILLEGAL_CONTENT',
  IMPERSONATION: 'IMPERSONATION',
  OTHER: 'OTHER',
});

/** `report list|show|resolve` (spec §64–65). */
export async function runReportCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'list':
      return listReports(args, context);
    case 'show':
      return showReport(args, context);
    case 'resolve':
      return resolveReport(args, context);
    default:
      throw new Error(`Unknown "report" action "${action}". Try list, show, or resolve.`);
  }
}

async function listReports(args: ParsedArgs, context: AdminContext): Promise<void> {
  const status = optionalStringOption(args.options, 'status');
  const query = context.dataSource
    .getRepository(Report)
    .createQueryBuilder('report')
    .orderBy('report.createdAt', 'DESC')
    .limit(100);

  if (status !== undefined) {
    query.andWhere('report.status = :status', { status: status.toUpperCase() });
  }

  const rows = await query.getMany();
  const table: Row[] = rows.map((report) => ({
    id: report.id,
    status: report.status,
    subjectType: report.subjectType,
    reason: report.reason,
    createdAt: report.createdAt,
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}

async function showReport(args: ParsedArgs, context: AdminContext): Promise<void> {
  const id = requirePositional(args.positionals, 2, 'Usage: report show <id>');
  const report = await context.dataSource.getRepository(Report).findOne({ where: { id } });
  if (report === null) throw new Error(`Report "${id}" not found.`);

  const row: Row = {
    id: report.id,
    status: report.status,
    subjectType: report.subjectType,
    subjectActorId: report.subjectActorId,
    subjectPostId: report.subjectPostId,
    subjectGuestbookEntryId: report.subjectGuestbookEntryId,
    reason: report.reason,
    details: report.details,
    moderatorNote: report.moderatorNote,
    createdAt: report.createdAt,
    resolvedAt: report.resolvedAt,
  };

  if (booleanOption(args.options, 'json')) {
    printJson(row);
  } else {
    printTable([row]);
  }
}

async function resolveReport(args: ParsedArgs, context: AdminContext): Promise<void> {
  const id = requirePositional(
    args.positionals,
    2,
    'Usage: report resolve <id> --action <none|remove-post|suspend> [--note <text>]',
  );
  const actionRaw = requireStringOption(args.options, 'action');
  if (!RESOLVE_ACTIONS.includes(actionRaw as ResolveAction)) {
    throw new Error(`--action must be one of: ${RESOLVE_ACTIONS.join(', ')}.`);
  }
  const resolveAction = actionRaw as ResolveAction;
  const note = optionalStringOption(args.options, 'note');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const report = await manager.getRepository(Report).findOne({ where: { id } });
    if (report === null) throw new Error(`Report "${id}" not found.`);
    if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
      throw new Error(`Report "${id}" is already ${report.status.toLowerCase()}.`);
    }

    // The public, anonymized transparency-log entry for a report-driven enforcement action
    // (spec §201.4) — same `moderation_log_entries` shape `patches-admin domain block`/
    // `user suspend`/`user delete` write, closed reason-category vocabulary mapped from the
    // report's own `reason` (`REPORT_REASON_TO_MODERATION_CATEGORY`). `none` resolves the
    // report without taking an enforcement action, so it gets no log entry — same as
    // `report resolve`'s existing `admin_audit_log` row, which is written unconditionally
    // below regardless of `resolveAction`.
    const reasonCategory = REPORT_REASON_TO_MODERATION_CATEGORY[report.reason];
    if (resolveAction === 'remove-post') {
      if (report.subjectPostId === null) {
        throw new Error('--action remove-post requires a report whose subject is a POST.');
      }
      await manager.getRepository(Post).update(
        { id: report.subjectPostId },
        {
          deletedAt: new Date(),
          removedByUserId: operatorUserId,
          removalReason: note ?? 'Removed following a moderation report.',
        },
      );
      await manager.getRepository(ModerationLogEntry).save(
        manager.getRepository(ModerationLogEntry).create({
          action: 'POST_REMOVAL',
          subjectKind: 'POST',
          subjectDomain: null,
          reasonCategory,
          appealed: false,
        }),
      );
    } else if (resolveAction === 'suspend') {
      if (report.subjectActorId === null) {
        throw new Error('--action suspend requires a report whose subject is an ACTOR.');
      }
      const actor = await manager
        .getRepository(Actor)
        .findOne({ where: { id: report.subjectActorId } });
      if (actor === null || actor.userId === null) {
        throw new Error('The reported actor has no local account to suspend.');
      }
      await manager.getRepository(User).update({ id: actor.userId }, { status: 'SUSPENDED' });
      await manager.getRepository(ModerationLogEntry).save(
        manager.getRepository(ModerationLogEntry).create({
          action: 'SUSPEND',
          subjectKind: 'ACCOUNT',
          subjectDomain: null,
          reasonCategory,
          appealed: false,
        }),
      );
    }

    await manager.getRepository(Report).update(
      { id },
      {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedByUserId: operatorUserId,
        moderatorNote: note ?? null,
      },
    );

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'report.resolve',
      subjectType: 'REPORT',
      subjectId: id,
      metadata: { resolveAction, note: note ?? null },
    });
  });

  process.stdout.write(`Report ${id} resolved (${resolveAction}).\n`);
}
