#!/usr/bin/env node
import 'reflect-metadata';

import { optionalStringOption, parseArgs, type ParsedArgs } from './cli/arg-parser.js';
import { createAdminContext } from './context.js';
import { dispatch, printUsage } from './dispatch.js';
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

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
