import { appendAdminAuditLog, DomainBlock } from '@patches/database';

import {
  booleanOption,
  optionalStringOption,
  type ParsedArgs,
  requirePositional,
} from '../cli/arg-parser.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';

/** `domain block|unblock|list` (B-027, P8-006) — writes to `domain_blocks`, the operator-only
 * half of federation domain blocking (`DomainBlockService`'s reads/enforcement live in
 * `apps/server`/`apps/worker`; this CLI is the only writer). */
export async function runDomainCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'block':
      return blockDomain(args, context);
    case 'unblock':
      return unblockDomain(args, context);
    case 'list':
      return listDomains(args, context);
    default:
      throw new Error(`Unknown "domain" action "${action}". Try block, unblock, or list.`);
  }
}

/** The `domain` column is the lowercase host only — see `DomainBlock`'s doc comment. Rejects
 * an empty positional up front rather than writing a block that could never match anything. */
function normalizeDomain(raw: string): string {
  const domain = raw.trim().toLowerCase();
  if (domain.length === 0) throw new Error('domain must not be empty.');
  return domain;
}

async function blockDomain(args: ParsedArgs, context: AdminContext): Promise<void> {
  const domain = normalizeDomain(
    requirePositional(args.positionals, 2, 'Usage: domain block <domain> [--reason <text>]'),
  );
  const reason = optionalStringOption(args.options, 'reason') ?? null;
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(DomainBlock);
    // Idempotent, same reasoning as every other admin upsert in this CLI: re-blocking an
    // already-blocked domain updates the reason rather than erroring.
    const existing = await repository.findOne({ where: { domain } });
    if (existing === null) {
      await repository.save(repository.create({ domain, reason }));
    } else if (existing.reason !== reason) {
      await repository.update({ domain }, { reason });
    }

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'domain.block',
      subjectType: 'DOMAIN',
      subjectId: domain,
      metadata: { reason },
    });
  });

  process.stdout.write(`Domain ${domain} blocked.\n`);
}

async function unblockDomain(args: ParsedArgs, context: AdminContext): Promise<void> {
  const domain = normalizeDomain(
    requirePositional(args.positionals, 2, 'Usage: domain unblock <domain>'),
  );
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const result = await manager.getRepository(DomainBlock).delete({ domain });
    if ((result.affected ?? 0) === 0) {
      throw new Error(`Domain "${domain}" is not blocked.`);
    }

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'domain.unblock',
      subjectType: 'DOMAIN',
      subjectId: domain,
    });
  });

  process.stdout.write(`Domain ${domain} unblocked.\n`);
}

async function listDomains(args: ParsedArgs, context: AdminContext): Promise<void> {
  const rows = await context.dataSource
    .getRepository(DomainBlock)
    .createQueryBuilder('domainBlock')
    .orderBy('domainBlock.createdAt', 'DESC')
    .limit(200)
    .getMany();

  const table: Row[] = rows.map((row) => ({
    domain: row.domain,
    reason: row.reason ?? '',
    createdAt: row.createdAt,
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}
