import 'reflect-metadata';

import { createDataSource, Actor } from '@patches/database';

import { intEnv, latencyReport, loadBenchDatabaseUrl, printLatencyReport } from './env.js';

/**
 * P19-007 home-feed baseline: `EXPLAIN (ANALYZE, BUFFERS)` plus raw latency timing on the
 * SQL core of `FeedService`'s originals leg — posts by the viewer and by actors they
 * follow, visibility-filtered, paged on the canonical `(created_at DESC, id DESC)` keyset
 * (see `apps/server/src/modules/feeds/feed.service.ts`; the bench deliberately measures the
 * indexed shape, without the app-side merge/aggregate passes).
 */
const HOME_FEED_QUERY = `
  SELECT p.*
  FROM posts p
  WHERE p.deleted_at IS NULL
    AND p.visibility = 'PUBLIC'
    AND (
      p.author_actor_id = $1
      OR EXISTS (
        SELECT 1
        FROM follows f
        WHERE f.follower_actor_id = $1
          AND f.followee_actor_id = p.author_actor_id
      )
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT 20
`;

async function measureIterations(
  label: string,
  run: () => Promise<void>,
  iterations: number,
): Promise<void> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  printLatencyReport(label, latencyReport(samples));
}

async function main(): Promise<void> {
  const iterations = intEnv('BENCH_ITERATIONS', 100);
  const viewerHandle = process.env.BENCH_VIEWER_HANDLE ?? 'benchuser0';

  const dataSource = createDataSource({ url: loadBenchDatabaseUrl(), ssl: false, logging: false });
  await dataSource.initialize();
  try {
    const viewer = await dataSource.getRepository(Actor).findOneBy({ handle: viewerHandle });
    if (viewer === null) {
      console.error(
        `Viewer @${viewerHandle} not found — run \`pnpm --filter @patches/bench setup\` first.`,
      );
      process.exit(1);
    }

    await measureIterations(
      `Home feed query (raw) — @${viewerHandle}, ${String(iterations)} iterations`,
      async () => {
        await dataSource.query(HOME_FEED_QUERY, [viewer.id]);
      },
      iterations,
    );

    const explainRows = await dataSource.query<Record<string, unknown>[]>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${HOME_FEED_QUERY}`,
      [viewer.id],
    );
    const plan = explainRows[0]?.['QUERY PLAN'];
    console.log('\n=== Query plan (EXPLAIN ANALYZE, BUFFERS) ===');
    console.log(typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2));

    console.log('\nRecord these numbers in docs/operations/capacity.md §"measured baselines".');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
