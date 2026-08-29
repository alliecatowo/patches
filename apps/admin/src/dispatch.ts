import type { ParsedArgs } from './cli/arg-parser.js';
import type { AdminContext } from './context.js';
import { runAppealCommand } from './commands/appeal.js';
import { runAuditLogCommand } from './commands/audit-log.js';
import { runDomainCommand } from './commands/domain.js';
import { runInviteCommand } from './commands/invite.js';
import { runJobsCommand } from './commands/jobs.js';
import { runLabelerCommand } from './commands/labeler.js';
import { runPostCommand } from './commands/post.js';
import { runReportCommand } from './commands/report.js';
import { runUserCommand } from './commands/user.js';

/**
 * `main.ts`'s `<group> <action>` router, split out so it can be unit-tested without importing
 * `main.ts` itself — `main.ts` invokes `main().catch(...)` at module scope on import (it's a
 * `#!/usr/bin/env node` entrypoint, not a library), so a test file must never import it.
 */
export async function dispatch(
  group: string,
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (group) {
    case 'invite':
      return runInviteCommand(action, args, context);
    case 'user':
      return runUserCommand(action, args, context);
    case 'report':
      return runReportCommand(action, args, context);
    case 'post':
      return runPostCommand(action, args, context);
    case 'jobs':
      return runJobsCommand(action, args, context);
    case 'domain':
      return runDomainCommand(action, args, context);
    case 'appeal':
      return runAppealCommand(action, args, context);
    case 'labeler':
      return runLabelerCommand(action, args, context);
    case 'audit-log':
      return runAuditLogCommand(action, args, context);
    default:
      printUsage();
      process.exitCode = 1;
  }
}

export function printUsage(): void {
  process.stderr.write(`patches-admin — Patches moderation/admin CLI (INITIAL_VISION.md §65)

Usage: patches-admin <group> <action> [args] [--flag value] [--as <handle>] [--json]

  invite create [--max-uses N] [--expires <iso>]
  invite list
  invite revoke <id>

  user list
  user show <handle>
  user suspend <handle> --reason <text> [--reason-category <category>]
  user unsuspend <handle>
  user delete <handle> [--reason <text>] [--reason-category <category>]
  user deletion-status <handle>
  user cancel-deletion <handle>

  report list [--status open]
  report show <id>
  report resolve <id> --action <none|remove-post|suspend> [--note <text>]

  post remove <id> --reason <text>

  jobs list [--status DEAD]
  jobs show <id>
  jobs replay <id>

  domain block <domain> [--reason <text>] [--reason-category <category>]
  domain unblock <domain>
  domain list
  domain review-list <file>

  appeal list [--status open]
  appeal inspect <id>
  appeal resolve <id> --outcome <upheld|overturned|modified> --reason <text>

  labeler vocabulary list [--json]
  labeler vocabulary set-mandatory <value> [--off]

  audit-log list [--actor <id>] [--admin <id>] [--since <iso>] [--limit N] [--json]

Every mutating command needs an operator: --as <handle>, or set PATCHES_ADMIN_OPERATOR.
`);
}
