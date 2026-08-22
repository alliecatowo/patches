import {
  AUTH_CODE_DELIVERY_TOMBSTONE,
  appendAdminAuditLog,
  isAuthCodeEmailJobType,
  OutboxJob,
  replayOutboxJob,
} from '@patches/database';

import {
  booleanOption,
  optionalStringOption,
  type ParsedArgs,
  requirePositional,
} from '../cli/arg-parser.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';

/** `jobs list|show|replay` (B-014) — inspect/replay the transactional outbox
 * (`docs/architecture/jobs.md`), most usefully its `DEAD` letter queue. */
export async function runJobsCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'list':
      return listJobs(args, context);
    case 'show':
      return showJob(args, context);
    case 'replay':
      return replayJob(args, context);
    default:
      throw new Error(`Unknown "jobs" action "${action}". Try list, show, or replay.`);
  }
}

async function listJobs(args: ParsedArgs, context: AdminContext): Promise<void> {
  const status = optionalStringOption(args.options, 'status');
  const query = context.dataSource
    .getRepository(OutboxJob)
    .createQueryBuilder('job')
    .orderBy('job.id', 'DESC')
    .limit(50);

  if (status !== undefined) {
    query.andWhere('job.status = :status', { status: status.toUpperCase() });
  }

  const rows = await query.getMany();
  const table: Row[] = rows.map((job) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: `${String(job.attempts)}/${String(job.maxAttempts)}`,
    availableAt: job.availableAt,
    lastError: job.lastError ?? '',
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}

async function showJob(args: ParsedArgs, context: AdminContext): Promise<void> {
  const id = requirePositional(args.positionals, 2, 'Usage: jobs show <id>');
  const job = await context.dataSource.getRepository(OutboxJob).findOne({ where: { id } });
  if (job === null) throw new Error(`Job "${id}" not found.`);
  const visiblePayload = isAuthCodeEmailJobType(job.type)
    ? AUTH_CODE_DELIVERY_TOMBSTONE
    : job.payload;

  if (booleanOption(args.options, 'json')) {
    printJson({
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      payload: visiblePayload,
      availableAt: job.availableAt.toISOString(),
      lockedAt: job.lockedAt?.toISOString() ?? null,
      lockedBy: job.lockedBy,
      lastError: job.lastError,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    });
    return;
  }

  printTable([
    {
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: `${String(job.attempts)}/${String(job.maxAttempts)}`,
      availableAt: job.availableAt,
      lockedBy: job.lockedBy,
      lastError: job.lastError,
    } satisfies Row,
  ]);
  process.stdout.write(`payload: ${JSON.stringify(visiblePayload)}\n`);
}

async function replayJob(args: ParsedArgs, context: AdminContext): Promise<void> {
  const id = requirePositional(args.positionals, 2, 'Usage: jobs replay <id>');
  const job = await context.dataSource.getRepository(OutboxJob).findOne({ where: { id } });
  if (job !== null && isAuthCodeEmailJobType(job.type)) {
    throw new Error(`Job "${id}" contains a one-time auth credential and cannot be replayed.`);
  }
  const operatorUserId = await requireOperatorUserId(context);

  const replayed = await context.dataSource.transaction(async (manager) => {
    const ok = await replayOutboxJob(manager, id);
    if (!ok) return false;

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'job.replay',
      subjectType: 'JOB',
      subjectId: id,
      metadata: { previousStatus: 'DEAD' },
    });
    return true;
  });

  if (!replayed) {
    throw new Error(`Job "${id}" is not DEAD (or does not exist) — nothing to replay.`);
  }

  process.stdout.write(`Job ${id} reset to PENDING for the worker to reclaim.\n`);
}
