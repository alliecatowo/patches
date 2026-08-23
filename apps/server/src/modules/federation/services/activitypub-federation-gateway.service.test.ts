import { Actor, Follow, Post, Repost } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../../config/app-config.service.js';
import { NoopFederationGateway, type FederationGateway } from '../federation-gateway.js';
import { ActivityPubFederationGateway } from './activitypub-federation-gateway.service.js';
import type { DeliveryService } from './delivery.service.js';
import type { DomainBlockService } from './domain-block.service.js';
import type { KeyService } from './key.service.js';

/**
 * P14-013's "close the outbound recipient-resolution gap" unit coverage — a fake `EntityManager`
 * (same pattern `inbox.service.test.ts`/`key.service.test.ts` use) rather than a real database,
 * since the point here is proving `ActivityPubFederationGateway` never hands `DeliveryService`
 * an inbox URL belonging to a `domain_blocks` domain, not exercising TypeORM itself.
 */

const ORIGIN = 'https://local.test';

function fakeConfig(): AppConfigService {
  return { publicOrigin: ORIGIN } as AppConfigService;
}

function fakeKeys(): KeyService {
  return {
    getOrCreateKeyPair: vi.fn().mockResolvedValue({ privateKeyPem: '', publicKeyPem: '' }),
  } as unknown as KeyService;
}

/** Returns the fake `DeliveryService` and a standalone `enqueue` reference to assert on —
 * asserting via `service.enqueue` directly trips `@typescript-eslint/unbound-method` (the
 * property is typed as `DeliveryService`'s real method), so tests use this `enqueue` instead. */
function fakeDelivery(): { service: DeliveryService; enqueue: ReturnType<typeof vi.fn> } {
  const enqueue = vi.fn().mockResolvedValue(undefined);
  return { service: { enqueue } as unknown as DeliveryService, enqueue };
}

/** A `DomainBlockService` fake backed by a plain `Set` of blocked domains, exactly the
 * real one's contract (`isBlocked(manager, domain): Promise<boolean>`). */
function fakeDomainBlocks(blocked: readonly string[]): DomainBlockService {
  const set = new Set(blocked);
  return {
    isBlocked: (_manager: unknown, domain: string) => Promise.resolve(set.has(domain)),
  };
}

function remoteActor(overrides: Partial<Actor>): Actor {
  return {
    id: 'remote-1',
    isLocal: false,
    handleNormalized: 'remote',
    homeServer: 'good.example',
    canonicalUri: 'https://good.example/actors/remote',
    inboxUri: 'https://good.example/actors/remote/inbox',
    sharedInboxUri: null,
    ...overrides,
  } as Actor;
}

function localActor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'local-1',
    isLocal: true,
    handleNormalized: 'local',
    homeServer: null,
    canonicalUri: null,
    inboxUri: null,
    sharedInboxUri: null,
    ...overrides,
  } as Actor;
}

interface FollowRow {
  followeeActorId: string;
  followerActor: Actor;
}

/** Fakes just enough of `EntityManager` for the code paths under test: `getRepository(Actor)`'s
 * `findOneOrFail`/`findOne`, `getRepository(Follow)`'s chained query-builder,
 * `getRepository(Post)`'s `findOne`, and `getRepository(Repost)`'s `findOne` (with the
 * relations the announce path needs pre-joined into the row). */
function fakeManager(options: {
  actors?: Record<string, Actor>;
  follows?: FollowRow[];
  posts?: Record<string, Post>;
  reposts?: Record<string, Repost>;
}) {
  const actors = options.actors ?? {};
  const follows = options.follows ?? [];
  const posts = options.posts ?? {};
  const reposts = options.reposts ?? {};

  const getRepository = (entity: unknown): unknown => {
    if (entity === Actor) {
      return {
        findOneOrFail: ({ where: { id } }: { where: { id: string } }) => {
          const actor = actors[id];
          if (actor === undefined) throw new Error(`no such actor: ${id}`);
          return Promise.resolve(actor);
        },
        findOne: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(actors[id] ?? null),
      };
    }
    if (entity === Follow) {
      return {
        createQueryBuilder: () => {
          const qb = {
            innerJoinAndSelect: () => qb,
            where: () => qb,
            andWhere: () => qb,
            getMany: () => Promise.resolve(follows),
          };
          return qb;
        },
      };
    }
    if (entity === Post) {
      return {
        findOne: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(posts[id] ?? null),
      };
    }
    if (entity === Repost) {
      return {
        findOne: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(reposts[id] ?? null),
      };
    }
    throw new Error(`unexpected entity in fakeManager.getRepository: ${String(entity)}`);
  };

  return { getRepository };
}

