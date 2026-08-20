import {
  Actor,
  appendAdminAuditLog,
  E2eeReportEvidence,
  E2eeReportEvidenceItem,
  ModerationLogEntry,
  Notification,
  Post,
  Report,
  User,
  type ModerationReasonCategory,
  type ReportReason,
} from '@patches/database';
import type { EntityManager } from 'typeorm';

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
  const id = requirePositional(args.positionals, 2, 'Usage: report show <id> [--reveal-evidence]');
  const revealEvidence = booleanOption(args.options, 'reveal-evidence');
  const asJson = booleanOption(args.options, 'json');

  // `--reveal-evidence` is a deliberate moderator disclosure of reporter-submitted E2EE
  // plaintext (ADR 0020 §9), so it is attributed and audited exactly like `report resolve`
  // — an operator must be identified even though a bare `report show` is a read anyone running
  // this CLI can do.
  const operatorUserId = revealEvidence ? await requireOperatorUserId(context) : undefined;

  const { report, evidence } = await context.dataSource.transaction(async (manager) => {
    const found = await manager.getRepository(Report).findOne({ where: { id } });
    if (found === null) throw new Error(`Report "${id}" not found.`);
    if (!revealEvidence || operatorUserId === undefined) return { report: found, evidence: null };

    const view = await loadReportEvidenceForModeration(manager, id, operatorUserId);
    return { report: found, evidence: view };
  });

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

  if (evidence === null) {
    if (asJson) {
      printJson(row);
    } else {
      printTable([row]);
    }
    return;
  }

  const itemRows: Row[] = evidence.items.map((item) => ({
    position: item.position,
    logicalMessageId: item.logicalMessageId,
    disclosedPlaintext: Buffer.from(item.disclosedPlaintext).toString('utf8'),
  }));

  if (asJson) {
    printJson({
      ...row,
      evidence: {
        verificationStatus: evidence.verificationStatus,
        verificationFailureCode: evidence.verificationFailureCode,
        consentedAt: evidence.consentedAt,
        verifiedAt: evidence.verifiedAt,
        items: itemRows,
      },
    });
  } else {
    printTable([row]);
    printTable([
      {
        verificationStatus: evidence.verificationStatus,
        verificationFailureCode: evidence.verificationFailureCode,
        consentedAt: evidence.consentedAt,
        verifiedAt: evidence.verifiedAt,
      },
    ]);
    printTable(itemRows);
  }
}

/**
 * Moderator-only read of reporter-disclosed E2EE evidence (ADR 0020 §9, spec §65: moderator
 * actions belong in the admin CLI, never a user-facing gRPC RPC). Mirrors
 * `apps/server/src/modules/e2ee/report-evidence-moderation.ts`'s `loadReportEvidenceForModeration`
 * exactly — same lookups, same content-free `admin_audit_log` row in the same transaction as the
 * read — but duplicated rather than imported, since `apps/admin` never depends on `apps/server`
 * (each app owns its own boundary reads of the same tables, the layering
 * `docs/agents/PACKAGE_CONVENTIONS.md` draws between every app; see `labeler.ts`'s identical
 * duplication of `label-validation.ts`'s schema for the same reasoning).
 *
 * Throws if the report or its attached evidence does not exist, before writing any audit row —
 * "a moderator looked" is only ever recorded once they actually received data.
 */
async function loadReportEvidenceForModeration(
  manager: EntityManager,
  reportId: string,
  moderatorUserId: string,
): Promise<{
  verificationStatus: string;
  verificationFailureCode: string | null;
  consentedAt: Date;
  verifiedAt: Date | null;
  items: { position: number; logicalMessageId: string; disclosedPlaintext: Uint8Array }[];
}> {
  const evidence = await manager.getRepository(E2eeReportEvidence).findOne({ where: { reportId } });
  if (evidence === null) {
    throw new Error(`Report "${reportId}" has no E2EE evidence attached.`);
  }

  const itemRows = await manager
    .getRepository(E2eeReportEvidenceItem)
    .find({ where: { reportId }, order: { position: 'ASC' } });

  await appendAdminAuditLog(manager, {
    adminUserId: moderatorUserId,
    action: 'report.view_e2ee_evidence',
    subjectType: 'REPORT',
    subjectId: reportId,
    metadata: {
      itemCount: itemRows.length,
      verificationStatus: evidence.verificationStatus,
      verificationFailureCode: evidence.verificationFailureCode,
    },
  });

  return {
    verificationStatus: evidence.verificationStatus,
    verificationFailureCode: evidence.verificationFailureCode,
    consentedAt: evidence.consentedAt,
    verifiedAt: evidence.verifiedAt,
    items: itemRows.map((item) => ({
      position: item.position,
      logicalMessageId: item.logicalMessageId,
      disclosedPlaintext: new Uint8Array(item.disclosedPlaintext),
    })),
  };
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
      const post = await manager
        .getRepository(Post)
        .findOne({ where: { id: report.subjectPostId } });
      if (post === null) {
        throw new Error(`Report "${id}"'s subject post no longer exists.`);
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
      // The moderation notice (spec §201.2) goes to the post's author, not the reporter —
      // reports remain not public (§64), so only the acted-upon actor learns anything happened.
      await writeModerationNotification(manager, post.authorActorId);
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
      await writeModerationNotification(manager, actor.id);
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

/**
 * Delivers the moderation notice a node enforcement action owes the affected actor (spec
 * §201.2) as a `MODERATION`-type `notifications` row — a content-free bell pointing the
 * recipient at `ListMyModerationNotices`, never a second copy of the notice's explanation or
 * anything that could identify the moderator or the reporter (§55, §64: reports stay private).
 * Duplicated from `apps/admin/src/commands/user.ts`'s identical helper rather than shared —
 * these are two independently ownable, single-purpose CLI command files (see
 * `parseReasonCategory`'s doc comment in `user.ts` for the same reasoning).
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
