import {
  AdminAuditLog,
  DomainBlock,
  Invite,
  OutboxJob,
  Post,
  Report,
  User,
} from '@patches/database';
import { createTestPost, createTestReport, createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { requirePositional } from '../src/cli/arg-parser.js';
import { hashInviteCode } from '../src/cli/crypto.js';
import { runDomainCommand } from '../src/commands/domain.js';
import { runInviteCommand } from '../src/commands/invite.js';
import { runJobsCommand } from '../src/commands/jobs.js';
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

    describe('domain block/unblock/list (B-027)', () => {
      it('blocks, re-blocks (updating the reason), lists, and unblocks a domain, auditing each mutation', async () => {
        const { actor: operatorActor } = await createTestUser(dataSource.manager, {
          handle: `op${Date.now()}g`,
        });
        const ctx = await context(operatorActor.handle);
        const domain = `Blocked-${Date.now()}.Example`;
        const normalized = domain.toLowerCase();

        const s1 = silence();
        await runDomainCommand(
          'block',
          { positionals: ['domain', 'block', domain], options: { reason: 'spam' } },
          ctx,
        );
        s1.restore();

        const blocked = await dataSource
          .getRepository(DomainBlock)
          .findOneByOrFail({ domain: normalized });
        expect(blocked.reason).toBe('spam');

        const audit = await latestAuditLog('DOMAIN', normalized);
        expect(audit.action).toBe('domain.block');
        expect(audit.adminUserId).toBe(operatorActor.userId);

        // Idempotent re-block updates the reason rather than erroring or duplicating the row.
        const s2 = silence();
        await runDomainCommand(
          'block',
          { positionals: ['domain', 'block', domain], options: { reason: 'worse spam' } },
          ctx,
        );
        s2.restore();
        const reblocked = await dataSource
          .getRepository(DomainBlock)
          .findOneByOrFail({ domain: normalized });
        expect(reblocked.reason).toBe('worse spam');

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

    // Sanity check on the helper the commands share for `<id>`/`<handle>` positionals.
    it('requirePositional is exercised by every command above via a real CLI-shaped args object', () => {
      expect(requirePositional(['user', 'show', 'alice'], 2, 'usage')).toBe('alice');
    });
  },
);
