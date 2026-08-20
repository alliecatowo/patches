import {
  appendAdminAuditLog,
  E2eeReportEvidence as E2eeReportEvidenceEntity,
  E2eeReportEvidenceItem as E2eeReportEvidenceItemEntity,
  Report,
} from '@patches/database';
import type { EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';

/**
 * One disclosed item, exactly as a moderator needs to review it (ADR 0020 §9's "moderator UI
 * must say that even verified context is reporter-selected and may omit provocation"). This is
 * a DTO, never the `E2eeReportEvidenceItem` entity — the entity's `Buffer` columns and internal
 * shape are a persistence detail, not a contract this module owes a caller (spec §128–129).
 */
export interface E2eeModerationEvidenceItemView {
  position: number;
  logicalMessageId: string;
  disclosedPlaintext: Uint8Array;
}

/**
 * The full moderator-facing view of one report's E2EE evidence: the node's verification
 * decision plus every item the reporter disclosed. This is the *only* function in the codebase
 * that reads `disclosed_plaintext` back out for human consumption — every other reader of
 * `e2ee_report_evidence_items` (`attachReportEvidence` itself) only ever writes it.
 */
export interface E2eeModerationEvidenceView {
  reportId: string;
  verificationStatus: string;
  verificationFailureCode: string | null;
  consentedAt: Date;
  verifiedAt: Date | null;
  items: E2eeModerationEvidenceItemView[];
}

/**
 * Loads reporter-disclosed E2EE evidence for moderation review and, in the same transaction,
 * appends an `admin_audit_log` row recording that a moderator saw it (ADR 0020 §9, task
 * P13-012). This is the audit trail's second leg: `attachReportEvidence` already durably
 * records *who submitted what evidence and when* (`e2ee_report_evidence`/`_items`,
 * `consentedAt`); this records *that a moderator subsequently looked at it*, using the same
 * `admin_audit_log` mechanism `apps/admin` already writes for `report.resolve` — one audit
 * table, not a parallel one (spec §65–66).
 *
 * The audit row's `metadata` deliberately carries only `itemCount`/`verificationStatus`/
 * `verificationFailureCode` — never `disclosedPlaintext` or any other content, matching
 * `AdminAuditLog`'s own contract ("never a secret") and ADR 0020 §1.5 ("no ... exception ...
 * receives an E2EE body except that explicit report evidence" — the evidence table itself is
 * the one authorized copy; the audit log is not a second one).
 *
 * Not yet wired to a transport: no `ModerationService` RPC exposes moderator-only reads (its
 * own doc comment: "spec §65 puts \[moderator actions\] in the admin CLI, not a user-facing
 * gRPC service"), and `apps/admin` is a different task's file ownership. This function is the
 * complete, independently testable application-layer piece a future admin-CLI `report show
 * --reveal-evidence` command calls.
 */
export async function loadReportEvidenceForModeration(
  manager: EntityManager,
  reportId: string,
  moderatorUserId: string,
): Promise<E2eeModerationEvidenceView> {
  const report = await manager.getRepository(Report).findOne({ where: { id: reportId } });
  if (report === null) throw AppError.validation('Report not found.');

  const evidence = await manager
    .getRepository(E2eeReportEvidenceEntity)
    .findOne({ where: { reportId } });
  if (evidence === null) {
    throw AppError.validation('No E2EE evidence has been attached to this report.');
  }

  const itemRows = await manager
    .getRepository(E2eeReportEvidenceItemEntity)
    .find({ where: { reportId }, order: { position: 'ASC' } });

  // Recorded before returning data to the caller, in the same manager/transaction as the read
  // it describes, so "a moderator viewed this evidence but the CLI crashed before the audit
  // row landed" and "the audit row exists but the moderator never actually got the data" are
  // both impossible outcomes (same reasoning as `appendAdminAuditLog`'s own doc comment).
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
    reportId,
    verificationStatus: evidence.verificationStatus,
    verificationFailureCode: evidence.verificationFailureCode,
    consentedAt: evidence.consentedAt,
    verifiedAt: evidence.verifiedAt,
    items: itemRows.map((row) => ({
      position: row.position,
      logicalMessageId: row.logicalMessageId,
      disclosedPlaintext: new Uint8Array(row.disclosedPlaintext),
    })),
  };
}
