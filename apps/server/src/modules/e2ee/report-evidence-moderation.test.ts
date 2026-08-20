import { E2eeReportEvidence, E2eeReportEvidenceItem, Report } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { loadReportEvidenceForModeration } from './report-evidence-moderation.js';

interface Row {
  [key: string]: unknown;
}

/** Same bare in-memory `EntityManager` fake style as `report-evidence.test.ts`, plus a spy on
 * `AdminAuditLog.save` (rather than `appendAdminAuditLog` itself, which is `@patches/database`
 * code, not this module's) so tests can assert exactly what audit metadata was recorded. */
function fakeManager(tables: { report: Row | null; evidence: Row | null; items: Row[] }) {
  const auditSaves: Row[] = [];
  const repos = new Map<unknown, unknown>([
    [Report, { findOne: vi.fn().mockResolvedValue(tables.report) }],
    [E2eeReportEvidence, { findOne: vi.fn().mockResolvedValue(tables.evidence) }],
    [E2eeReportEvidenceItem, { find: vi.fn().mockResolvedValue(tables.items) }],
  ]);

  const manager = {
    getRepository: vi.fn((entity: unknown) => {
      // `appendAdminAuditLog` resolves `AdminAuditLog` by class identity, which this test file
      // cannot import without depending on `@patches/database`'s exact export — instead every
      // repository this fake doesn't otherwise recognize is treated as `AdminAuditLog`'s, since
      // `loadReportEvidenceForModeration` never calls `getRepository` with anything else besides
      // `Report`/`E2eeReportEvidence`/`E2eeReportEvidenceItem` and the audit log.
      const repo = repos.get(entity);
      if (repo !== undefined) return repo;
      return {
        create: vi.fn((row: Row) => row),
        save: vi.fn((row: Row) => {
          auditSaves.push(row);
          return Promise.resolve(row);
        }),
      };
    }),
  } as unknown as EntityManager;

  return { manager, auditSaves };
}

const REPORT_ROW: Row = { id: 'report-1', reporterActorId: 'reporter-actor' };
const EVIDENCE_ROW: Row = {
  reportId: 'report-1',
  verificationStatus: 'VERIFIED',
  verificationFailureCode: null,
  consentedAt: new Date('2026-08-19T00:00:00.000Z'),
  verifiedAt: new Date('2026-08-19T00:00:01.000Z'),
};
const ITEM_ROW: Row = {
  reportId: 'report-1',
  position: 0,
  logicalMessageId: 'msg-1',
  disclosedPlaintext: Buffer.from('the disclosed body'),
};

describe('loadReportEvidenceForModeration (ADR 0020 §9, P13-012)', () => {
  it('returns the disclosed evidence and records a content-free audit row', async () => {
    const { manager, auditSaves } = fakeManager({
      report: REPORT_ROW,
      evidence: EVIDENCE_ROW,
      items: [ITEM_ROW],
    });

    const view = await loadReportEvidenceForModeration(manager, 'report-1', 'moderator-1');

    expect(view.verificationStatus).toBe('VERIFIED');
    expect(view.items).toHaveLength(1);
    expect(Buffer.from(view.items[0]!.disclosedPlaintext).toString()).toBe('the disclosed body');

    // Exactly one audit row, and it never carries the plaintext the moderator just saw.
    expect(auditSaves).toHaveLength(1);
    const row = auditSaves[0]!;
    expect(row.adminUserId).toBe('moderator-1');
    expect(row.action).toBe('report.view_e2ee_evidence');
    expect(row.subjectType).toBe('REPORT');
    expect(row.subjectId).toBe('report-1');
    const metadata = JSON.stringify(row.metadata);
    expect(metadata).not.toContain('disclosed body');
    expect(row.metadata).toMatchObject({ itemCount: 1, verificationStatus: 'VERIFIED' });
  });

  it('rejects an unknown report id without writing an audit row', async () => {
    const { manager, auditSaves } = fakeManager({ report: null, evidence: null, items: [] });

    await expect(loadReportEvidenceForModeration(manager, 'nope', 'moderator-1')).rejects.toThrow(
      AppError,
    );
    expect(auditSaves).toHaveLength(0);
  });

  it('rejects a report with no attached evidence without writing an audit row', async () => {
    const { manager, auditSaves } = fakeManager({
      report: REPORT_ROW,
      evidence: null,
      items: [],
    });

    await expect(
      loadReportEvidenceForModeration(manager, 'report-1', 'moderator-1'),
    ).rejects.toThrow(AppError);
    expect(auditSaves).toHaveLength(0);
  });
});
