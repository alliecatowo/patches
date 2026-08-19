import { readFile } from 'node:fs/promises';

import {
  appendAdminAuditLog,
  DomainBlock,
  MODERATION_REASON_CATEGORIES,
  ModerationLogEntry,
  type ModerationReasonCategory,
} from '@patches/database';

import {
  booleanOption,
  optionalStringOption,
  type ParsedArgs,
  requirePositional,
} from '../cli/arg-parser.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';

/** `domain block|unblock|list|review-list` (B-027, P8-006, P14-012, P14-013) — writes to
 * `domain_blocks`, the operator-only half of federation domain blocking (`DomainBlockService`'s
 * reads/enforcement live in `apps/server`/`apps/worker`; this CLI is the only writer). `block`
 * also writes a `moderation_log_entries` row (spec §201.4 — the public, identified domain-kind
 * entry) in the same transaction as the `admin_audit_log` row it already wrote. */
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
    case 'review-list':
      return reviewList(args, context);
    default:
      throw new Error(
        `Unknown "domain" action "${action}". Try block, unblock, list, or review-list.`,
      );
  }
}

/** Parses `--reason-category` against the closed vocabulary `GetNodePolicy`/`ListModerationLog`
 * publish (spec §201.4, §201.5, §202) — anything unrecognized, including unset, is rejected
 * rather than silently defaulting, since this value (unlike `--reason`) is published verbatim
 * to the world. */
function parseReasonCategory(args: ParsedArgs): ModerationReasonCategory {
  const raw = optionalStringOption(args.options, 'reason-category');
  if (raw === undefined) return 'OTHER';
  const upper = raw.trim().toUpperCase();
  if (!(MODERATION_REASON_CATEGORIES as readonly string[]).includes(upper)) {
    throw new Error(
      `--reason-category must be one of: ${MODERATION_REASON_CATEGORIES.join(', ').toLowerCase()}.`,
    );
  }
  return upper as ModerationReasonCategory;
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
    requirePositional(
      args.positionals,
      2,
      'Usage: domain block <domain> [--reason <text>] [--reason-category <category>]',
    ),
  );
  const reason = optionalStringOption(args.options, 'reason') ?? null;
  const reasonCategory = parseReasonCategory(args);
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(DomainBlock);
    // Idempotent, same reasoning as every other admin upsert in this CLI: re-blocking an
    // already-blocked domain updates the reason/category rather than erroring.
    const existing = await repository.findOne({ where: { domain } });
    if (existing === null) {
      await repository.save(repository.create({ domain, reason, reasonCategory }));
    } else if (existing.reason !== reason || existing.reasonCategory !== reasonCategory) {
      await repository.update({ domain }, { reason, reasonCategory });
    }

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'domain.block',
      subjectType: 'DOMAIN',
      subjectId: domain,
      metadata: { reason, reasonCategory },
    });

    // The public, identified domain-kind transparency-log entry (spec §201.4) — written every
    // time `block` runs, even idempotently: a repeated block with an updated reason is itself
    // a fresh enforcement action worth recording, the same way `admin_audit_log` above already
    // gets a fresh row on every call regardless of idempotency.
    const logEntries = manager.getRepository(ModerationLogEntry);
    await logEntries.save(
      logEntries.create({
        action: 'DOMAIN_BLOCK',
        subjectKind: 'DOMAIN',
        subjectDomain: domain,
        reasonCategory,
        appealed: false,
      }),
    );
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
    reasonCategory: row.reasonCategory,
    source: row.source,
    createdAt: row.createdAt,
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}

/**
 * §201.6's reviewed-import flow: reads a third-party domain blocklist for a human to review —
 * one domain per line, `#`-prefixed lines and blank lines ignored (the same shape a §199
 * filter list uses, but of domains). **Writes nothing to `domain_blocks`.** `patches-admin
 * domain block` remains the only write path, one domain at a time, by the same admin who would
 * type it anyway (spec §201.6 — an imported list that could silently reconfigure a node's
 * federation surface is exactly the "arbitrary remote code, wearing a data hat" §153 already
 * prohibits). Not an admin-audited action for the same reason: reading a file is not a
 * mutation.
 */
async function reviewList(args: ParsedArgs, context: AdminContext): Promise<void> {
  const path = requirePositional(args.positionals, 2, 'Usage: domain review-list <file>');
  const contents = await readFile(path, 'utf8');
  const candidates = [
    ...new Set(
      contents
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .map((line) => line.toLowerCase()),
    ),
  ];

  if (candidates.length === 0) {
    process.stdout.write('(no candidate domains found in that file)\n');
    return;
  }

  const alreadyBlocked = new Set(
    (
      await context.dataSource
        .getRepository(DomainBlock)
        .createQueryBuilder('domainBlock')
        .where('domainBlock.domain IN (:...domains)', { domains: candidates })
        .getMany()
    ).map((row) => row.domain),
  );

  const table: Row[] = candidates.map((domain) => ({
    domain,
    alreadyBlocked: alreadyBlocked.has(domain),
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
    process.stdout.write(
      `\n${String(candidates.length)} candidate domain(s) for review — nothing written. Run ` +
        '`domain block <domain> --reason <text> --reason-category <category>` for each one you ' +
        'decide to act on.\n',
    );
  }
}
