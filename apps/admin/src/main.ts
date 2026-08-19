#!/usr/bin/env node
import 'reflect-metadata';

import { optionalStringOption, parseArgs, type ParsedArgs } from './cli/arg-parser.js';
import { createAdminContext, type AdminContext } from './context.js';
import { runAppealCommand } from './commands/appeal.js';
import { runDomainCommand } from './commands/domain.js';
import { runInviteCommand } from './commands/invite.js';
import { runJobsCommand } from './commands/jobs.js';
import { runPostCommand } from './commands/post.js';
import { runReportCommand } from './commands/report.js';
import { runUserCommand } from './commands/user.js';
import { loadAdminEnv } from './env.js';

/**
 * `patches-admin` — the secure admin/moderation CLI spec §65 asks for. Talks to PostgreSQL
 * directly through `@patches/database` (never gRPC — this is the one client allowed to
 * bypass the server, because it acts with operator authority the RPC surface has no concept
 * of). Every mutating command writes one `admin_audit_log` row (§66) in the same transaction
 * as its mutation.
 */
async function main(): Promise<void> {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [group, action] = positionals;

  if (group === undefined || action === undefined) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const env = loadAdminEnv();
  const asHandle = optionalStringOption(options, 'as');
  const context = await createAdminContext(env, asHandle);
  const args: ParsedArgs = { positionals, options };

  try {
    await dispatch(group, action, args, context);
  } finally {
    await context.dataSource.destroy();
  }
}

async function dispatch(
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
    default:
      printUsage();
      process.exitCode = 1;
  }
}

function printUsage(): void {
  process.stderr.write(`patches-admin — Patches moderation/admin CLI (INITIAL_VISION.md §65)

Usage: patches-admin <group> <action> [args] [--flag value] [--as <handle>] [--json]

  invite create [--max-uses N] [--expires <iso>]
  invite list
  invite revoke <id>

  user list
  user show <handle>
  user suspend <handle> --reason <text>
  user unsuspend <handle>
  user delete <handle> [--reason <text>]

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

Every mutating command needs an operator: --as <handle>, or set PATCHES_ADMIN_OPERATOR.
`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
