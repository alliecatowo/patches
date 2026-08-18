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
  type UpdateProfileRequest,
  type UpdateProfileResponse,
} from '@patches/proto';
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
            updateMask: fieldMask(['website_url']),
          },
          { accessToken: alice.accessToken },
        );
        expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
      });
    });

    describe('Phase 3 RPCs', () => {
      it('ListFollowers returns UNIMPLEMENTED rather than an invented empty list', async () => {
        const error = await expectRejection<ListFollowersRequest, ListFollowersResponse>(
          actors.listFollowers.bind(actors),
          { actorId: alice.actorId, cursor: '', limit: 0 },
        );
        expect(error.code).toBe(GrpcStatus.UNIMPLEMENTED);
      });
    });
  },
);
