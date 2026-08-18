import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Actor, Credential, Post, User } from '@patches/database';
import type { DataSource } from 'typeorm';
import { createTestDataSource } from '../src/create-test-data-source.js';
import { withTransactionRollback } from '../src/with-transaction-rollback.js';
import {
  createTestActor,
  createTestCredential,
  createTestInvite,
  createTestPost,
  createTestUser,
} from '../src/factories/index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.warn('[packages/testkit] Skipping factory tests: TEST_DATABASE_URL is not set.');
}

describe.skipIf(!testDatabaseUrl)('fixture factories (integration, real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('createTestUser() writes the actor/user pair and back-fills the circular FK', async () => {
    await withTransactionRollback(dataSource, async (manager) => {
      const { user, actor } = await createTestUser(manager);

      expect(user.actorId).toBe(actor.id);
      const storedActor = await manager.getRepository(Actor).findOneByOrFail({ id: actor.id });
      expect(storedActor.userId).toBe(user.id);
      expect(storedActor.handleNormalized).toBe(storedActor.handle.toLowerCase());

      const storedUser = await manager.getRepository(User).findOneByOrFail({ id: user.id });
      expect(storedUser.status).toBe('ACTIVE');
    });
  });

  it('createTestActor() makes a standalone actor with no account', async () => {
    await withTransactionRollback(dataSource, async (manager) => {
      const actor = await createTestActor(manager, { handle: 'remote_friend' });
      expect(actor.userId).toBeNull();
      expect(actor.handle).toBe('remote_friend');
    });
  });

  it('createTestCredential() defaults to a PASSWORD credential with a fake secret', async () => {
    await withTransactionRollback(dataSource, async (manager) => {
      const { user } = await createTestUser(manager);
      const credential = await createTestCredential(manager, { userId: user.id });

      const stored = await manager.getRepository(Credential).findOneByOrFail({ id: credential.id });
      expect(stored.type).toBe('PASSWORD');
      // Never a real Argon2id hash: fixtures must not pay a KDF's cost per row.
      expect(stored.secretHash).toMatch(/^\$argon2id\$fake\$/);
      expect(stored.identifier).toBeNull();
      expect(stored.revokedAt).toBeNull();
    });
  });

  it('createTestPost() self-references root_post_id, and replies inherit it', async () => {
    await withTransactionRollback(dataSource, async (manager) => {
      const { actor } = await createTestUser(manager);
      const root = await createTestPost(manager, { authorActorId: actor.id });
      expect(root.rootPostId).toBe(root.id);
      expect(root.inReplyToId).toBeNull();

      const reply = await createTestPost(manager, {
        authorActorId: actor.id,
        inReplyTo: root,
        body: 'a reply',
      });
      expect(reply.inReplyToId).toBe(root.id);
      expect(reply.rootPostId).toBe(root.id);

      expect(await manager.getRepository(Post).countBy({ rootPostId: root.id })).toBe(2);
    });
  });

  it('createTestInvite() defaults to a single-use invite', async () => {
    await withTransactionRollback(dataSource, async (manager) => {
      const { user } = await createTestUser(manager);
      const invite = await createTestInvite(manager, { createdByUserId: user.id });
      expect(invite.maxUses).toBe(1);
      expect(invite.uses).toBe(0);
    });
  });

  it('rolls every fixture back with the test transaction', async () => {
    let userId = '';
    await withTransactionRollback(dataSource, async (manager) => {
      const { user } = await createTestUser(manager);
      userId = user.id;
    });
    expect(await dataSource.getRepository(User).findOneBy({ id: userId })).toBeNull();
  });
});
