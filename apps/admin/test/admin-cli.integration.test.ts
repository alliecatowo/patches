import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AdminAuditLog,
  Appeal,
  DomainBlock,
  E2eeReportEvidence,
  E2eeReportEvidenceItem,
  Invite,
  Labeler,
  ModerationLogEntry,
  OutboxJob,
  Post,
  Report,
  User,
  appendAdminAuditLog,
} from '@patches/database';
import { createTestPost, createTestReport, createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { requirePositional } from '../src/cli/arg-parser.js';
import { hashInviteCode } from '../src/cli/crypto.js';
import { runAppealCommand } from '../src/commands/appeal.js';
import { runDomainCommand } from '../src/commands/domain.js';
import { runInviteCommand } from '../src/commands/invite.js';
import { runJobsCommand } from '../src/commands/jobs.js';
import { runLabelerCommand } from '../src/commands/labeler.js';
import { runPostCommand } from '../src/commands/post.js';
import { runReportCommand } from '../src/commands/report.js';
import { runUserCommand } from '../src/commands/user.js';
import { type AdminContext, requireOperatorUserId } from '../src/context.js';
import { createAdminTestDataSource } from './support/database.js';

/**
 * `apps/admin`'s CLI commands, end to end against a real PostgreSQL database (P6-003,
 * `INITIAL_VISION.md` §65). Exercises the command handlers directly rather than spawning
 * `dist/main.js` as a subprocess — the handlers are the unit under test, `main.ts` is just
 * `argv` parsing + dispatch (covered separately by `cli/arg-parser.test.ts`).
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/admin] Skipping admin CLI integration tests: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'patches-admin commands (integration)',
  () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = await createAdminTestDataSource();
    }, 60_000);

    afterAll(async () => {
      await dataSource.destroy();
    });

    function context(operatorHandle?: string): Promise<AdminContext> {
      return Promise.resolve({ dataSource, operatorHandle });
    }

    function silence(): { restore: () => void } {
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      return { restore: () => spy.mockRestore() };
    }

    function captureStdout(): { text: () => string; restore: () => void } {
      const chunks: string[] = [];
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        chunks.push(String(chunk));
        return true;
      });
      return { text: () => chunks.join(''), restore: () => spy.mockRestore() };
    }

    async function latestAuditLog(subjectType: string, subjectId: string): Promise<AdminAuditLog> {
      const row = await dataSource.getRepository(AdminAuditLog).findOne({
        where: { subjectType: subjectType as never, subjectId },
        order: { createdAt: 'DESC' },
      });
      if (row === null) throw new Error(`no admin_audit_log row for ${subjectType}:${subjectId}`);
      return row;
    }

    it('requireOperatorUserId refuses to proceed without --as or PATCHES_ADMIN_OPERATOR', async () => {
      const noOperator = await context(undefined);
      await expect(requireOperatorUserId(noOperator)).rejects.toThrow(/No operator identified/);
    });

    describe('invite create/list/revoke', () => {
      it('mints a code whose hash matches AuthService.consumeInvite, and audits it', async () => {
        const { user: operator, actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}`,
        });
        const ctx = await context(operatorActor.handle);

        const capture = captureStdout();
        await runInviteCommand(
          'create',
          { positionals: ['invite', 'create'], options: { 'max-uses': '3' } },
          ctx,
        );
        capture.restore();

        const printedCode = /Invite code \(shown once\): (\S+)/.exec(capture.text())?.[1];
        expect(printedCode).toBeDefined();

        const invite = await dataSource
          .getRepository(Invite)
          .findOneByOrFail({ codeHash: hashInviteCode(printedCode ?? '') });
        expect(invite.maxUses).toBe(3);
        expect(invite.createdByUserId).toBe(operator.id);

        const audit = await latestAuditLog('INVITE', invite.id);
        expect(audit.action).toBe('invite.create');
        expect(audit.adminUserId).toBe(operator.id);
        // Never the plaintext code (§66).
        expect(JSON.stringify(audit.metadata)).not.toContain(printedCode);

        const listCapture = captureStdout();
        await runInviteCommand('list', { positionals: ['invite', 'list'], options: {} }, ctx);
        listCapture.restore();
        expect(listCapture.text()).toContain(invite.id);

        const s = silence();
        await runInviteCommand(
          'revoke',
          { positionals: ['invite', 'revoke', invite.id], options: {} },
          ctx,
        );
        s.restore();

        const revoked = await dataSource.getRepository(Invite).findOneByOrFail({ id: invite.id });
        expect(revoked.revokedAt).not.toBeNull();

        // Revoking again is refused, not silently re-accepted.
        await expect(
          runInviteCommand(
            'revoke',
            { positionals: ['invite', 'revoke', invite.id], options: {} },
            ctx,
          ),
        ).rejects.toThrow(/already revoked/);
      });
    });

    describe('user suspend/unsuspend/delete', () => {
      it('suspends, unsuspends, and soft-deletes an account, auditing each mutation', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}a`,
        });
        const { user: target, actor } = await createTestUser(dataSource.manager, {
          handle: `target${Date.now()}`,
        });
        const ctx = await context(operatorActor.handle);

        const s1 = silence();
        await runUserCommand(
          'suspend',
          { positionals: ['user', 'suspend', actor.handle], options: { reason: 'spam' } },
          ctx,
        );
        s1.restore();

        const suspended = await dataSource.getRepository(User).findOneByOrFail({ id: target.id });
        expect(suspended.status).toBe('SUSPENDED');
        const suspendAudit = await latestAuditLog('USER', target.id);
        expect(suspendAudit.action).toBe('user.suspend');
        expect(suspendAudit.metadata).toEqual({ reason: 'spam' });

        const s2 = silence();
        await runUserCommand(
          'unsuspend',
          { positionals: ['user', 'unsuspend', actor.handle], options: {} },
          ctx,
        );
        s2.restore();
        const unsuspended = await dataSource.getRepository(User).findOneByOrFail({ id: target.id });
        expect(unsuspended.status).toBe('ACTIVE');

        const s3 = silence();
        await runUserCommand(
          'delete',
          { positionals: ['user', 'delete', actor.handle], options: {} },
          ctx,
        );
        s3.restore();
        const deleted = await dataSource.getRepository(User).findOneByOrFail({ id: target.id });
        expect(deleted.status).toBe('DELETED');
        expect(deleted.deletedAt).not.toBeNull();
      });

      it('writes anonymized moderation-log entries for suspend (SUSPEND) and delete (BAN) (P14 follow-up)', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}d`,
        });
        const { actor } = await createTestUser(dataSource.manager, {
          handle: `modlog${Date.now()}`,
        });
        const ctx = await context(operatorActor.handle);

        const s1 = silence();
        await runUserCommand(
          'suspend',
          {
            positionals: ['user', 'suspend', actor.handle],
            options: { reason: 'harassment case', 'reason-category': 'harassment' },
          },
          ctx,
        );
        s1.restore();

        const suspendEntry = await dataSource.getRepository(ModerationLogEntry).findOne({
          where: { action: 'SUSPEND', subjectKind: 'ACCOUNT', reasonCategory: 'HARASSMENT' },
          order: { createdAt: 'DESC' },
        });
        expect(suspendEntry).not.toBeNull();
        expect(suspendEntry?.subjectDomain).toBeNull();
        // Structurally anonymized: the entity has no actor-id/handle column to check against
        // in the first place (see `ModerationLogEntry`'s doc comment) — nothing in this row's
        // own field set could name `actor.handle` or `actor.id` even by accident.
        expect(Object.values(suspendEntry ?? {})).not.toContain(actor.handle);
        expect(Object.values(suspendEntry ?? {})).not.toContain(actor.id);

        const s2 = silence();
        await runUserCommand(
          'delete',
          { positionals: ['user', 'delete', actor.handle], options: {} },
          ctx,
        );
        s2.restore();

        const banEntry = await dataSource.getRepository(ModerationLogEntry).findOne({
          where: { action: 'BAN', subjectKind: 'ACCOUNT' },
          order: { createdAt: 'DESC' },
        });
        expect(banEntry).not.toBeNull();
        // Default reason category when `--reason-category` is omitted.
        expect(banEntry?.reasonCategory).toBe('OTHER');
        expect(banEntry?.subjectDomain).toBeNull();
      });
    });

    describe('report resolve', () => {
      it('remove-post: tombstones the reported post and resolves the report', async () => {
        const { user: operator, actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}b`,
        });
        const { actor: author } = await createTestUser(dataSource.manager, {
          handle: `author${Date.now()}`,
        });
        const { actor: reporter } = await createTestUser(dataSource.manager, {
          handle: `reporter${Date.now()}`,
        });
        const post = await createTestPost(dataSource.manager, { authorActorId: author.id });
        const report = await createTestReport(dataSource.manager, {
          reporterActorId: reporter.id,
          subjectType: 'POST',
          subjectPostId: post.id,
        });
        const ctx = await context(operatorActor.handle);

        const s = silence();
        await runReportCommand(
          'resolve',
          {
            positionals: ['report', 'resolve', report.id],
            options: { action: 'remove-post', note: 'nsfw' },
          },
          ctx,
        );
        s.restore();

        const removedPost = await dataSource.getRepository(Post).findOneByOrFail({ id: post.id });
        expect(removedPost.deletedAt).not.toBeNull();
        expect(removedPost.removedByUserId).toBe(operator.id);
        expect(removedPost.removalReason).toBe('nsfw');

        const resolved = await dataSource.getRepository(Report).findOneByOrFail({ id: report.id });
        expect(resolved.status).toBe('RESOLVED');
        expect(resolved.resolvedByUserId).toBe(operator.id);
      });

      it('suspend: suspends the reported actor and resolves the report', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}c`,
        });
        const { user: target, actor: targetActor } = await createTestUser(dataSource.manager, {
          handle: `bad${Date.now()}`,
        });
        const { actor: reporter } = await createTestUser(dataSource.manager, {
          handle: `reporter2${Date.now()}`,
        });
        const report = await createTestReport(dataSource.manager, {
          reporterActorId: reporter.id,
          subjectType: 'ACTOR',
          subjectActorId: targetActor.id,
        });
        const ctx = await context(operatorActor.handle);

        const s = silence();
        await runReportCommand(
          'resolve',
          { positionals: ['report', 'resolve', report.id], options: { action: 'suspend' } },
          ctx,
        );
        s.restore();

        const suspended = await dataSource.getRepository(User).findOneByOrFail({ id: target.id });
        expect(suspended.status).toBe('SUSPENDED');
      });

      it('writes anonymized moderation-log entries for remove-post/suspend, and none for a no-op resolution (P14 follow-up)', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}e`,
        });
        const { actor: author } = await createTestUser(dataSource.manager, {
          handle: `author2${Date.now()}`,
        });
        const { actor: reporter } = await createTestUser(dataSource.manager, {
          handle: `reporter3${Date.now()}`,
        });
        const post = await createTestPost(dataSource.manager, { authorActorId: author.id });
        const report = await createTestReport(dataSource.manager, {
          reporterActorId: reporter.id,
          subjectType: 'POST',
          subjectPostId: post.id,
          reason: 'HATE_SPEECH',
        });
        const ctx = await context(operatorActor.handle);

        const s1 = silence();
        await runReportCommand(
          'resolve',
          { positionals: ['report', 'resolve', report.id], options: { action: 'remove-post' } },
          ctx,
        );
        s1.restore();

        const removalEntry = await dataSource.getRepository(ModerationLogEntry).findOne({
          where: { action: 'POST_REMOVAL', subjectKind: 'POST' },
          order: { createdAt: 'DESC' },
        });
        expect(removalEntry).not.toBeNull();
        // reports.reason 'HATE_SPEECH' maps to moderation_log_entries.reason_category 'HATE'.
        expect(removalEntry?.reasonCategory).toBe('HATE');
        expect(removalEntry?.subjectDomain).toBeNull();

        const { actor: reporter2 } = await createTestUser(dataSource.manager, {
          handle: `reporter4${Date.now()}`,
        });
        const dismissedReport = await createTestReport(dataSource.manager, {
          reporterActorId: reporter2.id,
          subjectType: 'POST',
          subjectPostId: post.id,
        });
        const countBefore = await dataSource.getRepository(ModerationLogEntry).count();

        const s2 = silence();
        await runReportCommand(
          'resolve',
          {
            positionals: ['report', 'resolve', dismissedReport.id],
            options: { action: 'none' },
          },
          ctx,
        );
        s2.restore();

        // `none` resolves the report without an enforcement action — no new log entry.
        const countAfter = await dataSource.getRepository(ModerationLogEntry).count();
        expect(countAfter).toBe(countBefore);
      });
    });

    describe('report show --reveal-evidence (P13-018, ADR 0020 §9)', () => {
      it('discloses attached E2EE evidence and audits the view, attributed to the operator', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `mod${Date.now()}`,
        });
        const { actor: reporter } = await createTestUser(dataSource.manager, {
          handle: `reporter5${Date.now()}`,
        });
        const report = await createTestReport(dataSource.manager, {
          reporterActorId: reporter.id,
          subjectType: 'ACTOR',
          subjectActorId: reporter.id,
        });
        const consentedAt = new Date('2026-08-19T00:00:00.000Z');
        await dataSource.getRepository(E2eeReportEvidence).save({
          reportId: report.id,
          verificationStatus: 'VERIFIED',
          consentedAt,
          verifiedAt: consentedAt,
          verificationFailureCode: null,
        });
        await dataSource.getRepository(E2eeReportEvidenceItem).save({
          reportId: report.id,
          position: 0,
          logicalMessageId: '00000000-0000-0000-0000-000000000001',
          disclosedPlaintext: Buffer.from('the disclosed body'),
          opening: Buffer.alloc(4),
          envelopeTranscript: Buffer.alloc(4),
          frankingTag: Buffer.alloc(4),
          participantTranscript: Buffer.alloc(4),
          rosterDigest: Buffer.alloc(32),
        });
        const ctx = await context(operatorActor.handle);

        const s = captureStdout();
        await runReportCommand(
          'show',
          {
            positionals: ['report', 'show', report.id],
            options: { 'reveal-evidence': true, json: true },
          },
          ctx,
        );
        s.restore();

        const printed = JSON.parse(s.text()) as {
          evidence: { items: { disclosedPlaintext: string }[] };
        };
        expect(printed.evidence.items).toHaveLength(1);
        expect(printed.evidence.items[0]?.disclosedPlaintext).toBe('the disclosed body');

        const auditRow = await latestAuditLog('REPORT', report.id);
        expect(auditRow.adminUserId).toBe(operatorActor.userId);
        expect(auditRow.action).toBe('report.view_e2ee_evidence');
        expect(auditRow.subjectId).toBe(report.id);
        expect(JSON.stringify(auditRow.metadata)).not.toContain('the disclosed body');
      });

      it('never discloses evidence without the flag, even to an identified operator', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `mod2${Date.now()}`,
        });
        const { actor: reporter } = await createTestUser(dataSource.manager, {
          handle: `reporter6${Date.now()}`,
        });
        const report = await createTestReport(dataSource.manager, {
          reporterActorId: reporter.id,
          subjectType: 'ACTOR',
          subjectActorId: reporter.id,
        });
        await dataSource.getRepository(E2eeReportEvidence).save({
          reportId: report.id,
          verificationStatus: 'VERIFIED',
          consentedAt: new Date(),
          verifiedAt: new Date(),
          verificationFailureCode: null,
        });
        await dataSource.getRepository(E2eeReportEvidenceItem).save({
          reportId: report.id,
          position: 0,
          logicalMessageId: '00000000-0000-0000-0000-000000000002',
          disclosedPlaintext: Buffer.from('must stay hidden'),
          opening: Buffer.alloc(4),
          envelopeTranscript: Buffer.alloc(4),
          frankingTag: Buffer.alloc(4),
          participantTranscript: Buffer.alloc(4),
          rosterDigest: Buffer.alloc(32),
        });
        const ctx = await context(operatorActor.handle);

        const s = captureStdout();
        await runReportCommand(
          'show',
          { positionals: ['report', 'show', report.id], options: {} },
          ctx,
        );
        s.restore();

        expect(s.text()).not.toContain('must stay hidden');
      });

      it('rejects revealing evidence for an unknown report without an operator identified', async () => {
        const noOperator = await context(undefined);
        await expect(
          runReportCommand(
            'show',
            { positionals: ['report', 'show', 'nope'], options: { 'reveal-evidence': true } },
            noOperator,
          ),
        ).rejects.toThrow(/No operator identified/);
      });
    });

    describe('post remove', () => {
      it('tombstones a post with the operator-supplied reason', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}d`,
        });
        const { actor: author } = await createTestUser(dataSource.manager, {
          handle: `author2${Date.now()}`,
        });
        const post = await createTestPost(dataSource.manager, { authorActorId: author.id });
        const ctx = await context(operatorActor.handle);

        const s = silence();
        await runPostCommand(
          'remove',
          { positionals: ['post', 'remove', post.id], options: { reason: 'off-topic' } },
          ctx,
        );
        s.restore();

        const removed = await dataSource.getRepository(Post).findOneByOrFail({ id: post.id });
        expect(removed.deletedAt).not.toBeNull();
        expect(removed.removalReason).toBe('off-topic');

        const audit = await latestAuditLog('POST', post.id);
        expect(audit.action).toBe('post.remove');
      });
    });

    describe('jobs replay (B-014)', () => {
      it('resets a DEAD job to PENDING, preserving attempts, and audits the replay', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}e`,
        });
        const jobs = dataSource.getRepository(OutboxJob);
        const dead = await jobs.save(
          jobs.create({
            type: 'SEND_VERIFICATION_EMAIL',
            payload: { userId: 'x' },
            status: 'DEAD',
            attempts: 10,
            maxAttempts: 10,
            lastError: 'boom',
          }),
        );
        const ctx = await context(operatorActor.handle);

        const s = silence();
        await runJobsCommand(
          'replay',
          { positionals: ['jobs', 'replay', dead.id], options: {} },
          ctx,
        );
        s.restore();

        const replayed = await jobs.findOneByOrFail({ id: dead.id });
        expect(replayed.status).toBe('PENDING');
        expect(replayed.attempts).toBe(10); // preserved, not reset to 0

        const audit = await latestAuditLog('JOB', dead.id);
        expect(audit.action).toBe('job.replay');

        // Replaying a job that is no longer DEAD is refused, not silently re-accepted.
        await expect(
          runJobsCommand('replay', { positionals: ['jobs', 'replay', dead.id], options: {} }, ctx),
        ).rejects.toThrow(/not DEAD/);
      });

      it('lists and shows jobs without throwing', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}f`,
        });
        const jobs = dataSource.getRepository(OutboxJob);
        const job = await jobs.save(
          jobs.create({ type: 'SEND_VERIFICATION_EMAIL', payload: {}, status: 'PENDING' }),
        );
        const ctx = await context(operatorActor.handle);

        const s1 = silence();
        await runJobsCommand('list', { positionals: ['jobs', 'list'], options: {} }, ctx);
        s1.restore();

        const s2 = silence();
        await runJobsCommand('show', { positionals: ['jobs', 'show', job.id], options: {} }, ctx);
        s2.restore();
      });
    });

    describe('domain block/unblock/list (B-027, P14-012/P14-013)', () => {
      it('blocks (with a reason category, logging a moderation-log entry), re-blocks, lists, and unblocks, auditing each mutation', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}g`,
        });
        const ctx = await context(operatorActor.handle);
        const domain = `Blocked-${Date.now()}.Example`;
        const normalized = domain.toLowerCase();

        const s1 = silence();
        await runDomainCommand(
          'block',
          {
            positionals: ['domain', 'block', domain],
            options: { reason: 'spam', 'reason-category': 'spam' },
          },
          ctx,
        );
        s1.restore();

        const blocked = await dataSource
          .getRepository(DomainBlock)
          .findOneByOrFail({ domain: normalized });
        expect(blocked.reason).toBe('spam');
        expect(blocked.reasonCategory).toBe('SPAM');

        const audit = await latestAuditLog('DOMAIN', normalized);
        expect(audit.action).toBe('domain.block');
        expect(audit.adminUserId).toBe(operatorActor.userId);

        // The public, identified domain-kind transparency-log entry (spec §201.4).
        const logEntry = await dataSource
          .getRepository(ModerationLogEntry)
          .findOneOrFail({ where: { subjectDomain: normalized } });
        expect(logEntry.action).toBe('DOMAIN_BLOCK');
        expect(logEntry.subjectKind).toBe('DOMAIN');
        expect(logEntry.reasonCategory).toBe('SPAM');
        expect(logEntry.appealed).toBe(false);

        // Defaults to OTHER when --reason-category is omitted.
        const s1b = silence();
        await runDomainCommand(
          'block',
          { positionals: ['domain', 'block', `other-${domain}`], options: {} },
          ctx,
        );
        s1b.restore();
        const otherBlocked = await dataSource
          .getRepository(DomainBlock)
          .findOneByOrFail({ domain: `other-${normalized}` });
        expect(otherBlocked.reasonCategory).toBe('OTHER');

        // An unrecognized category is rejected, not silently defaulted.
        await expect(
          runDomainCommand(
            'block',
            {
              positionals: ['domain', 'block', `bad-category-${domain}`],
              options: { 'reason-category': 'not-a-real-category' },
            },
            ctx,
          ),
        ).rejects.toThrow(/--reason-category must be one of/);

        // Idempotent re-block updates the reason/category rather than erroring or duplicating.
        const s2 = silence();
        await runDomainCommand(
          'block',
          {
            positionals: ['domain', 'block', domain],
            options: { reason: 'worse spam', 'reason-category': 'harassment' },
          },
          ctx,
        );
        s2.restore();
        const reblocked = await dataSource
          .getRepository(DomainBlock)
          .findOneByOrFail({ domain: normalized });
        expect(reblocked.reason).toBe('worse spam');
        expect(reblocked.reasonCategory).toBe('HARASSMENT');

        const listCapture = captureStdout();
        await runDomainCommand('list', { positionals: ['domain', 'list'], options: {} }, ctx);
        listCapture.restore();
        expect(listCapture.text()).toContain(normalized);

        const s3 = silence();
        await runDomainCommand(
          'unblock',
          { positionals: ['domain', 'unblock', domain], options: {} },
          ctx,
        );
        s3.restore();
        expect(
          await dataSource.getRepository(DomainBlock).findOneBy({ domain: normalized }),
        ).toBeNull();

        const unblockAudit = await latestAuditLog('DOMAIN', normalized);
        expect(unblockAudit.action).toBe('domain.unblock');

        // Unblocking again is refused, not silently re-accepted.
        await expect(
          runDomainCommand(
            'unblock',
            { positionals: ['domain', 'unblock', domain], options: {} },
            ctx,
          ),
        ).rejects.toThrow(/not blocked/);
      });
    });

    describe('domain review-list (§201.6)', () => {
      let tmpDir: string;

      afterEach(async () => {
        if (tmpDir !== undefined) await rm(tmpDir, { recursive: true, force: true });
      });

      it('lists candidate domains for a human to review and writes nothing to domain_blocks', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}h`,
        });
        const ctx = await context(operatorActor.handle);

        const alreadyBlockedDomain = `already-blocked-${Date.now()}.example`;
        await dataSource
          .getRepository(DomainBlock)
          .save(dataSource.getRepository(DomainBlock).create({ domain: alreadyBlockedDomain }));

        const newDomain = `candidate-${Date.now()}.example`;
        tmpDir = await mkdtemp(join(tmpdir(), 'patches-admin-blocklist-'));
        const file = join(tmpDir, 'blocklist.txt');
        await writeFile(
          file,
          `# a comment line, ignored\n\n${alreadyBlockedDomain}\n${newDomain}\n`,
          'utf8',
        );

        const countBefore = await dataSource.getRepository(DomainBlock).count();

        const capture = captureStdout();
        await runDomainCommand(
          'review-list',
          { positionals: ['domain', 'review-list', file], options: {} },
          ctx,
        );
        capture.restore();

        expect(capture.text()).toContain(alreadyBlockedDomain);
        expect(capture.text()).toContain(newDomain);
        expect(capture.text()).toContain('nothing written');

        // Writes nothing to domain_blocks (spec §201.6 — a reviewed reference list is never a
        // write path of its own).
        expect(await dataSource.getRepository(DomainBlock).count()).toBe(countBefore);
      });
    });

    describe('appeal list/inspect/resolve (§201.3)', () => {
      it('resolves an appeal, updating the row and auditing the resolution', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}i`,
        });
        const { user: appellantUser, actor: appellantActor } = await createTestUser(
          dataSource.manager,
          { handle: `appellant${Date.now()}` },
        );
        const ctx = await context(operatorActor.handle);

        // Mirrors `patches-admin user suspend` exactly — the enforcement action being
        // appealed (`apps/admin/src/commands/user.ts`, outside this task's owned file set).
        const suspendAudit = await dataSource.transaction(async (manager) => {
          await manager
            .getRepository(User)
            .update({ id: appellantUser.id }, { status: 'SUSPENDED' });
          return appendAdminAuditLog(manager, {
            adminUserId: operatorActor.userId ?? '',
            action: 'user.suspend',
            subjectType: 'USER',
            subjectId: appellantUser.id,
            metadata: { reason: 'spam' },
          });
        });

        // Mirrors `AppealService.createAppeal` (`apps/server/src/modules/appeals/**`, the
        // gRPC write path) directly, since this CLI talks to PostgreSQL, not gRPC.
        const appealsRepo = dataSource.getRepository(Appeal);
        const appeal = await appealsRepo.save(
          appealsRepo.create({
            actorId: appellantActor.id,
            adminAuditLogId: suspendAudit.id,
            statement: 'I was not spamming.',
            status: 'OPEN',
          }),
        );

        const listCapture = captureStdout();
        await runAppealCommand('list', { positionals: ['appeal', 'list'], options: {} }, ctx);
        listCapture.restore();
        expect(listCapture.text()).toContain(appeal.id);

        const inspectCapture = captureStdout();
        await runAppealCommand(
          'inspect',
          { positionals: ['appeal', 'inspect', appeal.id], options: {} },
          ctx,
        );
        inspectCapture.restore();
        expect(inspectCapture.text()).toContain('I was not spamming.');
        expect(inspectCapture.text()).toContain('user.suspend');

        const s = silence();
        await runAppealCommand(
          'resolve',
          {
            positionals: ['appeal', 'resolve', appeal.id],
            options: { outcome: 'overturned', reason: 'the report was mistaken' },
          },
          ctx,
        );
        s.restore();

        const resolved = await appealsRepo.findOneByOrFail({ id: appeal.id });
        expect(resolved.status).toBe('OVERTURNED');
        expect(resolved.resolvedByUserId).toBe(operatorActor.userId);
        expect(resolved.resolutionReason).toBe('the report was mistaken');
        expect(resolved.resolvedAt).not.toBeNull();

        // The resolution is itself audited (spec §201.3, §66) — a fresh admin_audit_log row,
        // not a mutation of the original suspend row.
        const resolveAudit = await latestAuditLog('USER', appellantUser.id);
        expect(resolveAudit.action).toBe('appeal.resolve');
        expect(resolveAudit.id).not.toBe(suspendAudit.id);
        expect(resolveAudit.metadata).toEqual({
          appealId: appeal.id,
          moderationNoticeId: suspendAudit.id,
          outcome: 'overturned',
          reason: 'the report was mistaken',
        });

        // Resolving an already-resolved appeal is refused, not silently re-accepted.
        await expect(
          runAppealCommand(
            'resolve',
            {
              positionals: ['appeal', 'resolve', appeal.id],
              options: { outcome: 'upheld', reason: 'again' },
            },
            ctx,
          ),
        ).rejects.toThrow(/already overturned/);
      });

      it('rejects an unrecognized --outcome', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}j`,
        });
        const ctx = await context(operatorActor.handle);

        await expect(
          runAppealCommand(
            'resolve',
            {
              positionals: ['appeal', 'resolve', '00000000-0000-0000-0000-000000000000'],
              options: { outcome: 'not-a-real-outcome', reason: 'x' },
            },
            ctx,
          ),
        ).rejects.toThrow(/--outcome must be one of/);
      });
    });

    describe('labeler vocabulary set-mandatory/list (P14-026, spec §200.3, §203)', () => {
      // Every test in this block creates its own node-labeler row (`isNodeLabeler: true`) —
      // `requireNodeLabeler`'s `findOne({ where: { isNodeLabeler: true } })` would otherwise
      // pick up whichever row a prior test in this file left behind, since nothing enforces
      // "at most one" beyond the service layer (`labeler.entity.ts`'s doc).
      afterEach(async () => {
        await dataSource.getRepository(Labeler).delete({ isNodeLabeler: true });
      });

      /** This CLI never boots a full server, so nothing runs `LabelSeedService`'s boot-time
       * seed (`apps/server/src/modules/labels/label-seed.service.ts`) — a fresh, unmandatory
       * node-labeler row is created directly, matching that seed's own initial shape. */
      async function seedNodeLabeler(): Promise<Labeler> {
        const labelers = dataSource.getRepository(Labeler);
        return labelers.save(
          labelers.create({
            actorId: null,
            communityId: null,
            isNodeLabeler: true,
            vocabulary: [
              { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
              { value: 'nsfw', description: '', defaultAction: 'WARN', mandatory: false },
            ],
          }),
        );
      }

      it('sets and unsets mandatory on an existing value, auditing each change', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}k`,
        });
        const ctx = await context(operatorActor.handle);
        const labeler = await seedNodeLabeler();

        const s1 = silence();
        await runLabelerCommand(
          'vocabulary',
          { positionals: ['labeler', 'vocabulary', 'set-mandatory', 'nsfw'], options: {} },
          ctx,
        );
        s1.restore();

        const afterSet = await dataSource
          .getRepository(Labeler)
          .findOneByOrFail({ id: labeler.id });
        expect(afterSet.vocabulary).toEqual([
          { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
          { value: 'nsfw', description: '', defaultAction: 'WARN', mandatory: true },
        ]);

        const setAudit = await latestAuditLog('LABELER', labeler.id);
        expect(setAudit.action).toBe('labeler.vocabulary.set-mandatory');
        expect(setAudit.adminUserId).toBe(operatorActor.userId);
        expect(setAudit.metadata).toEqual({ value: 'nsfw', mandatory: true });

        const s2 = silence();
        await runLabelerCommand(
          'vocabulary',
          {
            positionals: ['labeler', 'vocabulary', 'set-mandatory', 'nsfw'],
            options: { off: true },
          },
          ctx,
        );
        s2.restore();

        const afterUnset = await dataSource
          .getRepository(Labeler)
          .findOneByOrFail({ id: labeler.id });
        expect(afterUnset.vocabulary).toEqual([
          { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
          { value: 'nsfw', description: '', defaultAction: 'WARN', mandatory: false },
        ]);

        const unsetAudit = await latestAuditLog('LABELER', labeler.id);
        expect(unsetAudit.metadata).toEqual({ value: 'nsfw', mandatory: false });
        expect(unsetAudit.id).not.toBe(setAudit.id);
      });

      it('rejects a value not in the node labeler’s vocabulary', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}l`,
        });
        const ctx = await context(operatorActor.handle);
        await seedNodeLabeler();

        await expect(
          runLabelerCommand(
            'vocabulary',
            {
              positionals: ['labeler', 'vocabulary', 'set-mandatory', 'not-a-real-value'],
              options: {},
            },
            ctx,
          ),
        ).rejects.toThrow(/is not part of the node labeler's vocabulary/);
      });

      it('lists the node labeler’s vocabulary, mandatory flags included', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}m`,
        });
        const ctx = await context(operatorActor.handle);
        const labelers = dataSource.getRepository(Labeler);
        await labelers.save(
          labelers.create({
            actorId: null,
            communityId: null,
            isNodeLabeler: true,
            vocabulary: [
              { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
              { value: 'nsfw', description: '', defaultAction: 'HIDE', mandatory: true },
            ],
          }),
        );

        const capture = captureStdout();
        await runLabelerCommand(
          'vocabulary',
          { positionals: ['labeler', 'vocabulary', 'list'], options: { json: true } },
          ctx,
        );
        capture.restore();

        expect(JSON.parse(capture.text())).toEqual([
          { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
          { value: 'nsfw', description: '', defaultAction: 'HIDE', mandatory: true },
        ]);
      });
    });

    // Sanity check on the helper the commands share for `<id>`/`<handle>` positionals.
    it('requirePositional is exercised by every command above via a real CLI-shaped args object', () => {
      expect(requirePositional(['user', 'show', 'alice'], 2, 'usage')).toBe('alice');
    });
  },
);
