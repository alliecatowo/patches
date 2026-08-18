import { createHash, randomUUID } from 'node:crypto';

import { createDataSource, Media } from '@patches/database';
import { mediaOriginalKey, mediaVariantKey, S3StorageClient } from '@patches/media';
import { createTestActor } from '@patches/testkit';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, type TestContext } from 'vitest';

import { type AppConfigService } from '../src/config/app-config.service.js';
import { CleanExpiredUploadsHandler } from '../src/jobs/handlers/clean-expired-uploads.handler.js';
import { ProcessMediaHandler } from '../src/jobs/handlers/process-media.handler.js';
import { isMinioReachable, TEST_MINIO_DEFAULTS } from './support/minio-env.js';

/**
 * `ProcessMediaHandler`/`CleanExpiredUploadsHandler` against real PostgreSQL and a real
 * (local, MinIO) S3-compatible store — not mocks (`docs/architecture/media.md` §4, ADR 0015).
 * Skips cleanly when either dependency isn't reachable, same pattern as
 * `job-runner.integration.test.ts`.
 *
 * MinIO reachability needs a real network probe (`await`), and this file compiles as
 * CommonJS (`apps/worker`'s convention) where top-level `await` isn't legal — so it's probed
 * inside `beforeAll` instead, and every `it()` calls `skipIfNoMinio(ctx)` as its first line
 * (`TestContext.skip()` is vitest's supported way to skip a running test from its body).
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseReachable = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;
if (!databaseReachable) {
  console.warn(
    '[apps/worker] Skipping media-processing integration tests: TEST_DATABASE_URL is not set.',
  );
}

function fakeConfig(overrides: Partial<AppConfigService> = {}): AppConfigService {
  return {
    mediaMaxBytes: 10 * 1024 * 1024,
    mediaMaxPixels: 20_000_000,
    mediaPendingUploadExpiryMinutes: 60,
    ...overrides,
  } as AppConfigService;
}

describe.skipIf(!databaseReachable)(
  'media processing (integration, real Postgres + real MinIO)',
  () => {
    let dataSource: DataSource;
    let storage: S3StorageClient;
    let ownerActorId: string;
    let minioReachable = false;

    function skipIfNoMinio(ctx: TestContext): void {
      if (!minioReachable) ctx.skip();
    }

    beforeAll(async () => {
      minioReachable = await isMinioReachable();
      if (!minioReachable) {
        console.warn(
          `[apps/worker] Skipping media-processing integration tests: MinIO is not reachable ` +
            `at ${TEST_MINIO_DEFAULTS.endpoint} (start it with \`mise run compose -- up -d\`).`,
        );
      }

      dataSource = createDataSource({ url: testDatabaseUrl! });
      await dataSource.initialize();
      await dataSource.runMigrations();

      storage = new S3StorageClient(TEST_MINIO_DEFAULTS);
      // One fixture actor for the whole file — `media.owner_actor_id` is `RESTRICT`, so every
      // row needs a real `actors` row.
      ownerActorId = (await createTestActor(dataSource.manager)).id;
    }, 30_000);

    afterAll(async () => {
      await dataSource.destroy();
    });

    beforeEach(async () => {
      // Plain DELETE, not `TRUNCATE ... CASCADE`: `actors.avatar_media_id` is a (nullable) FK
      // to `media`, so a CASCADE truncate of `media` also truncates `actors` outright — not
      // just nulling the reference — wiping the fixture actor `beforeAll` just created. DELETE
      // never touches `actors` since it doesn't need to cascade to anything (no `post_media`
      // rows exist in this suite).
      await dataSource.query('DELETE FROM "media"');
    });

    async function insertMedia(overrides: Partial<Media> = {}): Promise<Media> {
      const repo = dataSource.getRepository(Media);
      return repo.save(
        repo.create({
          id: randomUUID(),
          ownerActorId,
          state: 'PROCESSING',
          ...overrides,
        }),
      );
    }

    it('downloads a real upload from MinIO, decodes it, and uploads real derivatives', async (ctx) => {
      skipIfNoMinio(ctx);
      const media = await insertMedia();
      const bytes = await sharp({
        create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 200, b: 40 } },
      })
        .jpeg()
        .toBuffer();
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await storage.putObject(mediaOriginalKey(media.id), bytes, { contentType: 'image/jpeg' });

      const handler = new ProcessMediaHandler(dataSource, storage, fakeConfig());
      await handler.handle(
        { mediaId: media.id, expectedSha256: sha256 },
        { jobId: '1', attempt: 1 },
      );

      const row = await dataSource.getRepository(Media).findOneByOrFail({ id: media.id });
      expect(row.state).toBe('READY');
      expect(row.mimeType).toBe('image/jpeg');
      expect(row.width).toBe(200);
      expect(row.height).toBe(150);
      expect(row.contentHash).toBe(sha256);

      // The derivatives actually exist in MinIO, not just referenced by key.
      const display = await storage.head(mediaVariantKey(media.id, 'display'));
      const thumb = await storage.head(mediaVariantKey(media.id, 'thumb'));
      expect(display).not.toBeNull();
      expect(display?.contentType).toBe('image/webp');
      expect(thumb).not.toBeNull();
    });

    it('marks the row FAILED against a real corrupt upload, without touching derivatives', async (ctx) => {
      skipIfNoMinio(ctx);
      const media = await insertMedia();
      await storage.putObject(mediaOriginalKey(media.id), Buffer.from('not an image'), {
        contentType: 'image/png',
      });

      const handler = new ProcessMediaHandler(dataSource, storage, fakeConfig());
      await handler.handle({ mediaId: media.id }, { jobId: '1', attempt: 1 });

      const row = await dataSource.getRepository(Media).findOneByOrFail({ id: media.id });
      expect(row.state).toBe('FAILED');
      expect(await storage.head(mediaVariantKey(media.id, 'display'))).toBeNull();
    });

    it('CLEAN_EXPIRED_UPLOADS deletes a stale PENDING_UPLOAD row and its real MinIO object', async (ctx) => {
      skipIfNoMinio(ctx);
      const stale = await insertMedia({
        state: 'PENDING_UPLOAD',
        createdAt: new Date(Date.now() - 2 * 60 * 60_000),
      });
      await storage.putObject(mediaOriginalKey(stale.id), Buffer.from('abandoned upload'), {
        contentType: 'image/png',
      });
      // Not expired yet — must survive the sweep.
      const fresh = await insertMedia({ state: 'PENDING_UPLOAD' });

      const handler = new CleanExpiredUploadsHandler(dataSource, storage, fakeConfig());
      await handler.handle({}, { jobId: '1', attempt: 1 });

      expect(await dataSource.getRepository(Media).findOneBy({ id: stale.id })).toBeNull();
      expect(await storage.head(mediaOriginalKey(stale.id))).toBeNull();
      expect(await dataSource.getRepository(Media).findOneBy({ id: fresh.id })).not.toBeNull();
    });
  },
);
