import { createHash, randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createMediaClient,
  type AuthGrpcClient,
  type BeginMediaUploadRequest,
  type BeginMediaUploadResponse,
  type FinalizeMediaUploadRequest,
  type FinalizeMediaUploadResponse,
  type GetMediaDownloadRequest,
  type GetMediaDownloadResponse,
  type MediaGrpcClient,
} from '@patches/proto';
import { Media, OutboxJob } from '@patches/database';
import { S3StorageClient } from '@patches/media';
import { createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, type TestContext } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  type TestServer,
} from './support/test-server.js';
import { isMinioReachable, TEST_MINIO_DEFAULTS } from './support/minio-env.js';

/**
 * `MediaService` end-to-end over real gRPC against real PostgreSQL and a real (local, MinIO)
 * S3-compatible object store — the actual presigned PUT/GET flow, not a mocked
 * `StorageClient` (spec §118–§119, ADR 0015). Skips cleanly (with a clear message) when
 * either dependency isn't reachable, same pattern as every other `*.integration.test.ts`
 * file here.
 *
 * The MinIO check specifically can't gate `describe.skipIf` the way `TEST_DATABASE_URL`
 * does elsewhere: it needs a real network probe, which needs `await`, and this file compiles
 * as CommonJS (`apps/server`'s convention, `docs/agents/PACKAGE_CONVENTIONS.md`) — top-level
 * `await` isn't legal there. So it's probed inside `beforeAll` instead, and every `it()` below
 * calls `skipIfNoMinio(ctx)` as its first line (`TestContext.skip()` is vitest's supported way
 * to skip a running test from inside its body).
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseReachable = testDatabaseUrl !== undefined && testDatabaseUrl.length > 0;
if (!databaseReachable) {
  console.warn(
    '[apps/server] Skipping media integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

/** A minimal valid PNG (1x1, from `packages/terminal-media`'s well-known test fixture
 * pattern) — real bytes, real signature, small enough to inline. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe.skipIf(!databaseReachable)('media over gRPC (integration)', () => {
  let dataSource: DataSource;
  let server: TestServer;
  let auth: AuthGrpcClient;
  let media: MediaGrpcClient;
  let inviterUserId: string;
  let alice: TestActor;
  let bob: TestActor;
  let storage: S3StorageClient;
  let minioReachable = false;

  function skipIfNoMinio(ctx: TestContext): void {
    if (!minioReachable) ctx.skip();
  }

  beforeAll(async () => {
    minioReachable = await isMinioReachable();
    if (!minioReachable) {
      console.warn(
        `[apps/server] Skipping media integration tests: MinIO is not reachable at ` +
          `${TEST_MINIO_DEFAULTS.R2_ENDPOINT} (start it with \`mise run compose -- up -d\`).`,
      );
    }

    dataSource = await createServerTestDataSource();
    const { user } = await createTestUser(dataSource.manager, { handle: `inviter${testSuffix()}` });
    inviterUserId = user.id;

    server = await startTestServer();
    auth = createAuthClient(server.url, grpcCredentials.createInsecure());
    media = createMediaClient(server.url, grpcCredentials.createInsecure());

    alice = await registerTestActor(auth, dataSource, inviterUserId);
    bob = await registerTestActor(auth, dataSource, inviterUserId);

    storage = new S3StorageClient({
      endpoint: TEST_MINIO_DEFAULTS.R2_ENDPOINT,
      region: TEST_MINIO_DEFAULTS.R2_REGION,
      bucket: TEST_MINIO_DEFAULTS.R2_BUCKET,
      accessKeyId: TEST_MINIO_DEFAULTS.R2_ACCESS_KEY_ID,
      secretAccessKey: TEST_MINIO_DEFAULTS.R2_SECRET_ACCESS_KEY,
      forcePathStyle: true,
    });
  }, 60_000);

  afterAll(async () => {
    auth.close();
    media.close();
    await server.close();
    await dataSource.destroy();
  });

  function beginRequest(overrides: Partial<BeginMediaUploadRequest> = {}): BeginMediaUploadRequest {
    return {
      mimeType: 'image/png',
      byteSize: String(TINY_PNG.byteLength),
      sha256: createHash('sha256').update(TINY_PNG).digest('hex'),
      ...overrides,
    };
  }

  it('begins an upload, accepts a real PUT, finalizes, and enqueues PROCESS_MEDIA', async (ctx) => {
    skipIfNoMinio(ctx);
    const begin = await callUnary<BeginMediaUploadRequest, BeginMediaUploadResponse>(
      media.beginMediaUpload.bind(media),
      beginRequest(),
      { accessToken: alice.accessToken },
    );
    expect(begin.mediaId).toBeTruthy();
    expect(begin.uploadUrl).toContain(TEST_MINIO_DEFAULTS.R2_BUCKET);

    const putResponse = await fetch(begin.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: TINY_PNG,
    });
    expect(putResponse.status).toBe(200);

    const finalize = await callUnary<FinalizeMediaUploadRequest, FinalizeMediaUploadResponse>(
      media.finalizeMediaUpload.bind(media),
      { mediaId: begin.mediaId },
      { accessToken: alice.accessToken },
    );
    expect(finalize.status).toBe('MEDIA_STATUS_PROCESSING');

    const row = await dataSource.getRepository(Media).findOneByOrFail({ id: begin.mediaId });
    expect(row.state).toBe('PROCESSING');

    const job = await dataSource
      .getRepository(OutboxJob)
      .createQueryBuilder('job')
      .where('job.type = :type', { type: 'PROCESS_MEDIA' })
      .andWhere("job.payload->>'mediaId' = :mediaId", { mediaId: begin.mediaId })
      .getOne();
    expect(job).not.toBeNull();
    expect(job?.payload['expectedSha256']).toBe(beginRequest().sha256);
  });

  it('rejects an unsupported content type with MEDIA_UNSUPPORTED_TYPE / INVALID_ARGUMENT', async (ctx) => {
    skipIfNoMinio(ctx);
    const error = await expectRejection<BeginMediaUploadRequest, BeginMediaUploadResponse>(
      media.beginMediaUpload.bind(media),
      beginRequest({ mimeType: 'image/gif' }),
      { accessToken: alice.accessToken },
    );
    expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
  });

  it('rejects an oversized byte_size with MEDIA_TOO_LARGE / INVALID_ARGUMENT', async (ctx) => {
    skipIfNoMinio(ctx);
    const error = await expectRejection<BeginMediaUploadRequest, BeginMediaUploadResponse>(
      media.beginMediaUpload.bind(media),
      beginRequest({ byteSize: String(10 * 1024 * 1024 + 1) }),
      { accessToken: alice.accessToken },
    );
    expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
  });

  it('rejects BeginMediaUpload without an access token', async (ctx) => {
    skipIfNoMinio(ctx);
    const error = await expectRejection<BeginMediaUploadRequest, BeginMediaUploadResponse>(
      media.beginMediaUpload.bind(media),
      beginRequest(),
      {},
    );
    expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
  });

  it('is idempotent: finalizing an already-PROCESSING upload does not enqueue a second job', async (ctx) => {
    skipIfNoMinio(ctx);
    const begin = await callUnary<BeginMediaUploadRequest, BeginMediaUploadResponse>(
      media.beginMediaUpload.bind(media),
      beginRequest(),
      { accessToken: alice.accessToken },
    );
    await fetch(begin.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: TINY_PNG,
    });

    await callUnary<FinalizeMediaUploadRequest, FinalizeMediaUploadResponse>(
      media.finalizeMediaUpload.bind(media),
      { mediaId: begin.mediaId },
      { accessToken: alice.accessToken },
    );
    const second = await callUnary<FinalizeMediaUploadRequest, FinalizeMediaUploadResponse>(
      media.finalizeMediaUpload.bind(media),
      { mediaId: begin.mediaId },
      { accessToken: alice.accessToken },
    );
    expect(second.status).toBe('MEDIA_STATUS_PROCESSING');

    const jobs = await dataSource
      .getRepository(OutboxJob)
      .createQueryBuilder('job')
      .where('job.type = :type', { type: 'PROCESS_MEDIA' })
      .andWhere("job.payload->>'mediaId' = :mediaId", { mediaId: begin.mediaId })
      .getMany();
    expect(jobs).toHaveLength(1);
  });

  it('rejects FinalizeMediaUpload for media that belongs to a different actor', async (ctx) => {
    skipIfNoMinio(ctx);
    const begin = await callUnary<BeginMediaUploadRequest, BeginMediaUploadResponse>(
      media.beginMediaUpload.bind(media),
      beginRequest(),
      { accessToken: alice.accessToken },
    );

    const error = await expectRejection<FinalizeMediaUploadRequest, FinalizeMediaUploadResponse>(
      media.finalizeMediaUpload.bind(media),
      { mediaId: begin.mediaId },
      { accessToken: bob.accessToken },
    );
    expect(error.code).toBe(GrpcStatus.NOT_FOUND);
  });

  it('rejects GetMediaDownload for media that has not finished processing', async (ctx) => {
    skipIfNoMinio(ctx);
    const begin = await callUnary<BeginMediaUploadRequest, BeginMediaUploadResponse>(
      media.beginMediaUpload.bind(media),
      beginRequest(),
      { accessToken: alice.accessToken },
    );

    const error = await expectRejection<GetMediaDownloadRequest, GetMediaDownloadResponse>(
      media.getMediaDownload.bind(media),
      { mediaId: begin.mediaId },
      { accessToken: alice.accessToken },
    );
    expect(error.code).toBe(GrpcStatus.FAILED_PRECONDITION);
  });

  it('returns working presigned download/thumbnail URLs for READY media, to any authenticated caller', async (ctx) => {
    skipIfNoMinio(ctx);
    const mediaId = randomUUID();
    const displayKey = `media/${mediaId}/v/display`;
    const thumbnailKey = `media/${mediaId}/v/thumb`;
    const displayBytes = Buffer.from('display-derivative-bytes');
    await storage.putObject(displayKey, displayBytes, { contentType: 'image/webp' });
    await storage.putObject(thumbnailKey, Buffer.from('thumb'), { contentType: 'image/webp' });

    const media_ = dataSource.getRepository(Media);
    await media_.save(
      media_.create({
        id: mediaId,
        ownerActorId: alice.actorId,
        state: 'READY',
        mimeType: 'image/webp',
        width: 10,
        height: 8,
        displayObjectKey: displayKey,
        thumbnailObjectKey: thumbnailKey,
      }),
    );

    // `bob`, not `alice`: GetMediaDownload deliberately has no owner restriction
    // (`media.service.ts`'s documented reasoning — it serves any visible post's images).
    const result = await callUnary<GetMediaDownloadRequest, GetMediaDownloadResponse>(
      media.getMediaDownload.bind(media),
      { mediaId },
      { accessToken: bob.accessToken },
    );

    expect(result.status).toBe('MEDIA_STATUS_READY');
    expect(result.mimeType).toBe('image/webp');

    const downloaded = await fetch(result.downloadUrl);
    expect(downloaded.status).toBe(200);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(displayBytes);
  });

  it('rejects GetMediaDownload for an unknown media id', async (ctx) => {
    skipIfNoMinio(ctx);
    const error = await expectRejection<GetMediaDownloadRequest, GetMediaDownloadResponse>(
      media.getMediaDownload.bind(media),
      { mediaId: randomUUID() },
      { accessToken: alice.accessToken },
    );
    expect(error.code).toBe(GrpcStatus.NOT_FOUND);
  });
});
