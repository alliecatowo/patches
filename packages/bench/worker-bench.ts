import 'reflect-metadata';

import type { DataSource } from 'typeorm';

import { createDataSource, OutboxJob } from '@patches/database';

import { intEnv, loadBenchDatabaseUrl } from './env.js';

/**
 * P19-007 outbox-throughput baseline. Mirrors the production claim shape from
 * `packages/database/src/repositories/outbox.ts`: `PENDING` + `available_at` due, ordered
 * `id ASC`, `FOR UPDATE SKIP LOCKED`, flipped to `PROCESSING` with `locked_at`/`locked_by`
 * — the same query N real worker replicas race on. One DataSource per simulated worker.
 */
const CLAIM_QUERY = `
  UPDATE outbox_jobs
  SET status = 'PROCESSING', locked_at = NOW(), locked_by = $1, attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM outbox_jobs
    WHERE status = 'PENDING' AND available_at <= NOW()
    ORDER BY id ASC
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id
`;

const COMPLETE_QUERY = `
  UPDATE outbox_jobs
  SET status = 'COMPLETED', completed_at = NOW(), locked_at = NULL, locked_by = NULL
  WHERE id = ANY($1::uuid[])
`;

/** A type no real handler registers — the bench itself is the only claimer. */
const BENCH_JOB_TYPE = 'BENCH_NOOP';

async function seedJobs(dataSource: DataSource, nJobs: number): Promise<void> {
  const repo = dataSource.getRepository(OutboxJob);
  const jobs = Array.from({ length: nJobs }, (_, i) =>
    repo.create({
      type: BENCH_JOB_TYPE,
      payload: { index: i },
      status: 'PENDING' as const,
      attempts: 0,
      maxAttempts: 3,
    }),
  );
  await repo.save(jobs);
}

interface WorkerResult {
  claimed: number;
  avgClaimLatencyMs: number;
}

async function workerLoop(databaseUrl: string, workerId: number): Promise<WorkerResult> {
  const ds = createDataSource({ url: databaseUrl, ssl: false, logging: false });
  await ds.initialize();
  try {
    let claimed = 0;
    const claimLatencies: number[] = [];
    for (;;) {
      const start = performance.now();
      const rows = await ds.query<{ id: string }[]>(CLAIM_QUERY, [
        `bench-worker-${String(workerId)}`,
        10,
      ]);
      claimLatencies.push(performance.now() - start);
      if (rows.length === 0) break;
      claimed += rows.length;
      await ds.query(COMPLETE_QUERY, [rows.map((row) => row.id)]);
    }
    return {
      claimed,
      avgClaimLatencyMs:
        claimLatencies.length === 0
          ? 0
          : claimLatencies.reduce((a, b) => a + b, 0) / claimLatencies.length,
    };
  } finally {
    await ds.destroy();
  }
}

async function main(): Promise<void> {
  const databaseUrl = loadBenchDatabaseUrl();
  const nJobs = intEnv('BENCH_WORKER_JOBS', 1000);
  const nWorkers = intEnv('BENCH_WORKER_CONCURRENCY', 4);

  const seeder = createDataSource({ url: databaseUrl, ssl: false, logging: false });
  await seeder.initialize();
  console.log(`Seeding ${String(nJobs)} ${BENCH_JOB_TYPE} jobs...`);
  try {
    await seeder.query('DELETE FROM outbox_jobs WHERE type = $1', [BENCH_JOB_TYPE]);
    await seedJobs(seeder, nJobs);
  } finally {
    await seeder.destroy();
  }

  console.log(`Racing ${String(nWorkers)} workers (each its own pool, SKIP LOCKED claim of 10)...`);
  const start = performance.now();
  const results = await Promise.all(
    Array.from({ length: nWorkers }, (_, i) => workerLoop(databaseUrl, i)),
  );
  const totalMs = performance.now() - start;

  const totalClaimed = results.reduce((a, r) => a + r.claimed, 0);
  const avgClaim =
    results.length === 0
      ? 0
      : results.reduce((a, r) => a + r.avgClaimLatencyMs, 0) / results.length;

  console.log('\n=== Worker outbox throughput ===');
  console.log(`Workers:          ${String(nWorkers)}`);
  console.log(`Jobs:             ${String(nJobs)}`);
  console.log(`Claimed:          ${String(totalClaimed)}`);
  console.log(`Duration:         ${totalMs.toFixed(2)} ms`);
  console.log(`Throughput:       ${(totalClaimed / (totalMs / 1000)).toFixed(2)} jobs/sec`);
  console.log(`Avg claim latency: ${avgClaim.toFixed(2)} ms`);
  console.log('\nRecord these numbers in docs/operations/capacity.md §"measured baselines".');
}

main().catch((error: unknown) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