describe('ActivityPubFederationGateway (P14-013: outbound domain-block gap)', () => {
  it('followRemoteActor never enqueues a delivery to a blocked domain', async () => {
    const follower = localActor({ id: 'local-1' });
    const target = remoteActor({ id: 'remote-1', homeServer: 'blocked.example' });
    const { service: delivery, enqueue } = fakeDelivery();
    const gateway = new ActivityPubFederationGateway(
      fakeConfig(),
      delivery,
      fakeKeys(),
      fakeDomainBlocks(['blocked.example']),
    );
    const manager = fakeManager({ actors: { 'local-1': follower, 'remote-1': target } });

    await gateway.followRemoteActor(manager as never, 'local-1', 'remote-1');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('followRemoteActor still enqueues a delivery to a non-blocked domain', async () => {
    const follower = localActor({ id: 'local-1' });
    const target = remoteActor({ id: 'remote-1', homeServer: 'good.example' });
    const { service: delivery, enqueue } = fakeDelivery();
    const gateway = new ActivityPubFederationGateway(
      fakeConfig(),
      delivery,
      fakeKeys(),
      fakeDomainBlocks(['blocked.example']),
    );
    const manager = fakeManager({ actors: { 'local-1': follower, 'remote-1': target } });

    await gateway.followRemoteActor(manager as never, 'local-1', 'remote-1');

    expect(enqueue).toHaveBeenCalledTimes(1);
    const call = enqueue.mock.calls[0]?.[1] as { inboxUrls: string[] };
    expect(call.inboxUrls).toEqual(['https://good.example/actors/remote/inbox']);
  });

  it('likeRemotePost never enqueues a delivery to a blocked domain', async () => {
    const liker = localActor({ id: 'local-1' });
    const author = remoteActor({ id: 'remote-1', homeServer: 'blocked.example' });
    const post = {
      id: 'post-1',
      isLocal: false,
      authorActor: author,
      canonicalUri: 'https://blocked.example/posts/1',
    } as Post;
    const { service: delivery, enqueue } = fakeDelivery();
    const gateway = new ActivityPubFederationGateway(
      fakeConfig(),
      delivery,
      fakeKeys(),
      fakeDomainBlocks(['blocked.example']),
    );
    const manager = fakeManager({
      actors: { 'local-1': liker },
      posts: { 'post-1': post },
    });

    await gateway.likeRemotePost(manager as never, 'local-1', 'post-1');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('publishPost drops a blocked remote follower before resolving any inbox URL', async () => {
    const author = localActor({ id: 'local-1' });
    const blockedFollower = remoteActor({
      id: 'remote-blocked',
      homeServer: 'blocked.example',
      inboxUri: 'https://blocked.example/inbox',
    });
    const okFollower = remoteActor({
      id: 'remote-ok',
      homeServer: 'good.example',
      inboxUri: 'https://good.example/inbox',
    });
    const post = {
      id: 'post-1',
      isLocal: true,
      visibility: 'PUBLIC',
      authorActor: author,
      body: 'hello',
      createdAt: new Date(),
      inReplyToId: null,
    } as Post;
    const { service: delivery, enqueue } = fakeDelivery();
    const gateway = new ActivityPubFederationGateway(
      fakeConfig(),
      delivery,
      fakeKeys(),
      fakeDomainBlocks(['blocked.example']),
    );
    const manager = fakeManager({
      posts: { 'post-1': post },
      follows: [
        { followeeActorId: 'local-1', followerActor: blockedFollower },
        { followeeActorId: 'local-1', followerActor: okFollower },
      ],
    });

    await gateway.publishPost(manager as never, 'post-1');

    expect(enqueue).toHaveBeenCalledTimes(1);
    const call = enqueue.mock.calls[0]?.[1] as { inboxUrls: string[] };
    expect(call.inboxUrls).toEqual(['https://good.example/inbox']);
  });
});

/** P18-003 (ADR 0028 §4): outbound repost federation — the Announce id is deterministically
 * reconstructed from the repost row, and Undo(Announce) names exactly that id. */
describe('ActivityPubFederationGateway (P18-003: outbound Announce/Undo)', () => {
  const ANNOUNCE_ID = 'https://local.test/activities/announce/repost-1';

  function gatewayWith(
    enqueue: ReturnType<typeof vi.fn>,
    blockedDomains: readonly string[] = [],
  ): ActivityPubFederationGateway {
    return new ActivityPubFederationGateway(
      fakeConfig(),
      { enqueue } as unknown as DeliveryService,
      fakeKeys(),
      fakeDomainBlocks(blockedDomains),
    );
  }

  function repostFixture(overrides: Partial<Repost> = {}): Repost {
    const author = remoteActor({
      id: 'remote-1',
      homeServer: 'good.example',
      canonicalUri: 'https://good.example/actors/remote',
      inboxUri: 'https://good.example/inbox',
      sharedInboxUri: null,
    });
    const post = {
      id: 'post-1',
      isLocal: false,
      visibility: 'PUBLIC',
      canonicalUri: 'https://good.example/posts/9',
      authorActor: author,
    } as Post;
    return {
      id: 'repost-1',
      actorId: 'local-1',
      actor: localActor({ id: 'local-1' }),
      postId: 'post-1',
      post,
      remoteActivityUri: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  function managerFor(repost: Repost | null) {
    return fakeManager(
      repost === null
        ? {}
        : { reposts: { [repost.id]: repost }, posts: { [repost.postId]: repost.post } },
    );
  }

  it('announceRemotePost reconstructs the same activity id across repeated calls (retry stability)', async () => {
    const repost = repostFixture();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const gateway = gatewayWith(enqueue);
    const manager = managerFor(repost);

    await gateway.announceRemotePost(manager as never, 'repost-1');
    await gateway.announceRemotePost(manager as never, 'repost-1');

    expect(enqueue).toHaveBeenCalledTimes(2);
    const first = enqueue.mock.calls[0]?.[1] as { activity: Record<string, unknown> };
    const second = enqueue.mock.calls[1]?.[1] as { activity: Record<string, unknown> };
    expect(first.activity.type).toBe('Announce');
    expect(first.activity.id).toBe(ANNOUNCE_ID);
    expect(first.activity.object).toBe('https://good.example/posts/9');
    expect(second.activity.id).toBe(first.activity.id);
  });

  it('unannounceRemotePost delivers an Undo whose object is exactly the deterministic Announce', async () => {
    const repost = repostFixture();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const gateway = gatewayWith(enqueue);

    await gateway.unannounceRemotePost(managerFor(repost) as never, 'repost-1');

    expect(enqueue).toHaveBeenCalledTimes(1);
    const call = enqueue.mock.calls[0]?.[1] as {
      activity: Record<string, unknown>;
      actorId: string;
      inboxUrls: string[];
    };
    expect(call.actorId).toBe('local-1');
    expect(call.inboxUrls).toEqual(['https://good.example/inbox']);
    expect(call.activity.type).toBe('Undo');
    expect(call.activity.actor).toBe('https://local.test/users/local');
    // ADR 0028 §4: never a fresh inner-activity id (B-079) — the object names the Announce.
    const object = call.activity.object as Record<string, unknown>;
    expect(object.type).toBe('Announce');
    expect(object.id).toBe(ANNOUNCE_ID);
  });

  it('announceRemotePost is a no-op for a non-PUBLIC post', async () => {
    const base = repostFixture();
    for (const visibility of ['UNLISTED', 'FOLLOWERS'] as const) {
      const repost = repostFixture({ post: { ...base.post, visibility } });
      const enqueue = vi.fn().mockResolvedValue(undefined);
      await gatewayWith(enqueue).announceRemotePost(managerFor(repost) as never, 'repost-1');
      expect(enqueue).not.toHaveBeenCalled();
    }
  });

  it('announceRemotePost is a no-op when the repost row or its post is local/missing', async () => {
    const base = repostFixture();
    const localPost = repostFixture({ post: { ...base.post, isLocal: true } });
    const missingRow = managerFor(null);
    const enqueueA = vi.fn().mockResolvedValue(undefined);
    const enqueueB = vi.fn().mockResolvedValue(undefined);
    await gatewayWith(enqueueA).announceRemotePost(managerFor(localPost) as never, 'repost-1');
    await gatewayWith(enqueueB).announceRemotePost(missingRow as never, 'nope');
    expect(enqueueA).not.toHaveBeenCalled();
    expect(enqueueB).not.toHaveBeenCalled();
  });

  it('announceRemotePost never enqueues a delivery to a blocked-domain author', async () => {
    const blockedAuthor = remoteActor({
      id: 'remote-1',
      homeServer: 'blocked.example',
      inboxUri: 'https://blocked.example/inbox',
    });
    const base = repostFixture();
    const repost = repostFixture({
      post: {
        ...base.post,
        canonicalUri: 'https://blocked.example/posts/9',
        authorActor: blockedAuthor,
      },
    });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    await gatewayWith(enqueue, ['blocked.example']).announceRemotePost(
      managerFor(repost) as never,
      'repost-1',
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('NoopFederationGateway resolves announce/unannounce without effect (federation disabled)', async () => {
    // Typed as the seam (the Noop class's own stubs declare zero parameters).
    const noop: FederationGateway = new NoopFederationGateway();
    const manager = fakeManager({});
    await expect(noop.announceRemotePost(manager as never, 'repost-1')).resolves.toBeUndefined();
    await expect(noop.unannounceRemotePost(manager as never, 'repost-1')).resolves.toBeUndefined();
  });
});
