import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationExecutor } from 'typeorm';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../src/data-source.js';
import { Actor } from '../src/entities/actor.entity.js';
import { Credential } from '../src/entities/credential.entity.js';
import { Post } from '../src/entities/post.entity.js';
import { User } from '../src/entities/user.entity.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn(
    '[packages/database] Skipping Phase 1 schema integration tests: TEST_DATABASE_URL is not set.',
  );
}

describe.skipIf(!testDatabaseUrl)('Phase 1 schema (integration, real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createDataSource({ url: testDatabaseUrl! });
    await dataSource.initialize();
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  /** Actor + user pair, in the order the circular FKs force (see the testkit factories). */
  async function createAccount(handle = `h_${randomUUID().slice(0, 8)}`): Promise<{
    user: User;
    actor: Actor;
  }> {
    const actor = await dataSource.getRepository(Actor).save({
      handle,
      handleNormalized: handle,
      isLocal: true,
      userId: null,
    } as Partial<Actor>);
    const email = `${randomUUID().slice(0, 8)}@example.test`;
    const user = await dataSource.getRepository(User).save({
      recoveryEmail: email,
      recoveryEmailNormalized: email,
      status: 'ACTIVE',
      actorId: actor.id,
    } as Partial<User>);
    await dataSource.getRepository(Actor).update({ id: actor.id }, { userId: user.id });
    return { user, actor };
  }

  it('creates every Phase 1/2 table with snake_case names', async () => {
    const rows = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      'actors',
      'app_meta',
      'auth_codes',
      'blocks',
      'bookmarks',
      'credentials',
      'follows',
      'invites',
      'likes',
      'media',
      'migrations',
      'mutes',
      'notifications',
      'outbox_jobs',
      'post_media',
      'posts',
      'refresh_tokens',
      'reports',
      'ssh_login_challenges',
      'users',
    ]);
  });

  it('has every index required by INITIAL_VISION.md §60 that applies to these tables', async () => {
    const rows = await dataSource.query<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const names = new Set(rows.map((row) => row.indexname));
    for (const required of [
      'idx_actors_handle_normalized',
      'idx_posts_author_actor_id_created_at_id',
      'idx_posts_created_at_id',
      'idx_posts_created_at_id_root_post_id',
      'idx_posts_created_at_id_in_reply_to_id',
      'idx_media_created_at_owner_actor_id',
      'idx_outbox_jobs_available_at_id_status',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('keeps the feed indexes DESC, so keyset paging (§46) can scan them forwards', async () => {
    const rows = await dataSource.query<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_posts_author_actor_id_created_at_id'`,
    );
    expect(rows[0]?.indexdef).toContain('created_at DESC');
    expect(rows[0]?.indexdef).toContain('id DESC');
  });

  it('rejects a duplicate normalized handle', async () => {
    const handle = `dup_${randomUUID().slice(0, 8)}`;
    await createAccount(handle);
    await expect(createAccount(handle)).rejects.toThrow(/duplicate key|unique/i);
  });

  it('rejects a second post with the same (author, client_request_id) — §45 idempotency', async () => {
    const { actor } = await createAccount();
    const clientRequestId = randomUUID();

    const insertPost = async (): Promise<Post> => {
      const id = randomUUID();
      return dataSource.getRepository(Post).save({
        id,
        authorActorId: actor.id,
        rootPostId: id,
        body: 'hello',
        postType: 'NOTE',
        visibility: 'PUBLIC',
        isLocal: true,
        clientRequestId,
      } as Partial<Post>);
    };

    await insertPost();
    await expect(insertPost()).rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows many posts with a null client_request_id (NULLs are distinct in a unique index)', async () => {
    const { actor } = await createAccount();
    for (let index = 0; index < 2; index += 1) {
      const id = randomUUID();
      await dataSource.getRepository(Post).save({
        id,
        authorActorId: actor.id,
        rootPostId: id,
        body: `post ${index}`,
        postType: 'NOTE',
        visibility: 'PUBLIC',
        isLocal: true,
        clientRequestId: null,
      } as Partial<Post>);
    }
    expect(await dataSource.getRepository(Post).countBy({ authorActorId: actor.id })).toBe(2);
  });

  it('enforces the enum CHECK constraints rather than trusting the application', async () => {
    const { actor } = await createAccount();
    const id = randomUUID();
    await expect(
      dataSource.getRepository(Post).save({
        id,
        authorActorId: actor.id,
        rootPostId: id,
        body: 'x',
        postType: 'NOTE',
        // Invalid on purpose: the DB is the last line of defence for enum-ish text columns.
        visibility: 'SECRET' as never,
        isLocal: true,
      } as Partial<Post>),
    ).rejects.toThrow(/chk_posts_visibility/);
  });

  it('scopes credential uniqueness to live rows only (partial unique index)', async () => {
    const { user } = await createAccount();
    const identifier = `SHA256:${randomUUID()}`;
    const credentials = dataSource.getRepository(Credential);
    const key = (): Partial<Credential> => ({
      userId: user.id,
      type: 'SSH_PUBLIC_KEY',
      identifier,
      publicMaterial: 'ssh-ed25519 AAAA',
    });

    const first = await credentials.save(key());
    await expect(credentials.save(key())).rejects.toThrow(/duplicate key|unique/i);

    // Revoking the first one frees the fingerprint for re-enrollment (§165).
    await credentials.update({ id: first.id }, { revokedAt: new Date() });
    await expect(credentials.save(key())).resolves.toBeDefined();
  });

  it('allows at most one live PASSWORD credential per user', async () => {
    const { user } = await createAccount();
    const credentials = dataSource.getRepository(Credential);
    const password = (): Partial<Credential> => ({
      userId: user.id,
      type: 'PASSWORD',
      // Null identifier: a password login resolves the user by handle/recovery email first.
      identifier: null,
      secretHash: '$argon2id$fake',
    });

    await credentials.save(password());
    await expect(credentials.save(password())).rejects.toThrow(/duplicate key|unique/i);
  });

  it('rejects an invite whose uses exceed max_uses', async () => {
    const { user } = await createAccount();
    await expect(
      dataSource.query(
        `INSERT INTO "invites" ("code_hash", "created_by_user_id", "max_uses", "uses") VALUES ($1, $2, 1, 2)`,
        [`hash-${randomUUID()}`, user.id],
      ),
    ).rejects.toThrow(/chk_invites_uses_within_max/);
  });

  it('round-trips down and back up, and reports no pending migrations', async () => {
    const executor = new MigrationExecutor(dataSource);
    expect(await executor.getPendingMigrations()).toHaveLength(0);

    // Revert everything down to the Phase 0 migration (CreateAppMeta), whatever has been
    // stacked on top since — this test must not break every time a phase adds a migration.
    while ((await executor.getExecutedMigrations()).length > 1) {
      await dataSource.undoLastMigration();
    }
    const queryRunner = dataSource.createQueryRunner();
    try {
      expect(await queryRunner.getTable('posts')).toBeUndefined();
      expect(await queryRunner.getTable('credentials')).toBeUndefined();
      // The Phase 0 migration is untouched by the Phase 1 revert.
      expect(await queryRunner.getTable('app_meta')).toBeDefined();
    } finally {
      await queryRunner.release();
    }

    await dataSource.runMigrations();
    const restored = dataSource.createQueryRunner();
    try {
      expect(await restored.getTable('posts')).toBeDefined();
    } finally {
      await restored.release();
    }
  });
});
