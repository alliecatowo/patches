import { Actor, Follow, Post, PostTag, Repost } from '@patches/database';
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

/** Orders fixture rows by a single key the way the real repository would — string values
 * lexicographically, ISO date strings included; anything else compares equal (the fake only
 * ever sorts on keys the fixtures populate with strings). */
function compareByOrderKey(a: unknown, b: unknown): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  return 0;
}

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
 * `getRepository(Post)`'s `findOne`, `getRepository(PostTag)`'s `find` (with the ordering
 * P18-006's publish path asks for), and `getRepository(Repost)`'s `findOne` (with the
 * relations the announce path needs pre-joined into the row). */
function fakeManager(options: {
  actors?: Record<string, Actor>;
  follows?: FollowRow[];
  posts?: Record<string, Post>;
  reposts?: Record<string, Repost>;
  postTags?: Record<string, unknown>[] | undefined;
}) {
  const actors = options.actors ?? {};
  const follows = options.follows ?? [];
  const posts = options.posts ?? {};
  const reposts = options.reposts ?? {};
  const postTags = options.postTags ?? [];

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
    if (entity === PostTag) {
      return {
        find: ({
          where,
          order,
        }: {
          where: { postId: string };
          order?: Record<string, 'ASC' | 'DESC'>;
        }) => {
          let rows = postTags.filter((row) => row.postId === where.postId);
          if (order !== undefined) {
            rows = [...rows].sort((a, b) => {
              for (const [key, dir] of Object.entries(order)) {
                const cmp = compareByOrderKey(a[key], b[key]);
                if (cmp !== 0) return dir === 'ASC' ? cmp : -cmp;
              }
              return 0;
            });
          }
          return Promise.resolve(rows);
        },
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

/** P18-006 (ADR 0028 §3): publishPost emits the post's tags as `as:Hashtag` entries, quote
 * linkage as FEP-044f `quote` + all three legacy fallbacks, and the local `quote_policy` as
 * an additive interaction policy — all additively, so a peer that understands none of it
 * still receives the same valid post it always did. */
describe('ActivityPubFederationGateway (P18-006: outbound tags + quotes on publishPost)', () => {
  const POST_ID = '22222222-2222-4222-8222-222222222222';

  function publishPostFixture(overrides: Record<string, unknown> = {}): Post {
    return {
      id: POST_ID,
      isLocal: true,
      visibility: 'PUBLIC',
      authorActor: localActor({ id: 'local-1' }),
      body: 'hello #fediverse',
      createdAt: new Date('2026-08-23T00:00:00Z'),
      inReplyToId: null,
      quotedPostId: null,
      quotePolicy: 'ANYONE',
      ...overrides,
    } as Post;
  }

  function publishManager(options: {
    post: Post;
    posts?: Record<string, Post>;
    postTags?: Record<string, unknown>[];
  }) {
    const follower = remoteActor({ id: 'remote-1', homeServer: 'good.example' });
    return fakeManager({
      posts: { [options.post.id]: options.post, ...options.posts },
      follows: [{ followeeActorId: 'local-1', followerActor: follower }],
      postTags: options.postTags,
    });
  }

  async function publishedNote(
    options: Parameters<typeof publishManager>[0],
  ): Promise<Record<string, unknown>> {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const gateway = new ActivityPubFederationGateway(
      fakeConfig(),
      { enqueue } as unknown as DeliveryService,
      fakeKeys(),
      fakeDomainBlocks([]),
    );
    await gateway.publishPost(publishManager(options) as never, options.post.id);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const call = enqueue.mock.calls[0]?.[1] as { activity: Record<string, unknown> };
    return call.activity.object as Record<string, unknown>;
  }

  it('emits one Hashtag tag entry per post_tag row, deterministically ordered', async () => {
    const note = await publishedNote({
      post: publishPostFixture(),
      postTags: [
        {
          postId: POST_ID,
          tagId: 'tag-b',
          createdAt: '2026-08-23T00:00:02Z',
          tag: { name: 'second' },
        },
        {
          postId: POST_ID,
          tagId: 'tag-a',
          createdAt: '2026-08-23T00:00:01Z',
          tag: { name: 'first' },
        },
      ],
    });
    expect(note.tag).toEqual([
      { type: 'Hashtag', name: '#first', id: `${ORIGIN}/posts/${POST_ID}#tag-first` },
      { type: 'Hashtag', name: '#second', id: `${ORIGIN}/posts/${POST_ID}#tag-second` },
    ]);
  });

  it('emits no tag property for a post without post_tag rows', async () => {
    const note = await publishedNote({ post: publishPostFixture() });
    expect('tag' in note).toBe(false);
  });

  it('emits quote + all three legacy properties naming a remote quoted post’s canonicalUri', async () => {
    const note = await publishedNote({
      post: publishPostFixture({ quotedPostId: 'remote-quoted' }),
      posts: {
        'remote-quoted': {
          id: 'remote-quoted',
          isLocal: false,
          canonicalUri: 'https://good.example/posts/9',
        } as Post,
      },
    });
    expect(note.quote).toBe('https://good.example/posts/9');
    expect(note.quoteUri).toBe('https://good.example/posts/9');
    expect(note.quoteUrl).toBe('https://good.example/posts/9');
    expect(note._misskey_quote).toBe('https://good.example/posts/9');
  });

  it('emits quote naming the local post URI for a locally-authored quoted post', async () => {
    const localQuotedId = '33333333-3333-4333-8333-333333333333';
    const note = await publishedNote({
      post: publishPostFixture({ quotedPostId: localQuotedId }),
      posts: {
        [localQuotedId]: {
          id: localQuotedId,
          isLocal: true,
          canonicalUri: null,
        } as Post,
      },
    });
    expect(note.quote).toBe(`${ORIGIN}/posts/${localQuotedId}`);
    expect(note._misskey_quote).toBe(`${ORIGIN}/posts/${localQuotedId}`);
  });

  it('emits no quote properties when the quoted post has no federated URI', async () => {
    const note = await publishedNote({
      post: publishPostFixture({ quotedPostId: 'missing' }),
      posts: {},
    });
    for (const key of ['quote', 'quoteUri', 'quoteUrl', '_misskey_quote']) {
      expect(key in note).toBe(false);
    }
  });

  it('maps each local quote_policy to the matching canQuote audience (no invented following)', async () => {
    const cases: readonly { policy: 'ANYONE' | 'FOLLOWERS' | 'NOBODY'; audience: string }[] = [
      { policy: 'ANYONE', audience: 'https://www.w3.org/ns/activitystreams#Public' },
      { policy: 'FOLLOWERS', audience: `${ORIGIN}/users/local/followers` },
      { policy: 'NOBODY', audience: `${ORIGIN}/users/local` },
    ];
    for (const { policy, audience } of cases) {
      const note = await publishedNote({ post: publishPostFixture({ quotePolicy: policy }) });
      expect(note.interactionPolicy).toEqual({
        id: `${ORIGIN}/posts/${POST_ID}#interaction-policy`,
        canQuote: audience,
      });
    }
  });

  it('omits interactionPolicy for a post whose policy is not loaded (pre-P18-006 shape)', async () => {
    const note = await publishedNote({
      post: publishPostFixture({ quotePolicy: undefined }),
    });
    expect('interactionPolicy' in note).toBe(false);
/** B-079: `Undo(Follow)`/`Undo(Like)` must name the *original* activity id, not a fresh
 * `randomUUID()` — a peer receiving the undo can only match it to the activity it already
 * recorded if the inner id is byte-identical. Neither `follows` nor `likes` keeps a row past
 * unfollow/unlike, so the id is re-derived via `localDeterministicActivityUri` rather than
 * looked up. */
describe('ActivityPubFederationGateway (B-079: outbound Follow/Like Undo names the original id)', () => {
  it('followRemoteActor reconstructs the same Follow activity id across repeated calls', async () => {
    const follower = localActor({ id: 'local-1' });
    const target = remoteActor({ id: 'remote-1', homeServer: 'good.example' });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const gateway = new ActivityPubFederationGateway(
      fakeConfig(),
      { enqueue } as unknown as DeliveryService,
      fakeKeys(),
      fakeDomainBlocks([]),
    );
    const manager = fakeManager({ actors: { 'local-1': follower, 'remote-1': target } });

    await gateway.followRemoteActor(manager as never, 'local-1', 'remote-1');
    await gateway.followRemoteActor(manager as never, 'local-1', 'remote-1');

    expect(enqueue).toHaveBeenCalledTimes(2);
    const first = enqueue.mock.calls[0]?.[1] as { activity: Record<string, unknown> };
    const second = enqueue.mock.calls[1]?.[1] as { activity: Record<string, unknown> };
    expect(first.activity.type).toBe('Follow');
    expect(typeof first.activity.id).toBe('string');
    expect(second.activity.id).toBe(first.activity.id);
  });

  it("unfollowRemoteActor's Undo names the exact id followRemoteActor minted for the Follow", async () => {
    const follower = localActor({ id: 'local-1' });
    const target = remoteActor({ id: 'remote-1', homeServer: 'good.example' });
    const manager = fakeManager({ actors: { 'local-1': follower, 'remote-1': target } });

    const followEnqueue = vi.fn().mockResolvedValue(undefined);
    const followGateway = new ActivityPubFederationGateway(
      fakeConfig(),
      { enqueue: followEnqueue } as unknown as DeliveryService,
      fakeKeys(),
      fakeDomainBlocks([]),
    );
    await followGateway.followRemoteActor(manager as never, 'local-1', 'remote-1');
    const originalFollow = followEnqueue.mock.calls[0]?.[1] as {
      activity: Record<string, unknown>;
    };
    const originalFollowId = originalFollow.activity.id as string;

    const unfollowEnqueue = vi.fn().mockResolvedValue(undefined);
    const unfollowGateway = new ActivityPubFederationGateway(
      fakeConfig(),
      { enqueue: unfollowEnqueue } as unknown as DeliveryService,
      fakeKeys(),
      fakeDomainBlocks([]),
    );
    await unfollowGateway.unfollowRemoteActor(manager as never, 'local-1', 'remote-1');

    expect(unfollowEnqueue).toHaveBeenCalledTimes(1);
    const call = unfollowEnqueue.mock.calls[0]?.[1] as { activity: Record<string, unknown> };
    expect(call.activity.type).toBe('Undo');
    const object = call.activity.object as Record<string, unknown>;
    expect(object.type).toBe('Follow');
    // The whole point of B-079: the Undo's inner Follow must name the id the peer already has
    // on file, not a fresh one.
    expect(object.id).toBe(originalFollowId);
    // And the outer Undo wrapper is a distinct, one-shot id (never equal to the inner one).
    expect(call.activity.id).not.toBe(object.id);
  });

  it('likeRemotePost reconstructs the same Like activity id across repeated calls', async () => {
    const liker = localActor({ id: 'local-1' });
    const author = remoteActor({ id: 'remote-1', homeServer: 'good.example' });
    const post = {
      id: 'post-1',
      isLocal: false,
      authorActor: author,
      canonicalUri: 'https://good.example/posts/1',
    } as Post;
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const gateway = new ActivityPubFederationGateway(
      fakeConfig(),
      { enqueue } as unknown as DeliveryService,
      fakeKeys(),
      fakeDomainBlocks([]),
    );
    const manager = fakeManager({ actors: { 'local-1': liker }, posts: { 'post-1': post } });

    await gateway.likeRemotePost(manager as never, 'local-1', 'post-1');
    await gateway.likeRemotePost(manager as never, 'local-1', 'post-1');

    expect(enqueue).toHaveBeenCalledTimes(2);
    const first = enqueue.mock.calls[0]?.[1] as { activity: Record<string, unknown> };
    const second = enqueue.mock.calls[1]?.[1] as { activity: Record<string, unknown> };
    expect(first.activity.type).toBe('Like');
    expect(typeof first.activity.id).toBe('string');
    expect(second.activity.id).toBe(first.activity.id);
  });

  it("unlikeRemotePost's Undo names the exact id likeRemotePost minted for the Like", async () => {
    const liker = localActor({ id: 'local-1' });
    const author = remoteActor({ id: 'remote-1', homeServer: 'good.example' });
    const post = {
      id: 'post-1',
      isLocal: false,
      authorActor: author,
      canonicalUri: 'https://good.example/posts/1',
    } as Post;
    const manager = fakeManager({ actors: { 'local-1': liker }, posts: { 'post-1': post } });

    const likeEnqueue = vi.fn().mockResolvedValue(undefined);
    const likeGateway = new ActivityPubFederationGateway(
      fakeConfig(),
      { enqueue: likeEnqueue } as unknown as DeliveryService,
      fakeKeys(),
      fakeDomainBlocks([]),
    );
    await likeGateway.likeRemotePost(manager as never, 'local-1', 'post-1');
    const originalLike = likeEnqueue.mock.calls[0]?.[1] as { activity: Record<string, unknown> };
    const originalLikeId = originalLike.activity.id as string;

    const unlikeEnqueue = vi.fn().mockResolvedValue(undefined);
    const unlikeGateway = new ActivityPubFederationGateway(
      fakeConfig(),
      { enqueue: unlikeEnqueue } as unknown as DeliveryService,
      fakeKeys(),
      fakeDomainBlocks([]),
    );
    await unlikeGateway.unlikeRemotePost(manager as never, 'local-1', 'post-1');

    expect(unlikeEnqueue).toHaveBeenCalledTimes(1);
    const call = unlikeEnqueue.mock.calls[0]?.[1] as { activity: Record<string, unknown> };
    expect(call.activity.type).toBe('Undo');
    const object = call.activity.object as Record<string, unknown>;
    expect(object.type).toBe('Like');
    expect(object.id).toBe(originalLikeId);
    expect(call.activity.id).not.toBe(object.id);
  });
});
