import { randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import {
  createActorClient,
  createAuthClient,
  type ActorGrpcClient,
  type AuthGrpcClient,
  type GetActorByHandleRequest,
  type GetActorByHandleResponse,
  type GetActorRequest,
  type GetActorResponse,
  type ListFollowersRequest,
  type ListFollowersResponse,
  type ListFollowingRequest,
  type ListFollowingResponse,
  type SearchActorsRequest,
  type SearchActorsResponse,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
} from '@patches/proto';
import { NameTagStyle, ProfileFrame } from '@patches/proto/nest';
import { Media } from '@patches/database';
import { createTestFollow, createTestPost, createTestUser } from '@patches/testkit';
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
 * `ActorService` end-to-end over real gRPC against real PostgreSQL (spec §118–§119):
 * `GetActor`/`GetActorByHandle`, `UpdateProfile`'s `FieldMask`-driven partial update, and the
 * Phase 3 RPCs' `NOT_IMPLEMENTED` responses.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping actors integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'actors over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let actors: ActorGrpcClient;
    let inviterUserId: string;
    let alice: TestActor;
    let bob: TestActor;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const { user } = await createTestUser(dataSource.manager, {
        handle: `inviter${testSuffix()}`,
      });
      inviterUserId = user.id;

      server = await startTestServer();
      auth = createAuthClient(server.url, grpcCredentials.createInsecure());
      actors = createActorClient(server.url, grpcCredentials.createInsecure());

      alice = await registerTestActor(auth, dataSource, inviterUserId, { displayName: 'Alice' });
      bob = await registerTestActor(auth, dataSource, inviterUserId, { displayName: 'Bob' });
    }, 60_000);

    afterAll(async () => {
      auth.close();
      actors.close();
      await server.close();
      await dataSource.destroy();
    });

    describe('GetActor / GetActorByHandle', () => {
      it('fetches a profile by id, readable anonymously', async () => {
        const response = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: alice.actorId },
        );
        expect(response.actor?.handle).toBe(alice.handle);
        expect(response.actor?.displayName).toBe('Alice');
        expect(response.actor?.isLocal).toBe(true);
        expect(response.actor?.counts?.posts).toBe(0);
      });

      it('fetches a profile by handle, case-insensitively (§22)', async () => {
        const response = await callUnary<GetActorByHandleRequest, GetActorByHandleResponse>(
          actors.getActorByHandle.bind(actors),
          { handle: alice.handle.toUpperCase() },
        );
        expect(response.actor?.id).toBe(alice.actorId);
      });

      it('returns NOT_FOUND for an id that does not exist', async () => {
        const error = await expectRejection<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: randomUUID() },
        );
        expect(error.code).toBe(GrpcStatus.NOT_FOUND);
      });
    });

    /**
     * `@grpc/proto-loader` — the actual runtime (de)serializer, not ts-proto — encodes/decodes
     * `google.protobuf.FieldMask` as its literal wire shape `{ paths: string[] }`, not the
     * flat `string[]` ts-proto's generated `UpdateProfileRequest.updateMask` type claims (see
     * `actor.controller.ts`'s `fieldMaskPaths`, LEARNINGS: proto-fieldmask-wire-shape). A raw
     * array here would silently encode as an *empty* mask — verified by making this call
     * with a plain array and watching every field come back unchanged.
     */
    function fieldMask(paths: string[]): UpdateProfileRequest['updateMask'] {
      return { paths } as unknown as UpdateProfileRequest['updateMask'];
    }

    /** The four rapid-personalization fields at their "unset" values — every fixture that
     * does not exercise them still must satisfy the (all-required) request type. */
    const noPersonalization = {
      profileBannerUrl: '',
      profileFrame: ProfileFrame.PROFILE_FRAME_UNSPECIFIED,
      nameTagStyle: NameTagStyle.NAME_TAG_STYLE_UNSPECIFIED,
      accentColor: '',
      avatarMediaId: '',
      bannerMediaId: '',
    } as const;

    describe('UpdateProfile', () => {
      it('applies only the fields named in update_mask (spec: UpdateProfileRequest doc)', async () => {
        const originalBio = 'bio before the update';
        await callUnary<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: originalBio,
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            ...noPersonalization,
            updateMask: fieldMask(['bio']),
          },
          { accessToken: bob.accessToken },
        );

        const afterFirstUpdate = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: bob.actorId },
        );
        expect(afterFirstUpdate.actor?.bio).toBe(originalBio);
        expect(afterFirstUpdate.actor?.displayName).toBe('Bob');

        // display_name changes, bio is untouched even though a (different) value is present on
        // the request — update_mask is what governs, not "is the field non-empty".
        await callUnary<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: 'Bobbert',
            bio: 'this should be ignored',
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            ...noPersonalization,
            updateMask: fieldMask(['display_name']),
          },
          { accessToken: bob.accessToken },
        );

        const afterSecondUpdate = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: bob.actorId },
        );
        expect(afterSecondUpdate.actor?.displayName).toBe('Bobbert');
        expect(afterSecondUpdate.actor?.bio).toBe(originalBio);
      });

      it('rejects an unauthenticated caller with UNAUTHENTICATED', async () => {
        const error = await expectRejection<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: 'nope',
            bio: '',
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            ...noPersonalization,
            updateMask: fieldMask(['display_name']),
          },
        );
        expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
      });

      it('rejects a website URL without an http(s) scheme', async () => {
        const error = await expectRejection<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: '',
            locationText: '',
            websiteUrl: 'not-a-url',
            nameplate: undefined,
            flair: undefined,
            ...noPersonalization,
            updateMask: fieldMask(['website_url']),
          },
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('updates the nameplate but never lets the caller set badges (spec §173)', async () => {
        await callUnary<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: '',
            locationText: '',
            websiteUrl: '',
            nameplate: {
              nameColor: '#7C3AED',
              glyph: '*',
              // Server-attested only — must be discarded, not adopted.
              badges: ['self-appointed-admin'],
              avatarFrame: '',
              statusLine: 'building patches',
              profileBorder: '',
            },
            flair: undefined,
            ...noPersonalization,
            updateMask: fieldMask(['nameplate']),
          },
          { accessToken: bob.accessToken },
        );

        const response = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: bob.actorId },
        );
        expect(response.actor?.nameplate?.nameColor).toBe('#7C3AED');
        expect(response.actor?.nameplate?.statusLine).toBe('building patches');
        expect(response.actor?.nameplate?.badges).toEqual([]);
      });
    });

    describe('UpdateProfile — rapid personalization (banner/frame/tag/accent)', () => {
      it('writes and clears each field through its own mask path', async () => {
        await callUnary<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: '',
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            profileBannerUrl: 'https://cdn.example.com/banner.png',
            profileFrame: ProfileFrame.PROFILE_FRAME_GRADIENT,
            nameTagStyle: NameTagStyle.NAME_TAG_STYLE_PILLED,
            accentColor: '#10B981',
            avatarMediaId: '',
            bannerMediaId: '',
            updateMask: fieldMask([
              'profile_banner_url',
              'profile_frame',
              'name_tag_style',
              'accent_color',
            ]),
          },
          { accessToken: alice.accessToken },
        );

        const response = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: alice.actorId },
        );
        expect(response.actor?.profileBannerUrl).toBe('https://cdn.example.com/banner.png');
        expect(response.actor?.profileFrame).toBe(ProfileFrame.PROFILE_FRAME_GRADIENT);
        expect(response.actor?.nameTagStyle).toBe(NameTagStyle.NAME_TAG_STYLE_PILLED);
        expect(response.actor?.accentColor).toBe('#10B981');

        // Clearing: empty string nulls a URL/colour, an explicit NONE clears an enum —
        // UNSPECIFIED is not a storable value (the write below would be INVALID_ARGUMENT).
        await callUnary<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: '',
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            profileBannerUrl: '',
            profileFrame: ProfileFrame.PROFILE_FRAME_NONE,
            nameTagStyle: NameTagStyle.NAME_TAG_STYLE_NONE,
            accentColor: '',
            avatarMediaId: '',
            bannerMediaId: '',
            updateMask: fieldMask([
              'profile_banner_url',
              'profile_frame',
              'name_tag_style',
              'accent_color',
            ]),
          },
          { accessToken: alice.accessToken },
        );

        const cleared = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: alice.actorId },
        );
        // An explicit NONE clears *to NONE* (distinguishable from never-set UNSPECIFIED on
        // the wire, though every client must render both identically — no frame).
        expect(cleared.actor?.profileBannerUrl).toBe('');
        expect(cleared.actor?.profileFrame).toBe(ProfileFrame.PROFILE_FRAME_NONE);
        expect(cleared.actor?.nameTagStyle).toBe(NameTagStyle.NAME_TAG_STYLE_NONE);
        expect(cleared.actor?.accentColor).toBe('');
      });
    });

    describe('UpdateProfile — avatar/banner uploads (#324)', () => {
      it("writes and clears the caller's own READY media as avatar/banner", async () => {
        const media = dataSource.getRepository(Media);
        const avatar = await media.save(
          media.create({ id: randomUUID(), ownerActorId: alice.actorId, state: 'READY' }),
        );
        const banner = await media.save(
          media.create({ id: randomUUID(), ownerActorId: alice.actorId, state: 'READY' }),
        );

        await callUnary<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: '',
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            ...noPersonalization,
            avatarMediaId: avatar.id,
            bannerMediaId: banner.id,
            updateMask: fieldMask(['avatar_media_id', 'banner_media_id']),
          },
          { accessToken: alice.accessToken },
        );

        const withMedia = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: alice.actorId },
        );
        expect(withMedia.actor?.avatar?.mediaId).toBe(avatar.id);
        expect(withMedia.actor?.banner?.mediaId).toBe(banner.id);

        await callUnary<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: '',
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            ...noPersonalization,
            avatarMediaId: '',
            bannerMediaId: '',
            updateMask: fieldMask(['avatar_media_id', 'banner_media_id']),
          },
          { accessToken: alice.accessToken },
        );

        const cleared = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: alice.actorId },
        );
        // `@grpc/proto-loader` decodes an unset message-typed field as `null`, not `undefined`
        // (LEARNINGS: proto-loader-null-message-fields) — ts-proto's type only claims the
        // latter.
        expect(cleared.actor?.avatar).toBeFalsy();
        expect(cleared.actor?.banner).toBeFalsy();
      });

      it("rejects a media id that isn't the caller's own with INVALID_ARGUMENT", async () => {
        const media = dataSource.getRepository(Media);
        const somebodyElses = await media.save(
          media.create({ id: randomUUID(), ownerActorId: bob.actorId, state: 'READY' }),
        );

        const error = await expectRejection<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: '',
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            ...noPersonalization,
            avatarMediaId: somebodyElses.id,
            bannerMediaId: '',
            updateMask: fieldMask(['avatar_media_id']),
          },
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });

      it('rejects media still processing (not READY) with INVALID_ARGUMENT', async () => {
        const media = dataSource.getRepository(Media);
        const stillProcessing = await media.save(
          media.create({ id: randomUUID(), ownerActorId: alice.actorId, state: 'PROCESSING' }),
        );

        const error = await expectRejection<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          {
            displayName: '',
            bio: '',
            locationText: '',
            websiteUrl: '',
            nameplate: undefined,
            flair: undefined,
            ...noPersonalization,
            avatarMediaId: stillProcessing.id,
            bannerMediaId: '',
            updateMask: fieldMask(['avatar_media_id']),
          },
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });
    });

    describe('UpdateProfile — rapid personalization rejections', () => {
      it.each([
        [
          'a non-http(s) banner URL',
          { profileBannerUrl: 'ftp://example.com/x.png' },
          'profile_banner_url',
        ],
        ['a non-hex accent colour', { accentColor: 'green' }, 'accent_color'],
        ['a 7-digit hex-ish accent colour', { accentColor: '#1234567' }, 'accent_color'],
        [
          'an UNSPECIFIED profile frame',
          { profileFrame: ProfileFrame.PROFILE_FRAME_UNSPECIFIED },
          'profile_frame',
        ],
        [
          'an UNSPECIFIED name tag style',
          { nameTagStyle: NameTagStyle.NAME_TAG_STYLE_UNSPECIFIED },
          'name_tag_style',
        ],
      ] as const)('rejects %s with INVALID_ARGUMENT', async (_label, patch, maskPath) => {
        const request = {
          displayName: '',
          bio: '',
          locationText: '',
          websiteUrl: '',
          nameplate: undefined,
          flair: undefined,
          ...noPersonalization,
          ...patch,
          updateMask: fieldMask([maskPath]),
        };
        const error = await expectRejection<UpdateProfileRequest, UpdateProfileResponse>(
          actors.updateProfile.bind(actors),
          request,
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });
    });

    describe('SearchActors', () => {
      it('matches handle prefix / display name, newest first, bounded by limit', async () => {
        const prefix = `zzsearch${testSuffix()}`;
        const first = await registerTestActor(auth, dataSource, inviterUserId, {
          handle: `${prefix}one`,
          displayName: 'Search Target One',
        });
        const second = await registerTestActor(auth, dataSource, inviterUserId, {
          handle: `${prefix}two`,
          displayName: 'Search Target Two',
        });
        await createTestPost(dataSource.manager, { authorActorId: first.actorId });

        const page = await callUnary<SearchActorsRequest, SearchActorsResponse>(
          actors.searchActors.bind(actors),
          { query: prefix, cursor: '', limit: 10 },
        );
        expect(page.actors.map((actor) => actor.id)).toEqual([second.actorId, first.actorId]);
        expect(page.page?.hasMore).toBe(false);
        // B-020: SearchActors returns real counts (one grouped query per page), not
        // zeroed placeholders.
        expect(page.actors[1]?.counts?.posts).toBe(1);
        expect(page.actors[0]?.counts?.posts).toBe(0);
      });

      it('rejects an empty query', async () => {
        const error = await expectRejection<SearchActorsRequest, SearchActorsResponse>(
          actors.searchActors.bind(actors),
          { query: '', cursor: '', limit: 10 },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });
    });

    describe('ListFollowers / ListFollowing', () => {
      it('lists both directions and GetActor reports real follower/following counts', async () => {
        const follower = await registerTestActor(auth, dataSource, inviterUserId);
        const followee = await registerTestActor(auth, dataSource, inviterUserId);

        await createTestFollow(dataSource.manager, {
          followerActorId: follower.actorId,
          followeeActorId: followee.actorId,
        });

        const followers = await callUnary<ListFollowersRequest, ListFollowersResponse>(
          actors.listFollowers.bind(actors),
          { actorId: followee.actorId, cursor: '', limit: 10 },
        );
        expect(followers.actors.map((actor) => actor.id)).toEqual([follower.actorId]);
        // B-020: ListFollowers/ListFollowing return real counts, not zeroed placeholders —
        // `follower` follows one actor (`followee`) and is followed by none.
        expect(followers.actors[0]?.counts?.following).toBe(1);
        expect(followers.actors[0]?.counts?.followers).toBe(0);

        const following = await callUnary<ListFollowingRequest, ListFollowingResponse>(
          actors.listFollowing.bind(actors),
          { actorId: follower.actorId, cursor: '', limit: 10 },
        );
        expect(following.actors.map((actor) => actor.id)).toEqual([followee.actorId]);
        // `followee` is followed by one actor (`follower`) and follows none.
        expect(following.actors[0]?.counts?.followers).toBe(1);
        expect(following.actors[0]?.counts?.following).toBe(0);

        const followeeProfile = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: followee.actorId },
        );
        expect(followeeProfile.actor?.counts?.followers).toBe(1);
        expect(followeeProfile.actor?.counts?.following).toBe(0);

        const followerProfile = await callUnary<GetActorRequest, GetActorResponse>(
          actors.getActor.bind(actors),
          { id: follower.actorId },
        );
        expect(followerProfile.actor?.counts?.following).toBe(1);
        expect(followerProfile.actor?.counts?.followers).toBe(0);
      });
    });
  },
);
