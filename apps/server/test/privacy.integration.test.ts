import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  ACCOUNT_EXPORT_STATUS,
  createAuthClient,
  createPrivacyClient,
  type AcknowledgePrivacyNoticeRequest,
  type AcknowledgePrivacyNoticeResponse,
  type AuthGrpcClient,
  type CancelAccountDeletionRequest,
  type CancelAccountDeletionResponse,
  type ExportAccountRequest,
  type ExportAccountResponse,
  type GetDeletionStatusRequest,
  type GetDeletionStatusResponse,
  type GetExportStatusRequest,
  type GetExportStatusResponse,
  type GetPrivacyPrefsRequest,
  type GetPrivacyPrefsResponse,
  type PrivacyGrpcClient,
  type RequestAccountDeletionRequest,
  type RequestAccountDeletionResponse,
  type UpdatePrivacyPrefsRequest,
  type UpdatePrivacyPrefsResponse,
} from '@patches/proto';
import {
  AccountDeletionRequest,
  AccountExport,
  Actor,
  OutboxJob,
  RefreshToken,
} from '@patches/database';
import { createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, type TestContext } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import { isMinioReachable, prepareMediaTestEnv } from './support/minio-env.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  type TestServer,
} from './support/test-server.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping privacy integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

/**
 * `PrivacyService` over real gRPC against real PostgreSQL (spec §197, P14-010). Covers the
 * request/response contract and the outbox side-effects `ExportAccount`/
 * `RequestAccountDeletion` are supposed to have — never the worker jobs themselves
 * (`ExportAccountHandler`/`PurgeAccountHandler` have their own unit tests in
 * `apps/worker/src/jobs/handlers/`, including the purge idempotency case this file's name
 * might suggest belongs here).
 */
describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'PrivacyService over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let privacy: PrivacyGrpcClient;
    let inviterUserId: string;

    beforeAll(async () => {
      prepareMediaTestEnv();
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      const insecure = grpcCredentials.createInsecure();
      auth = createAuthClient(server.url, insecure);
      privacy = createPrivacyClient(server.url, insecure);
    }, 60_000);

    afterAll(async () => {
      await server.close();
      await dataSource.destroy();
    });

    async function freshActor(): Promise<TestActor> {
      return registerTestActor(auth, dataSource, inviterUserId);
    }

    /** `@grpc/proto-loader`'s literal wire shape for `google.protobuf.FieldMask` is
     * `{ paths: string[] }`, not the flat `string[]` ts-proto's generated
     * `UpdatePrivacyPrefsRequest.updateMask` type claims (LEARNINGS: proto-fieldmask-wire-
     * shape; mirrors `actors.integration.test.ts`'s identical helper). */
    function fieldMask(paths: string[]): UpdatePrivacyPrefsRequest['updateMask'] {
      return { paths } as unknown as UpdatePrivacyPrefsRequest['updateMask'];
    }

    it('registration itself already recorded an acknowledgement (§197.1)', async () => {
      const actor = await freshActor();

      const response = await callUnary<GetPrivacyPrefsRequest, GetPrivacyPrefsResponse>(
        privacy.getPrivacyPrefs.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );

      expect(response.prefs?.privacyNoticeVersion).toBe(0);
      expect(response.prefs?.privacyNoticeAcknowledgedAt).toBeDefined();
      expect(response.prefs?.discoverable).toBe(true);
      expect(response.prefs?.indexable).toBe(true);
      expect(response.prefs?.showInLocalFeed).toBe(true);
      expect(response.prefs?.locked).toBe(false);
    });

    it('AcknowledgePrivacyNotice records the version and a fresh timestamp', async () => {
      const actor = await freshActor();

      const response = await callUnary<
        AcknowledgePrivacyNoticeRequest,
        AcknowledgePrivacyNoticeResponse
      >(
        privacy.acknowledgePrivacyNotice.bind(privacy),
        { noticeVersion: 3 },
        { accessToken: actor.accessToken },
      );
      expect(response.prefs?.privacyNoticeVersion).toBe(3);

      const roundtrip = await callUnary<GetPrivacyPrefsRequest, GetPrivacyPrefsResponse>(
        privacy.getPrivacyPrefs.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );
      expect(roundtrip.prefs?.privacyNoticeVersion).toBe(3);
    });

    it('UpdatePrivacyPrefs applies only the fields named in update_mask', async () => {
      const actor = await freshActor();

      const response = await callUnary<UpdatePrivacyPrefsRequest, UpdatePrivacyPrefsResponse>(
        privacy.updatePrivacyPrefs.bind(privacy),
        {
          discoverable: false,
          indexable: false,
          showInLocalFeed: false,
          locked: true,
          updateMask: fieldMask(['locked']),
        },
        { accessToken: actor.accessToken },
      );

      // Only `locked` was in the mask — the other three false values on the wire must not
      // have applied.
      expect(response.prefs?.locked).toBe(true);
      expect(response.prefs?.discoverable).toBe(true);
      expect(response.prefs?.indexable).toBe(true);
      expect(response.prefs?.showInLocalFeed).toBe(true);
    });

    it('ExportAccount enqueues a PENDING row and job; a second call while PENDING is idempotent', async () => {
      const actor = await freshActor();

      const first = await callUnary<ExportAccountRequest, ExportAccountResponse>(
        privacy.exportAccount.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );
      expect(first.export?.status).toBe(ACCOUNT_EXPORT_STATUS.PENDING);
      expect(first.export?.id).toBeTruthy();

      const row = await dataSource
        .getRepository(AccountExport)
        .findOneOrFail({ where: { id: first.export!.id } });
      expect(row.actorId).toBe(actor.actorId);
      expect(row.status).toBe('PENDING');

      const jobs = await dataSource
        .getRepository(OutboxJob)
        .find({ where: { type: 'EXPORT_ACCOUNT' } });
      const job = jobs.find(
        (candidate) => (candidate.payload as { exportId?: string }).exportId === row.id,
      );
      expect(job).toBeDefined();
      expect(job?.status).toBe('PENDING');

      const second = await callUnary<ExportAccountRequest, ExportAccountResponse>(
        privacy.exportAccount.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );
      expect(second.export?.id).toBe(first.export?.id);

      const status = await callUnary<GetExportStatusRequest, GetExportStatusResponse>(
        privacy.getExportStatus.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );
      expect(status.export?.status).toBe(ACCOUNT_EXPORT_STATUS.PENDING);
      expect(status.export?.downloadUrl ?? '').toBe('');
    });

    it('GetExportStatus returns a presigned download URL once the row is READY', async (ctx: TestContext) => {
      if (!(await isMinioReachable())) {
        ctx.skip();
        return;
      }

      const actor = await freshActor();
      const enqueued = await callUnary<ExportAccountRequest, ExportAccountResponse>(
        privacy.exportAccount.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );

      // Simulates what `ExportAccountHandler` does at the end of a successful run — this file
      // tests the RPC's read side of "READY", not the worker (see the class doc above).
      await dataSource.getRepository(AccountExport).update(
        { id: enqueued.export!.id },
        {
          status: 'READY',
          readyAt: new Date(),
          objectKey: `exports/${actor.actorId}/${enqueued.export!.id}.json`,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      );

      const status = await callUnary<GetExportStatusRequest, GetExportStatusResponse>(
        privacy.getExportStatus.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );
      expect(status.export?.status).toBe(ACCOUNT_EXPORT_STATUS.READY);
      expect(status.export?.downloadUrl).toMatch(/^https?:\/\//);
      expect(status.export?.expiresAt).toBeDefined();
    });

    it('RequestAccountDeletion revokes sessions, schedules a purge job, and is idempotent', async () => {
      const actor = await freshActor();

      const first = await callUnary<RequestAccountDeletionRequest, RequestAccountDeletionResponse>(
        privacy.requestAccountDeletion.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );
      expect(first.deletion?.pending).toBe(true);
      expect(first.deletion?.purgeAfter).toBeDefined();

      const requestRow = await dataSource
        .getRepository(AccountDeletionRequest)
        .findOneOrFail({ where: { actorId: actor.actorId } });
      expect(requestRow.cancelledAt).toBeNull();
      expect(requestRow.purgedAt).toBeNull();

      const purgeJobs = await dataSource
        .getRepository(OutboxJob)
        .find({ where: { type: 'PURGE_ACCOUNT' } });
      const purgeJob = purgeJobs.find(
        (candidate) => (candidate.payload as { actorId?: string }).actorId === actor.actorId,
      );
      expect(purgeJob).toBeDefined();
      expect(purgeJob?.status).toBe('PENDING');

      const actorRow = await dataSource
        .getRepository(Actor)
        .findOneOrFail({ where: { id: actor.actorId } });
      const refreshTokens = await dataSource
        .getRepository(RefreshToken)
        .find({ where: { userId: actorRow.userId ?? '' } });
      expect(refreshTokens.length).toBeGreaterThan(0);
      expect(refreshTokens.every((token) => token.revokedAt !== null)).toBe(true);

      // Idempotent: a second request while already pending returns the same status and does
      // not enqueue a second job.
      const second = await callUnary<RequestAccountDeletionRequest, RequestAccountDeletionResponse>(
        privacy.requestAccountDeletion.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );
      expect(second.deletion?.requestedAt).toEqual(first.deletion?.requestedAt);

      const purgeJobsAfter = await dataSource
        .getRepository(OutboxJob)
        .find({ where: { type: 'PURGE_ACCOUNT' } });
      const matching = purgeJobsAfter.filter(
        (candidate) => (candidate.payload as { actorId?: string }).actorId === actor.actorId,
      );
      expect(matching).toHaveLength(1);
    });

    it('CancelAccountDeletion restores the account and removes the pending purge job', async () => {
      const actor = await freshActor();
      await callUnary<RequestAccountDeletionRequest, RequestAccountDeletionResponse>(
        privacy.requestAccountDeletion.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );

      const cancelled = await callUnary<
        CancelAccountDeletionRequest,
        CancelAccountDeletionResponse
      >(privacy.cancelAccountDeletion.bind(privacy), {}, { accessToken: actor.accessToken });
      expect(cancelled.deletion?.pending).toBe(false);
      expect(cancelled.deletion?.cancelledAt).toBeDefined();

      const purgeJobs = await dataSource
        .getRepository(OutboxJob)
        .find({ where: { type: 'PURGE_ACCOUNT', status: 'PENDING' } });
      expect(
        purgeJobs.some(
          (candidate) => (candidate.payload as { actorId?: string }).actorId === actor.actorId,
        ),
      ).toBe(false);

      const status = await callUnary<GetDeletionStatusRequest, GetDeletionStatusResponse>(
        privacy.getDeletionStatus.bind(privacy),
        {},
        { accessToken: actor.accessToken },
      );
      expect(status.deletion?.pending).toBe(false);

      const error = await expectRejection<
        CancelAccountDeletionRequest,
        CancelAccountDeletionResponse
      >(privacy.cancelAccountDeletion.bind(privacy), {}, { accessToken: actor.accessToken });
      expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    });

    it('every RPC requires authentication', async () => {
      const error = await expectRejection<GetPrivacyPrefsRequest, GetPrivacyPrefsResponse>(
        privacy.getPrivacyPrefs.bind(privacy),
        {},
      );
      expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
    });
  },
);
