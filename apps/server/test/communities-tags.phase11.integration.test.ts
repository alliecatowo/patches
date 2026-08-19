import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import { CommunityMember, Notification, Post, Tag } from '@patches/database';
import {
  COMMUNITY_INVITE_STATUS,
  COMMUNITY_ROLE,
  createAuthClient,
  createCommunityClient,
  createPostClient,
  createTagClient,
  type AuthGrpcClient,
  type BanFromCommunityRequest,
  type BanFromCommunityResponse,
  type CommunityGrpcClient,
  type CreateCommunityRequest,
  type CreateCommunityResponse,
  type CreatePostRequest,
  type CreatePostResponse,
  type GetCommunityRequest,
  type GetCommunityResponse,
  type InviteToCommunityRequest,
  type InviteToCommunityResponse,
  type JoinCommunityRequest,
  type JoinCommunityResponse,
  type LeaveCommunityRequest,
  type LeaveCommunityResponse,
  type ListCommunitiesRequest,
  type ListCommunitiesResponse,
  type ListCommunityMembersRequest,
  type ListCommunityMembersResponse,
  type ListMutedTagsRequest,
  type ListMutedTagsResponse,
  type MuteTagRequest,
  type MuteTagResponse,
  type PostGrpcClient,
  type RemovePostFromCommunityRequest,
  type RemovePostFromCommunityResponse,
  type RespondToCommunityInviteRequest,
  type RespondToCommunityInviteResponse,
  type SearchTagsRequest,
  type SearchTagsResponse,
  type SetCommunityRoleRequest,
  type SetCommunityRoleResponse,
  type TagGrpcClient,
  type UnmuteTagRequest,
  type UnmuteTagResponse,
  type UpdateCommunityRequest,
  type UpdateCommunityResponse,
} from '@patches/proto';
import { PostVisibility, QuotePolicy } from '@patches/proto/nest';
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
  console.warn(
    '[apps/server] Skipping Phase 11 communities/tags integration tests: ' +
      'TEST_DATABASE_URL is not set.',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'Phase 11 communities and tags over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let communities: CommunityGrpcClient;
    let posts: PostGrpcClient;
    let tags: TagGrpcClient;
    let inviterUserId: string;
    let founder: TestActor;
    let member: TestActor;
    let invitee: TestActor;
    let banned: TestActor;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      const credentials = grpcCredentials.createInsecure();
      auth = createAuthClient(server.url, credentials);
      communities = createCommunityClient(server.url, credentials);
      posts = createPostClient(server.url, credentials);
      tags = createTagClient(server.url, credentials);

      founder = await registerTestActor(auth, dataSource, inviterUserId);
      member = await registerTestActor(auth, dataSource, inviterUserId);
      invitee = await registerTestActor(auth, dataSource, inviterUserId);
      banned = await registerTestActor(auth, dataSource, inviterUserId);
    }, 60_000);

    afterAll(async () => {
      auth.close();
      communities.close();
      posts.close();
      tags.close();
      await server.close();
      await dataSource.destroy();
    });

    it('executes every community RPC with idempotency, bounded authority, audits, and explicit invites', async () => {
      const suffix = testSuffix()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 8);
      const clientRequestId = randomUUID();
      const request: CreateCommunityRequest = {
        clientRequestId,
        name: `p11_${suffix}`,
        displayName: 'Phase 11 Community',
        description: 'Initial description',
        rules: 'Be kind.',
        isPublic: true,
      };
      const created = await callUnary<CreateCommunityRequest, CreateCommunityResponse>(
        communities.createCommunity.bind(communities),
        request,
        { accessToken: founder.accessToken },
      );
      const communityId = created.community?.id ?? '';
      expect(communityId).not.toBe('');
      expect(created.community?.viewerRole).toBe(COMMUNITY_ROLE.MODERATOR);

      const retried = await callUnary<CreateCommunityRequest, CreateCommunityResponse>(
        communities.createCommunity.bind(communities),
        { ...request, name: `different_${suffix}` },
        { accessToken: founder.accessToken },
      );
      expect(retried.community?.id).toBe(communityId);

      const invalid = await expectRejection<CreateCommunityRequest, CreateCommunityResponse>(
        communities.createCommunity.bind(communities),
        { ...request, clientRequestId: randomUUID(), name: 'Admin' },
        { accessToken: founder.accessToken },
      );
      expect(invalid.code).toBe(GrpcStatus.INVALID_ARGUMENT);

      const fetched = await callUnary<GetCommunityRequest, GetCommunityResponse>(
        communities.getCommunity.bind(communities),
        { id: communityId },
      );
      expect(fetched.community?.name).toBe(request.name);
      const listed = await callUnary<ListCommunitiesRequest, ListCommunitiesResponse>(
        communities.listCommunities.bind(communities),
        { cursor: '', limit: 20 },
      );
      expect(listed.communities.map((community) => community.id)).toContain(communityId);

      const joined = await callUnary<JoinCommunityRequest, JoinCommunityResponse>(
        communities.joinCommunity.bind(communities),
        { communityId },
        { accessToken: member.accessToken },
      );
      expect(joined.community?.viewerRole).toBe(COMMUNITY_ROLE.MEMBER);
      const memberList = await callUnary<ListCommunityMembersRequest, ListCommunityMembersResponse>(
        communities.listCommunityMembers.bind(communities),
        { communityId, cursor: '', limit: 20 },
      );
      expect(memberList.members.map((entry) => entry.actor?.id)).toEqual(
        expect.arrayContaining([founder.actorId, member.actorId]),
      );

      const promoted = await callUnary<SetCommunityRoleRequest, SetCommunityRoleResponse>(
        communities.setCommunityRole.bind(communities),
        { communityId, actorId: member.actorId, role: COMMUNITY_ROLE.MODERATOR },
        { accessToken: founder.accessToken },
      );
      expect(promoted.member?.role).toBe(COMMUNITY_ROLE.MODERATOR);
      const updated = await callUnary<UpdateCommunityRequest, UpdateCommunityResponse>(
        communities.updateCommunity.bind(communities),
        {
          id: communityId,
          displayName: 'Updated Community',
          description: '',
          rules: '',
          isPublic: true,
          updateMask: {
            paths: ['display_name'],
          } as unknown as UpdateCommunityRequest['updateMask'],
        },
        { accessToken: member.accessToken },
      );
      expect(updated.community?.displayName).toBe('Updated Community');

      const communityPost = await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body: `community moderation ${suffix}`,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId,
          quotePolicy: QuotePolicy.QUOTE_POLICY_ANYONE,
        },
        { accessToken: member.accessToken },
      );
      const postId = communityPost.post?.id ?? '';
      await callUnary<RemovePostFromCommunityRequest, RemovePostFromCommunityResponse>(
        communities.removePostFromCommunity.bind(communities),
        { communityId, postId },
        { accessToken: founder.accessToken },
      );
      expect(
        (await dataSource.getRepository(Post).findOneByOrFail({ id: postId })).communityId,
      ).toBe(null);

      const invitation = await callUnary<InviteToCommunityRequest, InviteToCommunityResponse>(
        communities.inviteToCommunity.bind(communities),
        { communityId, inviteeActorId: invitee.actorId },
        { accessToken: member.accessToken },
      );
      expect(invitation.invite?.status).toBe(COMMUNITY_INVITE_STATUS.PENDING);
      expect(
        await dataSource
          .getRepository(CommunityMember)
          .exists({ where: { communityId, actorId: invitee.actorId } }),
      ).toBe(false);
      expect(
        await dataSource.getRepository(Notification).count({
          where: { communityId, recipientActorId: invitee.actorId, type: 'COMMUNITY_INVITE' },
        }),
      ).toBe(1);
      const accepted = await callUnary<
        RespondToCommunityInviteRequest,
        RespondToCommunityInviteResponse
      >(
        communities.respondToCommunityInvite.bind(communities),
        { inviteId: invitation.invite?.id ?? '', accept: true },
        { accessToken: invitee.accessToken },
      );
      expect(accepted.invite?.status).toBe(COMMUNITY_INVITE_STATUS.ACCEPTED);

      await callUnary<JoinCommunityRequest, JoinCommunityResponse>(
        communities.joinCommunity.bind(communities),
        { communityId },
        { accessToken: banned.accessToken },
      );
      await callUnary<BanFromCommunityRequest, BanFromCommunityResponse>(
        communities.banFromCommunity.bind(communities),
        { communityId, actorId: banned.actorId, reason: 'Repeated disruption' },
        { accessToken: founder.accessToken },
      );
      expect(
        await dataSource
          .getRepository(CommunityMember)
          .exists({ where: { communityId, actorId: banned.actorId } }),
      ).toBe(false);

      const left = await callUnary<LeaveCommunityRequest, LeaveCommunityResponse>(
        communities.leaveCommunity.bind(communities),
        { communityId },
        { accessToken: invitee.accessToken },
      );
      expect(left.community?.viewerRole).toBe(COMMUNITY_ROLE.UNSPECIFIED);
      const auditRows = await dataSource.query<Array<{ action: string }>>(
        `SELECT action FROM admin_audit_log
         WHERE subject_type = 'COMMUNITY' AND subject_id = $1`,
        [communityId],
      );
      expect(auditRows.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'community.update',
          'community.set_role',
          'community.remove_post',
          'community.ban',
        ]),
      );
    });

    it('extracts normalized tags, searches alphabetically, and mutes idempotently', async () => {
      const prefix = `p${testSuffix()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 7)}`;
      await callUnary<CreatePostRequest, CreatePostResponse>(
        posts.createPost.bind(posts),
        {
          clientRequestId: randomUUID(),
          body: `#${prefix}z #${prefix}a`,
          linkUrl: '',
          visibility: PostVisibility.POST_VISIBILITY_PUBLIC,
          contentWarning: '',
          inReplyToId: '',
          mediaIds: [],
          quotedPostId: '',
          communityId: '',
          quotePolicy: QuotePolicy.QUOTE_POLICY_ANYONE,
        },
        { accessToken: founder.accessToken },
      );

      const found = await callUnary<SearchTagsRequest, SearchTagsResponse>(
        tags.searchTags.bind(tags),
        { query: prefix, cursor: '', limit: 20 },
      );
      expect(found.tags.map((tag) => tag.name)).toEqual([`${prefix}a`, `${prefix}z`]);
      const mutedTag = found.tags[0];
      if (mutedTag === undefined) throw new Error('Expected the extracted tag to be searchable.');

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await callUnary<MuteTagRequest, MuteTagResponse>(
          tags.muteTag.bind(tags),
          { tagId: mutedTag.id },
          { accessToken: founder.accessToken },
        );
      }
      const muted = await callUnary<ListMutedTagsRequest, ListMutedTagsResponse>(
        tags.listMutedTags.bind(tags),
        { cursor: '', limit: 20 },
        { accessToken: founder.accessToken },
      );
      expect(muted.tags.map((tag) => tag.id)).toContain(mutedTag.id);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await callUnary<UnmuteTagRequest, UnmuteTagResponse>(
          tags.unmuteTag.bind(tags),
          { tagId: mutedTag.id },
          { accessToken: founder.accessToken },
        );
      }
      expect(
        await dataSource.getRepository(Tag).findOneByOrFail({ id: mutedTag.id }),
      ).toMatchObject({ name: `${prefix}a` });
      const after = await callUnary<ListMutedTagsRequest, ListMutedTagsResponse>(
        tags.listMutedTags.bind(tags),
        { cursor: '', limit: 20 },
        { accessToken: founder.accessToken },
      );
      expect(after.tags.map((tag) => tag.id)).not.toContain(mutedTag.id);
    });
  },
);
