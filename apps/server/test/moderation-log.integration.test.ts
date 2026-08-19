import { credentials as grpcCredentials } from '@grpc/grpc-js';
import {
  createModerationClient,
  type ListModerationLogRequest,
  type ListModerationLogResponse,
  type ModerationGrpcClient,
} from '@patches/proto';
import {
  ModerationActionType,
  ModerationLogSubjectKind,
  ModerationReasonCategory,
} from '@patches/proto/nest';
import { ModerationLogEntry } from '@patches/database';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerTestDataSource } from './support/database.js';
import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

/**
 * `ModerationService.ListModerationLog` end-to-end over real gRPC against real PostgreSQL
 * (spec §201.4) — unauthenticated, keyset-paginated, and anonymized by construction: a domain
 * entry carries `subject_domain`, an account/post/media entry never does, because the table
 * itself has no actor/post identifier column to leak (`moderation_log_entries` entity doc).
 *
 * Rows are written directly against `moderation_log_entries` here (rather than shelling out to
 * `patches-admin domain block`) the same way this suite's sibling files simulate admin CLI
 * writes — `patches-admin domain block` (`apps/admin/src/commands/domain.ts`, this task's owned
 * file) writes exactly this shape in the same transaction as its `admin_audit_log` row; see
 * that file's `blockDomain` for the real write path this test's fixtures mirror.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping moderation-log integration tests: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'ModerationService.ListModerationLog over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let moderation: ModerationGrpcClient;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      server = await startTestServer();
      moderation = createModerationClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      moderation.close();
      await server.close();
      await dataSource.destroy();
    });

    async function insertLogEntry(input: {
      action: 'DOMAIN_BLOCK';
      subjectKind: 'DOMAIN' | 'ACCOUNT';
      subjectDomain: string | null;
      reasonCategory: 'SPAM' | 'HARASSMENT' | 'OTHER';
      appealed?: boolean;
    }): Promise<ModerationLogEntry> {
      const repo = dataSource.getRepository(ModerationLogEntry);
      return repo.save(
        repo.create({
          action: input.action,
          subjectKind: input.subjectKind,
          subjectDomain: input.subjectDomain,
          reasonCategory: input.reasonCategory,
          appealed: input.appealed ?? false,
        }),
      );
    }

    it('is callable with no authorization metadata at all (unauthenticated)', async () => {
      const response = await callUnary<ListModerationLogRequest, ListModerationLogResponse>(
        moderation.listModerationLog.bind(moderation),
        { cursor: '', limit: 20 },
      );
      expect(response.page).toBeDefined();
    });

    it('publishes a fully-identified domain-kind entry', async () => {
      const domain = `evil-${Date.now()}.example`;
      await insertLogEntry({
        action: 'DOMAIN_BLOCK',
        subjectKind: 'DOMAIN',
        subjectDomain: domain,
        reasonCategory: 'SPAM',
      });

      const response = await callUnary<ListModerationLogRequest, ListModerationLogResponse>(
        moderation.listModerationLog.bind(moderation),
        { cursor: '', limit: 50 },
      );

      const entry = response.entries.find((row) => row.subjectDomain === domain);
      expect(entry).toBeDefined();
      expect(entry?.action).toBe(ModerationActionType.MODERATION_ACTION_TYPE_DOMAIN_BLOCK);
      expect(entry?.subjectKind).toBe(ModerationLogSubjectKind.MODERATION_LOG_SUBJECT_KIND_DOMAIN);
      expect(entry?.reasonCategory).toBe(ModerationReasonCategory.MODERATION_REASON_CATEGORY_SPAM);
      expect(entry?.appealed).toBe(false);
    });

    it('never carries a subject_domain for a non-domain-kind entry (anonymized by construction)', async () => {
      const saved = await insertLogEntry({
        action: 'DOMAIN_BLOCK', // action vocabulary reused; subjectKind is what's under test
        subjectKind: 'ACCOUNT',
        subjectDomain: null,
        reasonCategory: 'HARASSMENT',
      });

      const response = await callUnary<ListModerationLogRequest, ListModerationLogResponse>(
        moderation.listModerationLog.bind(moderation),
        { cursor: '', limit: 50 },
      );

      const entry = response.entries.find((row) => row.id === saved.id);
      expect(entry).toBeDefined();
      expect(entry?.subjectKind).toBe(ModerationLogSubjectKind.MODERATION_LOG_SUBJECT_KIND_ACCOUNT);
      // The whole point: no actor id, post id, or handle anywhere on this message — the only
      // identifying-shaped field, `subject_domain`, is empty for a non-domain entry.
      expect(entry?.subjectDomain).toBe('');
    });

    it('keyset-paginates newest first, honoring limit and next_cursor', async () => {
      const marker = `page-test-${Date.now()}`;
      const domains = [`${marker}-a.example`, `${marker}-b.example`, `${marker}-c.example`];
      for (const domain of domains) {
        await insertLogEntry({
          action: 'DOMAIN_BLOCK',
          subjectKind: 'DOMAIN',
          subjectDomain: domain,
          reasonCategory: 'OTHER',
        });
      }

      const firstPage = await callUnary<ListModerationLogRequest, ListModerationLogResponse>(
        moderation.listModerationLog.bind(moderation),
        { cursor: '', limit: 2 },
      );
      expect(firstPage.entries.length).toBe(2);
      expect(firstPage.page?.hasMore).toBe(true);
      // Newest first: the two most-recently-inserted of the three markers.
      expect(firstPage.entries[0]?.subjectDomain).toBe(domains[2]);
      expect(firstPage.entries[1]?.subjectDomain).toBe(domains[1]);

      const secondPage = await callUnary<ListModerationLogRequest, ListModerationLogResponse>(
        moderation.listModerationLog.bind(moderation),
        { cursor: firstPage.page?.nextCursor ?? '', limit: 50 },
      );
      expect(secondPage.entries.some((row) => row.subjectDomain === domains[0])).toBe(true);
      // No overlap with the first page.
      expect(secondPage.entries.some((row) => row.subjectDomain === domains[1])).toBe(false);
    });
  },
);
