import 'reflect-metadata';

import { createDataSource } from '@patches/database';

import { intEnv, latencyReport, loadBenchDatabaseUrl, printLatencyReport } from './env.js';

/**
 * P19-007 pool-saturation baseline: `POOL_MAX` connections under `BENCH_POOL_CONCURRENT`
 * concurrent queriers running `pg_sleep` at `BENCH_QUERY_DELAY` ms, measuring how latency
 * degrades while queued for a slot — the curve `docs/operations/capacity.md`'s pool-sizing
 * guidance needs.
 */
async function main(): Promise<void> {
  const poolMax = intEnv('DATABASE_POOL_MAX', 10);
  const nConcurrent = intEnv('BENCH_POOL_CONCURRENT', 50);
  const nIterations = intEnv('BENCH_POOL_ITERATIONS', 100);
  const queryDelayMs = intEnv('BENCH_QUERY_DELAY', 5);

  const dataSource = createDataSource({
    url: loadBenchDatabaseUrl(),
    ssl: false,
    logging: false,
    poolMax,
  });
  await dataSource.initialize();
  try {
    console.log(
      `Pool benchmark: pool_max=${String(poolMax)}, concurrent=${String(nConcurrent)}, ` +
        `iterations/worker=${String(nIterations)}, pg_sleep=${String(queryDelayMs)}ms`,
    );

    const latencies: number[] = [];
    const errors: string[] = [];

    const singleQuery = async (): Promise<void> => {
      const start = performance.now();
      try {
        await dataSource.query('SELECT pg_sleep($1)', [String(queryDelayMs / 1000)]);
        latencies.push(performance.now() - start);
      } catch (error) {
        latencies.push(performance.now() - start);
        errors.push(error instanceof Error ? error.message : String(error));
      }
    };

    const worker = async (): Promise<void> => {
      for (let i = 0; i < nIterations; i++) {
        await singleQuery();
      }
    };

    const start = performance.now();
    await Promise.all(Array.from({ length: nConcurrent }, () => worker()));
    const totalMs = performance.now() - start;

    printLatencyReport(
      `Connection pool (pool_max=${String(poolMax)}, ${String(nConcurrent)} concurrent)`,
      latencyReport(latencies),
    );
    console.log(`Throughput: ${(latencies.length / (totalMs / 1000)).toFixed(2)} queries/sec`);
    console.log(`Errors:     ${String(errors.length)}`);
    for (const message of errors.slice(0, 5)) {
      console.log(`  ${message}`);
    }
    console.log('\nRecord these numbers in docs/operations/capacity.md §"measured baselines".');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
