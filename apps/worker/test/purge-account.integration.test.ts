import {
  AccountDeletionRequest,
  Actor,
  ActorFlair,
  Credential,
  createDataSource,
  Filter,
  FilterTerm,
  GuestbookEntry,
  Media,
  Notification,
  Page,
  PageRevision,
  PostEdit,
  Report,
} from '@patches/database';
import type { StorageClient } from '@patches/media';
import {
  createTestCredential,
  createTestGuestbookEntry,
  createTestNotification,
  createTestPage,
  createTestPost,
  createTestReport,
  createTestUser,
} from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PurgeAccountHandler } from '../src/jobs/handlers/purge-account.handler.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const storage = { deleteObject: () => Promise.resolve(undefined) } as unknown as StorageClient;

describe.skipIf(!testDatabaseUrl)('PurgeAccountHandler (integration, real Postgres)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createDataSource({ url: testDatabaseUrl! });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('erases edit history, pages, guestbook entries, filters, notifications, report text and credential secrets (S-H6)', async () => {
    const m = dataSource.manager;
    const { user, actor } = await createTestUser(m);
    const { actor: other } = await createTestUser(m);

    const post = await createTestPost(m, { authorActorId: actor.id, body: 'current body' });
    await m.getRepository(PostEdit).save(
      m.getRepository(PostEdit).create({
        postId: post.id,
        previousBody: 'secret earlier draft',
        previousContentWarning: 'secret earlier cw',
        previousMediaManifest: null,
        editedByActorId: actor.id,
      }),
    );

    const ownPage = await createTestPage(m, { actorId: actor.id, withRevision: true });
    const otherPage = await createTestPage(m, { actorId: other.id });
    const signedEntry = await createTestGuestbookEntry(m, {
      pageId: otherPage.id,
      authorActorId: actor.id,
      body: 'actor was here',
    });
    const othersEntryOnOwnPage = await createTestGuestbookEntry(m, {
      pageId: ownPage.id,
      authorActorId: other.id,
    });

    const filter = await m
      .getRepository(Filter)
      .save(m.getRepository(Filter).create({ actorId: actor.id, name: 'mine', action: 'HIDE' }));
    await m
      .getRepository(FilterTerm)
      .save(
        m
          .getRepository(FilterTerm)
          .create({ filterId: filter.id, kind: 'SUBSTRING', value: 'private term' }),
      );

    const received = await createTestNotification(m, {
      recipientActorId: actor.id,
      type: 'LIKE',
      actorId: other.id,
      postId: post.id,
    });
    const caused = await createTestNotification(m, {
      recipientActorId: other.id,
      type: 'FOLLOW',
      actorId: actor.id,
    });

    const report = await createTestReport(m, {
      reporterActorId: actor.id,
      subjectType: 'ACTOR',
      subjectActorId: other.id,
      details: 'my private report narrative',
    });

    const ssh = await createTestCredential(m, { userId: user.id, type: 'SSH_PUBLIC_KEY' });
    const password = await createTestCredential(m, { userId: user.id });
    await m
      .getRepository(ActorFlair)
      .save(m.getRepository(ActorFlair).create({ actorId: actor.id, document: { glyph: 'x' } }));
    await m
      .getRepository(Actor)
      .update(
        { id: actor.id },
        { nameplate: { text: 'hello' }, profileFrame: 'neon', accentColor: '#ff00ff' },
      );

    await m.getRepository(AccountDeletionRequest).save({
      actorId: actor.id,
      requestedAt: new Date(),
      purgeAfter: new Date(0),
      cancelledAt: null,
      purgedAt: null,
    });

    await new PurgeAccountHandler(dataSource, storage).handle(
      { actorId: actor.id },
      { jobId: 'purge-s-h6', attempt: 1 },
    );

    const count = async (entity: Parameters<DataSource['getRepository']>[0], where: object) =>
      dataSource.getRepository(entity).count({ where });

    expect(await count(PostEdit, { postId: post.id })).toBe(0);
    expect(await count(Page, { id: ownPage.id })).toBe(0);
    expect(await count(PageRevision, { pageId: ownPage.id })).toBe(0);
    expect(await count(GuestbookEntry, { id: signedEntry.id })).toBe(0);
    expect(await count(GuestbookEntry, { id: othersEntryOnOwnPage.id })).toBe(0);
    expect(await count(Page, { id: otherPage.id })).toBe(1);
    expect(await count(Filter, { id: filter.id })).toBe(0);
    expect(await count(FilterTerm, { filterId: filter.id })).toBe(0);
    expect(await count(Notification, { id: received.id })).toBe(0);
    expect(await count(Notification, { id: caused.id })).toBe(0);
    expect(await count(ActorFlair, { actorId: actor.id })).toBe(0);

    const scrubbedReport = await dataSource
      .getRepository(Report)
      .findOneByOrFail({ id: report.id });
    expect(scrubbedReport.details).toBeNull();

    for (const id of [ssh.id, password.id]) {
      const credential = await dataSource.getRepository(Credential).findOneByOrFail({ id });
      expect(credential.revokedAt).not.toBeNull();
      expect(credential.secretHash).toBeNull();
      expect(credential.identifier).toBeNull();
      expect(credential.publicMaterial).toBeNull();
    }

    const purged = await dataSource.getRepository(Actor).findOneByOrFail({ id: actor.id });
    expect(purged.nameplate).toBeNull();
    expect(purged.profileFrame).toBeNull();
    expect(purged.accentColor).toBeNull();
    expect(purged.avatarMediaId).toBeNull();
    expect(await dataSource.getRepository(Media).count({ where: { ownerActorId: actor.id } })).toBe(
      0,
    );
  });
});
