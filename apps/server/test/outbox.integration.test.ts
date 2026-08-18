import { createTestActor, createTestPost } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppConfigService } from '../src/config/app-config.service.js';
import {
  OUTBOX_FIRST_PAGE_MARKER,
  OutboxCollectionService,
} from '../src/modules/federation/services/outbox-collection.service.js';
import { createServerTestDataSource } from './support/database.js';
import { testSuffix } from './support/fixtures.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping outbox integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

const PUBLIC_ORIGIN = 'http://outbox-test.local';

function fakeConfig(): AppConfigService {
  return { publicOrigin: PUBLIC_ORIGIN } as AppConfigService;
}

/** B-027: real keyset pagination over the AS2 outbox — `OrderedCollection.first` into
 * `OrderedCollectionPage.next` — against real PostgreSQL (spec §118–119). Exercises
 * `OutboxCollectionService` directly rather than through the federation HTTP surface: no
 * business logic lives in `OutboxController` beyond status-code mapping. */
describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'outbox pagination (B-027, integration)',
  () => {
    let dataSource: DataSource;
    let service: OutboxCollectionService;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      service = new OutboxCollectionService(dataSource, fakeConfig());
    }, 60_000);

    afterAll(async () => {
      await dataSource.destroy();
    });

    it('returns undefined for a handle with no local actor', async () => {
      expect(await service.buildCollection(`nobody${testSuffix()}`)).toBeUndefined();
      expect(
        await service.buildPage(`nobody${testSuffix()}`, OUTBOX_FIRST_PAGE_MARKER),
      ).toBeUndefined();
    });

    it('paginates an actor with more posts than one page, oldest last', async () => {
      const handle = `outboxer${testSuffix()}`;
      const actor = await createTestActor(dataSource.manager, { handle });
      // Each post's `createdAt` is explicit, so creation order doesn't matter for the keyset
      // ordering under test — safe to fire concurrently.
      const posts = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          createTestPost(dataSource.manager, {
            authorActorId: actor.id,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
          }),
        ),
      );

      const collection = await service.buildCollection(handle.toLowerCase());
      expect(collection).toBeDefined();
      expect(collection?.type).toBe('OrderedCollection');
      expect(collection?.totalItems).toBe(25);
      const firstUrl = collection?.first as string;
      expect(firstUrl).toContain(`page=${OUTBOX_FIRST_PAGE_MARKER}`);

      const firstPage = await service.buildPage(handle.toLowerCase(), OUTBOX_FIRST_PAGE_MARKER);
      expect(firstPage?.type).toBe('OrderedCollectionPage');
      expect(firstPage?.partOf).toBe(`${PUBLIC_ORIGIN}/users/${handle.toLowerCase()}/outbox`);
      const firstItems = firstPage?.orderedItems as { id: string }[];
      expect(firstItems).toHaveLength(20);
      // Newest first: the 25th post created (index 24) is the newest.
      expect(firstItems[0]?.id).toContain(posts[24]!.id);
      expect(firstPage?.next).toBeDefined();

      const nextCursor = decodeURIComponent(new URL(firstPage!.next as string).search.slice(6));
      const secondPage = await service.buildPage(handle.toLowerCase(), nextCursor);
      const secondItems = secondPage?.orderedItems as { id: string }[];
      expect(secondItems).toHaveLength(5);
      expect(secondItems[4]?.id).toContain(posts[0]!.id);
      expect(secondPage?.next).toBeUndefined();
    });

    it('rejects a malformed page cursor', async () => {
      const handle = `outboxbad${testSuffix()}`;
      await createTestActor(dataSource.manager, { handle });
      await expect(service.buildPage(handle.toLowerCase(), 'not-a-cursor')).rejects.toThrow();
    });
  },
);
