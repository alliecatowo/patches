import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminContext } from './context.js';
import { dispatch, printUsage } from './dispatch.js';

const {
  runAppealCommand,
  runAuditLogCommand,
  runDomainCommand,
  runInviteCommand,
  runJobsCommand,
  runLabelerCommand,
  runPostCommand,
  runReportCommand,
  runUserCommand,
} = vi.hoisted(() => ({
  runAppealCommand: vi.fn(),
  runAuditLogCommand: vi.fn(),
  runDomainCommand: vi.fn(),
  runInviteCommand: vi.fn(),
  runJobsCommand: vi.fn(),
  runLabelerCommand: vi.fn(),
  runPostCommand: vi.fn(),
  runReportCommand: vi.fn(),
  runUserCommand: vi.fn(),
}));

vi.mock('./commands/appeal.js', () => ({ runAppealCommand }));
vi.mock('./commands/audit-log.js', () => ({ runAuditLogCommand }));
vi.mock('./commands/domain.js', () => ({ runDomainCommand }));
vi.mock('./commands/invite.js', () => ({ runInviteCommand }));
vi.mock('./commands/jobs.js', () => ({ runJobsCommand }));
vi.mock('./commands/labeler.js', () => ({ runLabelerCommand }));
vi.mock('./commands/post.js', () => ({ runPostCommand }));
vi.mock('./commands/report.js', () => ({ runReportCommand }));
vi.mock('./commands/user.js', () => ({ runUserCommand }));

const context = {} as AdminContext;
const args = { positionals: ['group', 'action'], options: {} };

describe('dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['invite', runInviteCommand],
    ['user', runUserCommand],
    ['report', runReportCommand],
    ['post', runPostCommand],
    ['jobs', runJobsCommand],
    ['domain', runDomainCommand],
    ['appeal', runAppealCommand],
    ['labeler', runLabelerCommand],
    ['audit-log', runAuditLogCommand],
  ] as const)(
    'routes group %s to its handler with the parsed action and args',
    async (group, handler) => {
      await dispatch(group, 'do-thing', args, context);
      expect(handler).toHaveBeenCalledExactlyOnceWith('do-thing', args, context);
      for (const other of [
        runAppealCommand,
        runAuditLogCommand,
        runDomainCommand,
        runInviteCommand,
        runJobsCommand,
        runLabelerCommand,
        runPostCommand,
        runReportCommand,
        runUserCommand,
      ]) {
        if (other === handler) continue;
        expect(other).not.toHaveBeenCalled();
      }
    },
  );

  it('prints usage and sets a nonzero exit code for an unknown group, without calling any handler', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    await dispatch('not-a-real-group', 'action', args, context);

    expect(process.exitCode).toBe(1);
    expect(writeSpy).toHaveBeenCalledOnce();
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain('Usage: patches-admin');
    for (const handler of [
      runAppealCommand,
      runAuditLogCommand,
      runDomainCommand,
      runInviteCommand,
      runJobsCommand,
      runLabelerCommand,
      runPostCommand,
      runReportCommand,
      runUserCommand,
    ]) {
      expect(handler).not.toHaveBeenCalled();
    }

    writeSpy.mockRestore();
    process.exitCode = originalExitCode;
  });
});

describe('printUsage', () => {
  it('writes the full command reference to stderr', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    printUsage();
    expect(writeSpy).toHaveBeenCalledOnce();
    const output = String(writeSpy.mock.calls[0]?.[0]);
    expect(output).toContain('invite create');
    expect(output).toContain('audit-log list');
    writeSpy.mockRestore();
  });
});
