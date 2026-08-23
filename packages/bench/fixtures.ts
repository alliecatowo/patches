import 'reflect-metadata';

import { createDataSource } from '@patches/database';
import { createTestActor, createTestFollow, createTestPost, truncateAll } from '@patches/testkit';

import { intEnv, loadBenchDatabaseUrl } from './env.js';

/**
 * P19-007 fixture generator: populates a scratch database with a social graph shaped like a
 * small node — N actors, a random follow graph, and a chronologically spread post history —
 * using the same testkit factories the integration tests use, so the schema mapping can
 * never drift from raw SQL.
 *
 * TRUNCATES the target database first. Never point DATABASE_URL at production.
 */
async function main(): Promise<void> {
  const nUsers = intEnv('BENCH_USERS', 100);
  const nFollows = intEnv('BENCH_FOLLOWS', 500);
  const nPosts = intEnv('BENCH_POSTS', 1000);

  const dataSource = createDataSource({ url: loadBenchDatabaseUrl(), ssl: false, logging: false });
  await dataSource.initialize();
  try {
    await truncateAll(dataSource);
    console.log(
      `Generating fixtures: ${String(nUsers)} actors, ${String(nFollows)} follows, ${String(nPosts)} posts`,
    );

    const actorIds: string[] = [];
    for (let i = 0; i < nUsers; i++) {
      // benchuser0 stays deterministic — feed-bench's default viewer handle.
      const actor = await createTestActor(dataSource.manager, { handle: `benchuser${String(i)}` });
      actorIds.push(actor.id);
    }
    console.log(`Created ${String(actorIds.length)} actors`);

    const seen = new Set<string>();
    const pick = (): string => {
      const id = actorIds[Math.floor(Math.random() * actorIds.length)];
      if (id === undefined) throw new Error('no actors to sample');
      return id;
    };
    let createdFollows = 0;
    while (createdFollows < nFollows) {
      const follower = pick();
      const followee = pick();
      if (follower === followee) continue;
      const key = `${follower}:${followee}`;
      if (seen.has(key)) continue; // follows has a unique (follower, followee) index
      seen.add(key);
      await createTestFollow(dataSource.manager, {
        followerActorId: follower,
        followeeActorId: followee,
      });
      createdFollows += 1;
    }
    console.log(`Created ${String(createdFollows)} follows`);

    // Spread createdAt so the (created_at DESC, id DESC) keyset has realistic cardinality.
    const base = Date.now() - nPosts * 60_000;
    for (let i = 0; i < nPosts; i++) {
      const author = pick();
      await createTestPost(dataSource.manager, {
        authorActorId: author,
        body: `Benchmark post ${String(i)} — sufficient body text to exercise the row width of a typical timeline post.`,
        createdAt: new Date(base + i * 60_000),
      });
    }
    console.log(`Created ${String(nPosts)} posts`);
  } finally {
    await dataSource.destroy();
  }
  console.log('Fixtures generated successfully');
}

main().catch((error: unknown) => {
  console.error('Fixture generation failed:', error);
  process.exit(1);
});
