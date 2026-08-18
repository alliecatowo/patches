import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createModerationClient,
  createPageClient,
  type AuthGrpcClient,
  type BlockActorRequest,
  type BlockActorResponse,
  type GetPageRequest,
  type GetPageResponse,
  type ListGuestbookRequest,
  type ListGuestbookResponse,
  type ListPageRevisionsRequest,
  type ListPageRevisionsResponse,
  type ModerationGrpcClient,
  type PageGrpcClient,
  type RemoveGuestbookEntryRequest,
  type RemoveGuestbookEntryResponse,
  type ReportGuestbookEntryRequest,
  type ReportGuestbookEntryResponse,
  type SignGuestbookRequest,
  type SignGuestbookResponse,
  type UpdatePageRequest,
  type UpdatePageResponse,
} from '@patches/proto';
import { ReportReason } from '@patches/proto/nest';
import { createTestUser } from '@patches/testkit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, testSuffix, type TestActor } from './support/fixtures.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  type TestServer,
} from './support/test-server.js';

/**
 * `PageService` end-to-end over real gRPC against real PostgreSQL (spec §118–119, Phase 4.5,
 * P45-003/P45-008): the `UpdatePage` -> `GetPage` -> `ListPageRevisions` immutable revision
 * chain, guestbook sign/list/remove, the `SignGuestbook` rate limit (§102), and
 * block-awareness (§62) on `GetPage`/`ListGuestbook`/`SignGuestbook`.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping pages integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

function minimalDocument(bodyText = 'hello from a page'): Record<string, unknown> {
  return {
    version: 1,
    theme: { accent: '#c678dd', border: 'round' },
    pages: [{ slug: 'index', title: 'test page', blocks: [{ type: 'Text', body: bodyText }] }],
  };
}

function documentBytes(doc: Record<string, unknown> = minimalDocument()): Buffer {
  return Buffer.from(JSON.stringify(doc), 'utf8');
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'PageService over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let moderation: ModerationGrpcClient;
    let pages: PageGrpcClient;
    let inviterUserId: string;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      moderation = createModerationClient(server.url, grpcCredentials.createInsecure());
      pages = createPageClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      moderation.close();
      pages.close();
      await server.close();
      await dataSource.destroy();
    });

    async function newActor(): Promise<TestActor> {
      return registerTestActor(auth, dataSource, inviterUserId);
    }

    async function publishPage(owner: TestActor, body = 'hello from a page'): Promise<void> {
      await callUnary<UpdatePageRequest, UpdatePageResponse>(
        pages.updatePage.bind(pages),
        { document: documentBytes(minimalDocument(body)) },
        { accessToken: owner.accessToken },
      );
    }

    describe('UpdatePage / GetPage / ListPageRevisions', () => {
      it('writes an immutable revision chain and serves the current one back', async () => {
        const owner = await newActor();

        const first = await callUnary<UpdatePageRequest, UpdatePageResponse>(
          pages.updatePage.bind(pages),
          { document: documentBytes(minimalDocument('v1')) },
          { accessToken: owner.accessToken },
        );
        expect(first.revisionId).toBeTruthy();

        const fetched = await callUnary<GetPageRequest, GetPageResponse>(
          pages.getPage.bind(pages),
          { handle: owner.handle, slug: '' },
          {},
        );
        expect(fetched.ownerActorId).toBe(owner.actorId);
        expect(fetched.revisionId).toBe(first.revisionId);
        expect(fetched.activeSlug).toBe('index');
        expect(fetched.theme?.accent).toBe('#c678dd');
        expect(JSON.parse(fetched.document.toString('utf8'))).toMatchObject({
          pages: [{ slug: 'index', blocks: [{ type: 'Text', body: 'v1' }] }],
        });

        const second = await callUnary<UpdatePageRequest, UpdatePageResponse>(
          pages.updatePage.bind(pages),
          { document: documentBytes(minimalDocument('v2')) },
          { accessToken: owner.accessToken },
        );
        expect(second.revisionId).not.toBe(first.revisionId);

        const revisions = await callUnary<ListPageRevisionsRequest, ListPageRevisionsResponse>(
          pages.listPageRevisions.bind(pages),
          { cursor: '', limit: 20 },
          { accessToken: owner.accessToken },
        );
        expect(revisions.revisions.map((revision) => revision.id)).toEqual([
          second.revisionId,
          first.revisionId,
        ]);

        const refetched = await callUnary<GetPageRequest, GetPageResponse>(
          pages.getPage.bind(pages),
          { handle: owner.handle, slug: '' },
          {},
        );
        expect(refetched.revisionId).toBe(second.revisionId);
      });

      it('rejects an invalid document with VALIDATION_ERROR', async () => {
        const owner = await newActor();
        const rejected = await expectRejection<UpdatePageRequest, UpdatePageResponse>(
          pages.updatePage.bind(pages),
          { document: documentBytes({ version: 2, pages: [] }) },
          { accessToken: owner.accessToken },
        );
        expect(rejected.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('reports NOT_FOUND for a page that was never written', async () => {
        const neverWrote = await newActor();
        const rejected = await expectRejection<GetPageRequest, GetPageResponse>(
          pages.getPage.bind(pages),
          { handle: neverWrote.handle, slug: '' },
          {},
        );
        expect(rejected.code).toBe(GrpcStatus.NOT_FOUND);
      });

      it('gives a fresh actor an empty revision history rather than an error', async () => {
        const neverWrote = await newActor();
        const revisions = await callUnary<ListPageRevisionsRequest, ListPageRevisionsResponse>(
          pages.listPageRevisions.bind(pages),
          { cursor: '', limit: 20 },
          { accessToken: neverWrote.accessToken },
        );
        expect(revisions.revisions).toEqual([]);
      });
    });

    describe('block-awareness (§62)', () => {
      it('hides a page, its guestbook, and refuses a sign for a blocked-either-direction actor', async () => {
        const owner = await newActor();
        const viewer = await newActor();
        await publishPage(owner);

        await callUnary<BlockActorRequest, BlockActorResponse>(
          moderation.blockActor.bind(moderation),
          { actorId: viewer.actorId },
          { accessToken: owner.accessToken },
        );

        const rejectedGet = await expectRejection<GetPageRequest, GetPageResponse>(
          pages.getPage.bind(pages),
          { handle: owner.handle, slug: '' },
          { accessToken: viewer.accessToken },
        );
        expect(rejectedGet.code).toBe(GrpcStatus.NOT_FOUND);

        const rejectedGuestbook = await expectRejection<
          ListGuestbookRequest,
          ListGuestbookResponse
        >(
          pages.listGuestbook.bind(pages),
          { handle: owner.handle, slug: '', cursor: '', limit: 20 },
          { accessToken: viewer.accessToken },
        );
        expect(rejectedGuestbook.code).toBe(GrpcStatus.NOT_FOUND);

        const rejectedSign = await expectRejection<SignGuestbookRequest, SignGuestbookResponse>(
          pages.signGuestbook.bind(pages),
          { handle: owner.handle, slug: '', body: 'nice page' },
          { accessToken: viewer.accessToken },
        );
        expect(rejectedSign.code).toBe(GrpcStatus.NOT_FOUND);
      });
    });

    describe('guestbook sign / list / remove', () => {
      it('signs, lists, and idempotently removes an entry (owner only)', async () => {
        const owner = await newActor();
        const signer = await newActor();
        await publishPage(owner);

        const signed = await callUnary<SignGuestbookRequest, SignGuestbookResponse>(
          pages.signGuestbook.bind(pages),
          { handle: owner.handle, slug: '', body: 'lovely page!' },
          { accessToken: signer.accessToken },
        );
        expect(signed.entry?.body).toBe('lovely page!');
        expect(signed.entry?.author?.id).toBe(signer.actorId);
        const entryId = signed.entry?.id ?? '';

        const listed = await callUnary<ListGuestbookRequest, ListGuestbookResponse>(
          pages.listGuestbook.bind(pages),
          { handle: owner.handle, slug: '', cursor: '', limit: 20 },
          {},
        );
        expect(listed.entries.map((entry) => entry.id)).toContain(entryId);

        const nonOwnerRemoval = await expectRejection<
          RemoveGuestbookEntryRequest,
          RemoveGuestbookEntryResponse
        >(pages.removeGuestbookEntry.bind(pages), { entryId }, { accessToken: signer.accessToken });
        expect(nonOwnerRemoval.code).toBe(GrpcStatus.PERMISSION_DENIED);

        const removed = await callUnary<RemoveGuestbookEntryRequest, RemoveGuestbookEntryResponse>(
          pages.removeGuestbookEntry.bind(pages),
          { entryId },
          { accessToken: owner.accessToken },
        );
        expect(removed.entry?.id).toBe(entryId);

        // Idempotent: removing an already-removed entry is not an error.
        const removedAgain = await callUnary<
          RemoveGuestbookEntryRequest,
          RemoveGuestbookEntryResponse
        >(pages.removeGuestbookEntry.bind(pages), { entryId }, { accessToken: owner.accessToken });
        expect(removedAgain.entry?.id).toBe(entryId);

        const listedAfterRemoval = await callUnary<ListGuestbookRequest, ListGuestbookResponse>(
          pages.listGuestbook.bind(pages),
          { handle: owner.handle, slug: '', cursor: '', limit: 20 },
          {},
        );
        expect(listedAfterRemoval.entries.map((entry) => entry.id)).not.toContain(entryId);
      });

      it('rate-limits repeated signatures from the same actor (§102)', async () => {
        const owner = await newActor();
        const signer = await newActor();
        await publishPage(owner);

        for (let i = 0; i < 5; i++) {
          await callUnary<SignGuestbookRequest, SignGuestbookResponse>(
            pages.signGuestbook.bind(pages),
            { handle: owner.handle, slug: '', body: `entry ${String(i)}` },
            { accessToken: signer.accessToken },
          );
        }

        const rejected = await expectRejection<SignGuestbookRequest, SignGuestbookResponse>(
          pages.signGuestbook.bind(pages),
          { handle: owner.handle, slug: '', body: 'one too many' },
          { accessToken: signer.accessToken },
        );
        expect(rejected.code).toBe(GrpcStatus.RESOURCE_EXHAUSTED);
      });
    });

    describe('ReportGuestbookEntry', () => {
      it('accepts a bounded report and returns a report id', async () => {
        const owner = await newActor();
        const signer = await newActor();
        await publishPage(owner);
        const signed = await callUnary<SignGuestbookRequest, SignGuestbookResponse>(
          pages.signGuestbook.bind(pages),
          { handle: owner.handle, slug: '', body: 'spammy!' },
          { accessToken: signer.accessToken },
        );

        const reported = await callUnary<ReportGuestbookEntryRequest, ReportGuestbookEntryResponse>(
          pages.reportGuestbookEntry.bind(pages),
          {
            entryId: signed.entry?.id ?? '',
            reason: ReportReason.REPORT_REASON_SPAM,
            details: 'posting links to nowhere',
          },
          { accessToken: owner.accessToken },
        );
        expect(reported.reportId).toBeTruthy();
      });

      it('reports NOT_FOUND for a nonexistent entry', async () => {
        const owner = await newActor();
        const rejected = await expectRejection<
          ReportGuestbookEntryRequest,
          ReportGuestbookEntryResponse
        >(
          pages.reportGuestbookEntry.bind(pages),
          { entryId: randomUUID(), reason: ReportReason.REPORT_REASON_OTHER, details: '' },
          { accessToken: owner.accessToken },
        );
        expect(rejected.code).toBe(GrpcStatus.NOT_FOUND);
      });
    });
  },
);
