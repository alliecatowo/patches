import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createAuthClient,
  createFeedClient,
  createFilterClient,
  createFilterListClient,
  createPostClient,
  type AuthGrpcClient,
  type CreateFilterRequest,
  type CreateFilterResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type DeleteFilterRequest,
  type DeleteFilterResponse,
  type ExportFiltersRequest,
  type ExportFiltersResponse,
  type FeedGrpcClient,
  type FilterGrpcClient,
  type FilterListGrpcClient,
  type GetFilterListRequest,
  type GetFilterListResponse,
  type ImportFiltersRequest,
  type ImportFiltersResponse,
  type ListFilterListEntriesRequest,
  type ListFilterListEntriesResponse,
  type ListFilterListsRequest,
  type ListFilterListsResponse,
  type ListFilterListSubscriptionsRequest,
  type ListFilterListSubscriptionsResponse,
  type ListFiltersRequest,
  type ListFiltersResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type PostGrpcClient,
  type PublishFilterListRequest,
  type PublishFilterListResponse,
  type SearchPostsRequest,
  type SearchPostsResponse,
  type SetFilterListEntryExceptionRequest,
  type SetFilterListEntryExceptionResponse,
  type SubscribeFilterListRequest,
  type SubscribeFilterListResponse,
  type UnsubscribeFilterListRequest,
  type UnsubscribeFilterListResponse,
  type UpdateFilterRequest,
  type UpdateFilterResponse,
} from '@patches/proto';
import {
  FilterAction,
  FilteredByProvenance,
  FilterScope,
  FilterTermKind,
  PostVisibility,
  QuotePolicy,
} from '@patches/proto/nest';
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

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn('[apps/server] Skipping filters integration tests: TEST_DATABASE_URL is not set.');
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'FilterService and FilterListService over gRPC (integration, P14-007/P14-008)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let filters: FilterGrpcClient;
    let filterLists: FilterListGrpcClient;
    let posts: PostGrpcClient;
    let feeds: FeedGrpcClient;
    let inviterUserId: string;
    let viewer: TestActor;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `filterinviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      const creds = grpcCredentials.createInsecure();
      auth = createAuthClient(server.url, creds);
      filters = createFilterClient(server.url, creds);
      filterLists = createFilterListClient(server.url, creds);
      posts = createPostClient(server.url, creds);
      feeds = createFeedClient(server.url, creds);

      viewer = await registerTestActor(auth, dataSource, inviterUserId);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      filters.close();
      filterLists.close();
      posts.close();
      feeds.close();
      await server.close();
      await dataSource.destroy();
    });

    async function createLocalPost(author: TestActor, body: string): Promise<string> {
      const response = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_UNSPECIFIED,
        },
        { accessToken: author.accessToken },
      );
      const id = response.post?.id;
      if (id === undefined) throw new Error('createPost did not return a post');
      return id;
    }

    async function listAllLocal(accessToken: string): Promise<ListLocalFeedResponse['posts']> {
      const seen: ListLocalFeedResponse['posts'] = [];
      let cursor = '';
      for (let guard = 0; guard < 20; guard += 1) {
        const page = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
          feeds.listLocalFeed.bind(feeds),
          { cursor, limit: 2 },
          { accessToken },
        );
        seen.push(...page.posts);
        if (!page.page?.hasMore) break;
        cursor = page.page?.nextCursor ?? '';
      }
      return seen;
    }

    it('creates, updates, lists, and deletes a filter, requiring authentication', async () => {
      const anon = await expectRejection<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: 'no-auth',
          terms: [{ kind: FilterTermKind.FILTER_TERM_KIND_SUBSTRING, value: 'x' }],
          scopes: [FilterScope.FILTER_SCOPE_HOME],
          action: FilterAction.FILTER_ACTION_HIDE,
          expiresAt: undefined,
        },
      );
      expect(anon.code).toBe(GrpcStatus.UNAUTHENTICATED);

      const created = await callUnary<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: 'spoilers',
          terms: [{ kind: FilterTermKind.FILTER_TERM_KIND_SUBSTRING, value: 'ending' }],
          scopes: [FilterScope.FILTER_SCOPE_HOME],
          action: FilterAction.FILTER_ACTION_HIDE,
          expiresAt: undefined,
        },
        { accessToken: viewer.accessToken },
      );
      const filterId = created.filter?.id ?? '';
      expect(filterId).not.toBe('');
      expect(created.filter?.action).toBe(FilterAction.FILTER_ACTION_HIDE);

      const updated = await callUnary<UpdateFilterRequest, UpdateFilterResponse>(
        filters.updateFilter.bind(filters),
        {
          id: filterId,
          name: '',
          terms: [],
          scopes: [],
          action: FilterAction.FILTER_ACTION_COLLAPSE,
          expiresAt: undefined,
          updateMask: { paths: ['action'] } as unknown as UpdateFilterRequest['updateMask'],
        },
        { accessToken: viewer.accessToken },
      );
      expect(updated.filter?.action).toBe(FilterAction.FILTER_ACTION_COLLAPSE);
      // The mask only named `action`; `terms`/`name` must survive untouched.
      expect(updated.filter?.name).toBe('spoilers');
      expect(updated.filter?.terms.map((term) => term.value)).toEqual(['ending']);

      const list = await callUnary<ListFiltersRequest, ListFiltersResponse>(
        filters.listFilters.bind(filters),
        { cursor: '', limit: 20 },
        { accessToken: viewer.accessToken },
      );
      expect(list.filters.map((filter) => filter.id)).toContain(filterId);

      await callUnary<DeleteFilterRequest, DeleteFilterResponse>(
        filters.deleteFilter.bind(filters),
        { id: filterId },
        { accessToken: viewer.accessToken },
      );
      // Idempotent: deleting again is not an error.
      await callUnary<DeleteFilterRequest, DeleteFilterResponse>(
        filters.deleteFilter.bind(filters),
        { id: filterId },
        { accessToken: viewer.accessToken },
      );
      const afterDelete = await callUnary<ListFiltersRequest, ListFiltersResponse>(
        filters.listFilters.bind(filters),
        { cursor: '', limit: 20 },
        { accessToken: viewer.accessToken },
      );
      expect(afterDelete.filters.map((filter) => filter.id)).not.toContain(filterId);
    });

    it('exports a plain JSON document and imports it as a dry-run preview vs. a real write', async () => {
      const actor = await registerTestActor(auth, dataSource, inviterUserId);
      await callUnary<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: 'export-me',
          terms: [{ kind: FilterTermKind.FILTER_TERM_KIND_TAG, value: 'nsfw' }],
          scopes: [FilterScope.FILTER_SCOPE_LOCAL],
          action: FilterAction.FILTER_ACTION_WARN,
          expiresAt: undefined,
        },
        { accessToken: actor.accessToken },
      );

      const exported = await callUnary<ExportFiltersRequest, ExportFiltersResponse>(
        filters.exportFilters.bind(filters),
        {},
        { accessToken: actor.accessToken },
      );
      const parsed = JSON.parse(exported.json) as { filters: Array<{ name: string }> };
      expect(parsed.filters.map((filter) => filter.name)).toContain('export-me');

      const importer = await registerTestActor(auth, dataSource, inviterUserId);
      const preview = await callUnary<ImportFiltersRequest, ImportFiltersResponse>(
        filters.importFilters.bind(filters),
        { json: exported.json, apply: false },
        { accessToken: importer.accessToken },
      );
      expect(preview.added.map((filter) => filter.name)).toContain('export-me');
      const afterPreview = await callUnary<ListFiltersRequest, ListFiltersResponse>(
        filters.listFilters.bind(filters),
        { cursor: '', limit: 20 },
        { accessToken: importer.accessToken },
      );
      expect(afterPreview.filters).toHaveLength(0);

      const applied = await callUnary<ImportFiltersRequest, ImportFiltersResponse>(
        filters.importFilters.bind(filters),
        { json: exported.json, apply: true },
        { accessToken: importer.accessToken },
      );
      expect(applied.added.map((filter) => filter.name)).toContain('export-me');
      const afterApply = await callUnary<ListFiltersRequest, ListFiltersResponse>(
        filters.listFilters.bind(filters),
        { cursor: '', limit: 20 },
        { accessToken: importer.accessToken },
      );
      expect(afterApply.filters.map((filter) => filter.name)).toContain('export-me');
    });

    it('hide omits posts server-side and pagination stays correct across a short page', async () => {
      const suffix = testSuffix();
      const author = await registerTestActor(auth, dataSource, inviterUserId);
      const viewerActor = await registerTestActor(auth, dataSource, inviterUserId);

      await callUnary<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: 'hide-test',
          terms: [{ kind: FilterTermKind.FILTER_TERM_KIND_SUBSTRING, value: `hideme-${suffix}` }],
          scopes: [FilterScope.FILTER_SCOPE_LOCAL],
          action: FilterAction.FILTER_ACTION_HIDE,
          expiresAt: undefined,
        },
        { accessToken: viewerActor.accessToken },
      );

      const visibleIds: string[] = [];
      const hiddenIds: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const hide = index % 2 === 0;
        const id = await createLocalPost(
          author,
          hide ? `post ${String(index)} hideme-${suffix}` : `post ${String(index)} keep-${suffix}`,
        );
        (hide ? hiddenIds : visibleIds).push(id);
      }

      const asFilteredViewer = await listAllLocal(viewerActor.accessToken);
      const filteredIds = asFilteredViewer.map((post) => post.id);
      for (const hiddenId of hiddenIds) expect(filteredIds).not.toContain(hiddenId);
      for (const visibleId of visibleIds) expect(filteredIds).toContain(visibleId);
      // No duplicates and no gaps across the paginated walk, even though several rounds
      // returned fewer than the requested `limit` (spec §198.3).
      expect(new Set(filteredIds).size).toBe(filteredIds.length);

      // A different, unfiltered viewer sees every post, hidden and visible alike.
      const asUnfilteredViewer = await listAllLocal(viewer.accessToken);
      const unfilteredIds = asUnfilteredViewer.map((post) => post.id);
      for (const id of [...hiddenIds, ...visibleIds]) expect(unfilteredIds).toContain(id);
    });

    // P14-021: SQL pushdown for HIDE-action ACTOR/TAG rules. Before the pushdown, a run of
    // 50 consecutive hidden rows ahead of the visible ones could exceed `MAX_FILTER_ROUNDS`'s
    // bounded scan and force the client into extra round trips (a "short page"). With the rule
    // pushed into the query itself, a single call already returns a full page regardless of how
    // many hidden rows sit in front of it.
    it('an ACTOR hide rule never produces a short page across 50 matching rows', async () => {
      const suffix = testSuffix();
      const spamAuthor = await registerTestActor(auth, dataSource, inviterUserId);
      const keepAuthor = await registerTestActor(auth, dataSource, inviterUserId);
      const pushdownViewer = await registerTestActor(auth, dataSource, inviterUserId);

      await callUnary<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: 'hide-spam-actor',
          terms: [{ kind: FilterTermKind.FILTER_TERM_KIND_ACTOR, value: spamAuthor.actorId }],
          scopes: [FilterScope.FILTER_SCOPE_LOCAL],
          action: FilterAction.FILTER_ACTION_HIDE,
          expiresAt: undefined,
        },
        { accessToken: pushdownViewer.accessToken },
      );

      // 50 hidden rows, all newer than nothing yet — created first so they sort ahead of the
      // "keep" posts created below (feeds are newest-first).
      for (let index = 0; index < 50; index += 1) {
        await createLocalPost(spamAuthor, `spam ${String(index)} ${suffix}`);
      }
      const keepIds: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        keepIds.push(await createLocalPost(keepAuthor, `keep ${String(index)} ${suffix}`));
      }
      keepIds.reverse(); // newest-first, matching feed order

      const page = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
        feeds.listLocalFeed.bind(feeds),
        { cursor: '', limit: 3 },
        { accessToken: pushdownViewer.accessToken },
      );
      expect(page.posts.map((post) => post.id)).toEqual(keepIds);
    });

    it('a TAG hide rule never produces a short page across 50 matching rows', async () => {
      const suffix = testSuffix();
      const author = await registerTestActor(auth, dataSource, inviterUserId);
      const pushdownViewer = await registerTestActor(auth, dataSource, inviterUserId);
      const hideTag = `hidetag${suffix}`;

      await callUnary<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: 'hide-tag',
          terms: [{ kind: FilterTermKind.FILTER_TERM_KIND_TAG, value: hideTag }],
          scopes: [FilterScope.FILTER_SCOPE_LOCAL],
          action: FilterAction.FILTER_ACTION_HIDE,
          expiresAt: undefined,
        },
        { accessToken: pushdownViewer.accessToken },
      );

      for (let index = 0; index < 50; index += 1) {
        await createLocalPost(author, `spam ${String(index)} #${hideTag}`);
      }
      const keepIds: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        keepIds.push(await createLocalPost(author, `keep ${String(index)} ${suffix}`));
      }
      keepIds.reverse();

      const page = await callUnary<ListLocalFeedRequest, ListLocalFeedResponse>(
        feeds.listLocalFeed.bind(feeds),
        { cursor: '', limit: 3 },
        { accessToken: pushdownViewer.accessToken },
      );
      expect(page.posts.map((post) => post.id)).toEqual(keepIds);
    });

    it('collapse/warn return the post and set filtered_by with "own filter" provenance', async () => {
      const suffix = testSuffix();
      const author = await registerTestActor(auth, dataSource, inviterUserId);
      const viewerActor = await registerTestActor(auth, dataSource, inviterUserId);

      await callUnary<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: `collapse-test-${suffix}`,
          terms: [
            { kind: FilterTermKind.FILTER_TERM_KIND_SUBSTRING, value: `collapseme-${suffix}` },
          ],
          scopes: [FilterScope.FILTER_SCOPE_LOCAL],
          action: FilterAction.FILTER_ACTION_COLLAPSE,
          expiresAt: undefined,
        },
        { accessToken: viewerActor.accessToken },
      );

      const postId = await createLocalPost(author, `spoiler collapseme-${suffix} ahead`);

      const filtered = await listAllLocal(viewerActor.accessToken);
      const matched = filtered.find((post) => post.id === postId);
      expect(matched?.filteredBy?.provenance).toBe(
        FilteredByProvenance.FILTERED_BY_PROVENANCE_FILTER,
      );
      expect(matched?.filteredBy?.name).toBe(`collapse-test-${suffix}`);
      expect(matched?.filteredBy?.action).toBe(FilterAction.FILTER_ACTION_COLLAPSE);
      expect(matched?.filteredBy?.listOwner).toBeNull();
      // The body is still returned — `collapse` is presentation, not omission (spec §198.3).
      expect(matched?.body).toContain(`collapseme-${suffix}`);

      const unfiltered = await listAllLocal(viewer.accessToken);
      expect(unfiltered.find((post) => post.id === postId)?.filteredBy).toBeNull();
    });

    it('SearchPosts applies SEARCH-scope filters: hide omits, collapse sets filtered_by', async () => {
      const suffix = testSuffix();
      const author = await registerTestActor(auth, dataSource, inviterUserId);
      const viewerActor = await registerTestActor(auth, dataSource, inviterUserId);

      await callUnary<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: `search-hide-${suffix}`,
          terms: [
            { kind: FilterTermKind.FILTER_TERM_KIND_SUBSTRING, value: `hidesearch-${suffix}` },
          ],
          scopes: [FilterScope.FILTER_SCOPE_SEARCH],
          action: FilterAction.FILTER_ACTION_HIDE,
          expiresAt: undefined,
        },
        { accessToken: viewerActor.accessToken },
      );
      await callUnary<CreateFilterRequest, CreateFilterResponse>(
        filters.createFilter.bind(filters),
        {
          name: `search-collapse-${suffix}`,
          terms: [
            { kind: FilterTermKind.FILTER_TERM_KIND_SUBSTRING, value: `collapsesearch-${suffix}` },
          ],
          scopes: [FilterScope.FILTER_SCOPE_SEARCH],
          action: FilterAction.FILTER_ACTION_COLLAPSE,
          expiresAt: undefined,
        },
        { accessToken: viewerActor.accessToken },
      );

      const needle = `searchable-${suffix}`;
      const hiddenId = await createLocalPost(author, `${needle} post hidesearch-${suffix} here`);
      const collapsedId = await createLocalPost(
        author,
        `${needle} post collapsesearch-${suffix} here`,
      );
      const keptId = await createLocalPost(author, `${needle} post keepsearch-${suffix} here`);

      const filteredResult = await callUnary<SearchPostsRequest, SearchPostsResponse>(
        posts.searchPosts.bind(posts),
        { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: true },
        { accessToken: viewerActor.accessToken },
      );
      const filteredIds = filteredResult.posts.map((post) => post.id);
      expect(filteredIds).not.toContain(hiddenId);
      expect(filteredIds).toContain(collapsedId);
      expect(filteredIds).toContain(keptId);

      const collapsedMatch = filteredResult.posts.find((post) => post.id === collapsedId);
      expect(collapsedMatch?.filteredBy?.provenance).toBe(
        FilteredByProvenance.FILTERED_BY_PROVENANCE_FILTER,
      );
      expect(collapsedMatch?.filteredBy?.name).toBe(`search-collapse-${suffix}`);
      expect(collapsedMatch?.filteredBy?.action).toBe(FilterAction.FILTER_ACTION_COLLAPSE);
      // The body is still returned — `collapse` is presentation, not omission (spec §198.3).
      expect(collapsedMatch?.body).toContain(`collapsesearch-${suffix}`);

      const keptMatch = filteredResult.posts.find((post) => post.id === keptId);
      expect(keptMatch?.filteredBy).toBeNull();

      // An unfiltered viewer sees every post, including the one this viewer hid.
      const unfilteredResult = await callUnary<SearchPostsRequest, SearchPostsResponse>(
        posts.searchPosts.bind(posts),
        { query: needle, cursor: '', limit: 20, authorHandle: '', includeReplies: true },
        { accessToken: viewer.accessToken },
      );
      const unfilteredIds = unfilteredResult.posts.map((post) => post.id);
      expect(unfilteredIds).toEqual(expect.arrayContaining([hiddenId, collapsedId, keptId]));
    });

    it(
      'filter lists: publish, subscribe (list-derived collapse with provenance), per-entry ' +
        'exception, and unsubscribe — never exposing a subscriber count',
      async () => {
        const suffix = testSuffix();
        const publisher = await registerTestActor(auth, dataSource, inviterUserId);
        const subscriber = await registerTestActor(auth, dataSource, inviterUserId);
        const target = await registerTestActor(auth, dataSource, inviterUserId);

        const published = await callUnary<PublishFilterListRequest, PublishFilterListResponse>(
          filterLists.publishFilterList.bind(filterLists),
          {
            name: `list-${suffix}`,
            displayName: `Curated list ${suffix}`,
            description: 'test list',
            ownerCommunityId: '',
            entries: [{ kind: FilterTermKind.FILTER_TERM_KIND_ACTOR, value: target.actorId }],
          },
          { accessToken: publisher.accessToken },
        );
        const filterListId = published.filterList?.id ?? '';
        expect(filterListId).not.toBe('');

        const entries = await callUnary<
          ListFilterListEntriesRequest,
          ListFilterListEntriesResponse
        >(filterLists.listFilterListEntries.bind(filterLists), {
          filterListId,
          cursor: '',
          limit: 20,
        });
        const entryId = entries.entries[0]?.id ?? '';
        expect(entryId).not.toBe('');

        // Public by construction (§199.1): readable with no access token at all.
        const got = await callUnary<GetFilterListRequest, GetFilterListResponse>(
          filterLists.getFilterList.bind(filterLists),
          { id: filterListId },
        );
        expect(got.filterList?.name).toBe(`list-${suffix}`);
        expect(Object.keys(got.filterList ?? {})).not.toContain('subscriberCount');
        const listed = await callUnary<ListFilterListsRequest, ListFilterListsResponse>(
          filterLists.listFilterLists.bind(filterLists),
          { ownerActorId: '', cursor: '', limit: 20 },
        );
        expect(
          listed.filterLists.every((entry) => !Object.keys(entry).includes('subscriberCount')),
        ).toBe(true);

        const postId = await createLocalPost(target, `hello from target ${suffix}`);

        // Before subscribing, nothing is filtered.
        const beforeSubscribe = await listAllLocal(subscriber.accessToken);
        expect(beforeSubscribe.find((post) => post.id === postId)?.filteredBy).toBeNull();

        await callUnary<SubscribeFilterListRequest, SubscribeFilterListResponse>(
          filterLists.subscribeFilterList.bind(filterLists),
          { filterListId, action: FilterAction.FILTER_ACTION_COLLAPSE },
          { accessToken: subscriber.accessToken },
        );
        const subscriptions = await callUnary<
          ListFilterListSubscriptionsRequest,
          ListFilterListSubscriptionsResponse
        >(
          filterLists.listFilterListSubscriptions.bind(filterLists),
          { cursor: '', limit: 20 },
          { accessToken: subscriber.accessToken },
        );
        expect(subscriptions.subscriptions.map((row) => row.filterList?.id)).toContain(
          filterListId,
        );

        const afterSubscribe = await listAllLocal(subscriber.accessToken);
        const matched = afterSubscribe.find((post) => post.id === postId);
        expect(matched?.filteredBy?.provenance).toBe(
          FilteredByProvenance.FILTERED_BY_PROVENANCE_FILTER_LIST,
        );
        expect(matched?.filteredBy?.name).toBe(`Curated list ${suffix}`);
        expect(matched?.filteredBy?.listOwner?.id).toBe(publisher.actorId);
        expect(matched?.filteredBy?.action).toBe(FilterAction.FILTER_ACTION_COLLAPSE);

        // "This list is right about everything except my friend" (§199.3) — an exception lifts
        // the filter without unsubscribing and without telling the list author.
        await callUnary<SetFilterListEntryExceptionRequest, SetFilterListEntryExceptionResponse>(
          filterLists.setFilterListEntryException.bind(filterLists),
          { filterListId, filterListEntryId: entryId, excepted: true },
          { accessToken: subscriber.accessToken },
        );
        const afterException = await listAllLocal(subscriber.accessToken);
        expect(afterException.find((post) => post.id === postId)?.filteredBy).toBeNull();

        await callUnary<SetFilterListEntryExceptionRequest, SetFilterListEntryExceptionResponse>(
          filterLists.setFilterListEntryException.bind(filterLists),
          { filterListId, filterListEntryId: entryId, excepted: false },
          { accessToken: subscriber.accessToken },
        );
        const afterRemovingException = await listAllLocal(subscriber.accessToken);
        expect(
          afterRemovingException.find((post) => post.id === postId)?.filteredBy?.provenance,
        ).toBe(FilteredByProvenance.FILTERED_BY_PROVENANCE_FILTER_LIST);

        // Unsubscribing takes effect immediately (§199.3) — instant and complete.
        await callUnary<UnsubscribeFilterListRequest, UnsubscribeFilterListResponse>(
          filterLists.unsubscribeFilterList.bind(filterLists),
          { filterListId },
          { accessToken: subscriber.accessToken },
        );
        const afterUnsubscribe = await listAllLocal(subscriber.accessToken);
        expect(afterUnsubscribe.find((post) => post.id === postId)?.filteredBy).toBeNull();
      },
    );

    it(
      'a subscription scope excludes list-derived rules from other scopes (P14-022, spec ' +
        '§199.1)',
      async () => {
        const suffix = testSuffix();
        const publisher = await registerTestActor(auth, dataSource, inviterUserId);
        const subscriber = await registerTestActor(auth, dataSource, inviterUserId);
        const target = await registerTestActor(auth, dataSource, inviterUserId);

        const published = await callUnary<PublishFilterListRequest, PublishFilterListResponse>(
          filterLists.publishFilterList.bind(filterLists),
          {
            name: `scoped-list-${suffix}`,
            displayName: `Scoped list ${suffix}`,
            description: 'test list',
            ownerCommunityId: '',
            entries: [{ kind: FilterTermKind.FILTER_TERM_KIND_ACTOR, value: target.actorId }],
          },
          { accessToken: publisher.accessToken },
        );
        const filterListId = published.filterList?.id ?? '';
        expect(filterListId).not.toBe('');

        const postId = await createLocalPost(target, `scoped subscription target ${suffix}`);

        // Subscribing with only SEARCH in `scopes` must not filter LOCAL — the P14-022
        // intersection `loadEffectiveFilterRules` performs.
        await callUnary<SubscribeFilterListRequest, SubscribeFilterListResponse>(
          filterLists.subscribeFilterList.bind(filterLists),
          {
            filterListId,
            action: FilterAction.FILTER_ACTION_HIDE,
            scopes: [FilterScope.FILTER_SCOPE_SEARCH],
          },
          { accessToken: subscriber.accessToken },
        );

        const subscriptions = await callUnary<
          ListFilterListSubscriptionsRequest,
          ListFilterListSubscriptionsResponse
        >(
          filterLists.listFilterListSubscriptions.bind(filterLists),
          { cursor: '', limit: 20 },
          { accessToken: subscriber.accessToken },
        );
        expect(
          subscriptions.subscriptions.find((row) => row.filterList?.id === filterListId)?.scopes,
        ).toEqual([FilterScope.FILTER_SCOPE_SEARCH]);

        // LOCAL is out of scope for this subscription: the post is still visible there.
        const local = await listAllLocal(subscriber.accessToken);
        expect(local.find((post) => post.id === postId)?.filteredBy).toBeNull();

        // SEARCH is in scope: the same rule hides the post there.
        const searched = await callUnary<SearchPostsRequest, SearchPostsResponse>(
          posts.searchPosts.bind(posts),
          {
            query: `scoped subscription target ${suffix}`,
            cursor: '',
            limit: 20,
            authorHandle: '',
            includeReplies: true,
          },
          { accessToken: subscriber.accessToken },
        );
        expect(searched.posts.map((post) => post.id)).not.toContain(postId);
      },
    );
  },
);
