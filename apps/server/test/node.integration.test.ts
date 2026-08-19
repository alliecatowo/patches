import { credentials as grpcCredentials } from '@grpc/grpc-js';
import {
  ACCOUNT_EXPORT_MAX_READY_ARCHIVES,
  MAX_APPEAL_STATEMENT_CHARS,
  MAX_FILTER_LIST_ENTRIES,
  MAX_FILTER_LIST_EXCEPTIONS_PER_LIST,
  MAX_FILTER_LIST_SUBSCRIPTIONS,
  MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR,
  MAX_FILTER_TERMS_PER_FILTER,
  MAX_FILTERS_PER_ACTOR,
  MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR,
} from '@patches/domain';
import {
  createNodeClient,
  type GetNodeInfoRequest,
  type GetNodeInfoResponse,
} from '@patches/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

/**
 * A-054 (spec §204): `GetNodeInfo`'s `NodeLimits` publishes the Amendment C size limits that
 * previously existed only as `@patches/domain`/module constants a client had no way to read
 * (see `apps/server/src/modules/system/node.service.ts`). A dedicated file rather than adding
 * to `test/system.integration.test.ts` — that file is owned by concurrent A-052 work on the
 * same describe block; this keeps the two changes' diffs from colliding.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping node integration tests: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'patches.v1.NodeService/GetNodeInfo NodeLimits (A-054)',
  () => {
    let server: TestServer;
    let node: ReturnType<typeof createNodeClient>;

    beforeAll(async () => {
      server = await startTestServer();
      node = createNodeClient(server.url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      node.close();
      await server.close();
    });

    it('publishes the Amendment C size limits, matching the constants that enforce them, all nonzero', async () => {
      const response = await callUnary<GetNodeInfoRequest, GetNodeInfoResponse>(
        node.getNodeInfo.bind(node),
        {},
      );
      const limits = response.limits;

      expect(limits?.maxFiltersPerActor).toBe(MAX_FILTERS_PER_ACTOR);
      expect(limits?.maxFilterTermsPerFilter).toBe(MAX_FILTER_TERMS_PER_FILTER);
      expect(limits?.maxFilterListsPublishedPerActor).toBe(MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR);
      expect(limits?.maxFilterListEntries).toBe(MAX_FILTER_LIST_ENTRIES);
      expect(limits?.maxFilterListSubscriptions).toBe(MAX_FILTER_LIST_SUBSCRIPTIONS);
      expect(limits?.maxFilterListExceptionsPerList).toBe(MAX_FILTER_LIST_EXCEPTIONS_PER_LIST);
      expect(limits?.maxLabelerSubscriptionsPerActor).toBe(MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR);
      // Label vocabulary max mirrors `MAX_LABELER_VOCABULARY_ENTRIES`
      // (`apps/server/src/modules/labels/label-validation.ts`), which has no `@patches/domain`
      // counterpart — asserted nonzero below rather than re-importing a module-local constant
      // into a test file outside that module's ownership.
      expect(limits?.maxAppealStatementChars).toBe(MAX_APPEAL_STATEMENT_CHARS);
      expect(limits?.accountExportMaxReadyArchives).toBe(ACCOUNT_EXPORT_MAX_READY_ARCHIVES);

      for (const value of [
        limits?.maxFiltersPerActor,
        limits?.maxFilterTermsPerFilter,
        limits?.maxFilterListsPublishedPerActor,
        limits?.maxFilterListEntries,
        limits?.maxFilterListSubscriptions,
        limits?.maxFilterListExceptionsPerList,
        limits?.maxLabelerSubscriptionsPerActor,
        limits?.maxLabelVocabularyEntries,
        limits?.maxAppealStatementChars,
        limits?.accountExportMaxReadyArchives,
      ]) {
        expect(value).toBeGreaterThan(0);
      }
    });
  },
);
