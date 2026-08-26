import { generateKeyPairSync } from 'node:crypto';

import {
  Actor,
  Block,
  Follow,
  InboxActivity,
  Mute,
  Post,
  PostTag,
  QuoteAuthorization,
  Tag,
} from '@patches/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import type { AppConfigService } from '../../../config/app-config.service.js';
import type { NotificationsService } from '../../notifications/notification.service.js';
import { FederationMetricsService } from '../federation-metrics.service.js';
import { RemoteObjectFetchError, type RemoteObjectService } from '../remote-object.service.js';
import type { PeerRateLimiterService } from '../security/peer-rate-limiter.service.js';
import { computeDigestHeader } from '../signatures/digest.js';
import { signRequest } from '../signatures/http-signature.js';
import type { DeliveryService } from './delivery.service.js';
import type { DomainBlockService } from './domain-block.service.js';
import { InboxService, type InboxRequestContext } from './inbox.service.js';
import type { KeyService } from './key.service.js';
import type { RemoteActorService } from './remote-actor.service.js';
import type { TagExtractionService } from '../../../modules/tags/tag-extraction.service.js';

/**
 * A-035's "Update semantics decided" test coverage, at the `InboxService` unit level (per the
 * task brief: the two-node process-spawning integration harness is heavy, and this exercises
 * exactly the same dispatch/ownership/actor-refresh logic with a fake `EntityManager` instead
 * — real HTTP Signatures are still generated and verified below, only the DB layer and the
 * collaborating federation services are faked, same pattern as `media.service.test.ts`).
 */

const HOST = 'local.test';
const TARGET = '/inbox';

function keyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

function fakeSender(publicKeyPem: string, overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'sender-1',
    userId: null,
    user: null,
    handle: 'alice',
    handleNormalized: 'alice@remote.test',
    clientRequestId: null,
    displayName: null,
    bio: null,
    locationText: null,
    websiteUrl: null,
    avatarMediaId: null,
    avatarMedia: null,
    isLocal: false,
    homeServer: 'remote.test',
    canonicalUri: 'https://remote.test/users/alice',
    inboxUri: 'https://remote.test/users/alice/inbox',
    outboxUri: null,
    federationState: null,
    publicKeyPem,
    sharedInboxUri: null,
    lastFetchedAt: new Date(),
    movedToUri: null,
    alsoKnownAs: null,
    nameplate: null,
    profileBannerUrl: null,
    profileFrame: null,
    nameTagStyle: null,
    accentColor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function buildContext(
  activity: Record<string, unknown>,
  signer: { keyId: string; privateKeyPem: string },
): InboxRequestContext {
  const rawBody = Buffer.from(JSON.stringify(activity));
  const digest = computeDigestHeader(rawBody);
  const date = new Date().toUTCString();
  const signature = signRequest({
    method: 'POST',
    target: TARGET,
    host: HOST,
    date,
    digest,
    keyId: signer.keyId,
    privateKeyPem: signer.privateKeyPem,
  });
  return {
    method: 'POST',
    target: TARGET,
    headers: { signature, host: HOST, date, digest },
    rawBody,
  };
}

interface FakePostRepo {
  findOne: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface FakeInboxActivityRepo {
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

function fakeManager(
  postRepo: FakePostRepo,
  inboxActivityRepo: FakeInboxActivityRepo,
  extra: Map<unknown, unknown> = new Map(),
) {
  const getRepository = (entity: unknown): unknown => {
    if (entity === Post) return postRepo;
    if (entity === InboxActivity) return inboxActivityRepo;
    const extraRepo = extra.get(entity);
    if (extraRepo !== undefined) return extraRepo;
    throw new Error(`unexpected entity in fakeManager.getRepository: ${String(entity)}`);
  };
  return { getRepository };
}

describe('InboxService — Update semantics (A-035)', () => {
  let postRepo: FakePostRepo;
  let inboxActivityRepo: FakeInboxActivityRepo;
  let remoteActors: RemoteActorService;
  let metrics: FederationMetricsService;
  let inbox: InboxService;
  let sender: Actor;
  let signer: { keyId: string; privateKeyPem: string };
  let rateLimiter: PeerRateLimiterService;
  let getOrFetchByUri: ReturnType<typeof vi.fn>;
  let consumeVerifiedOrigin: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postRepo = { findOne: vi.fn(), update: vi.fn().mockResolvedValue({ affected: 1 }) };
    inboxActivityRepo = {
      create: vi.fn((value: unknown) => value),
      save: vi.fn().mockResolvedValue(undefined),
    };

    const { publicKeyPem, privateKeyPem } = keyPair();
    sender = fakeSender(publicKeyPem);
    signer = { keyId: `${sender.canonicalUri}#main-key`, privateKeyPem };

    getOrFetchByUri = vi.fn().mockResolvedValue(sender);
    remoteActors = {
      resolveByAcct: vi.fn(),
      getOrFetchByUri,
    } as unknown as RemoteActorService;

    const domainBlocks = {
      isBlocked: vi.fn().mockResolvedValue(false),
    } as unknown as DomainBlockService;
    const delivery = { enqueue: vi.fn() } as unknown as DeliveryService;
    const notifications = {
      notifyFollow: vi.fn(),
      notifyLike: vi.fn(),
    } as unknown as NotificationsService;
    const keys = { getOrCreateKeyPair: vi.fn() } as unknown as KeyService;
    const config = { publicOrigin: 'http://origin.test' } as AppConfigService;
    metrics = new FederationMetricsService({ federationEnabled: false } as AppConfigService);
    consumeVerifiedOrigin = vi.fn().mockReturnValue(true);
    rateLimiter = {
      consumeTransportPeer: vi.fn().mockReturnValue(true),
      consumeVerifiedOrigin,
    } as unknown as PeerRateLimiterService;
    const tagExtraction = {} as unknown as TagExtractionService;

    const manager = fakeManager(postRepo, inboxActivityRepo);
    const dataSource = {
      transaction: (fn: (m: ReturnType<typeof fakeManager>) => unknown) => fn(manager),
    } as unknown as DataSource;

    inbox = new InboxService(
      dataSource,
      config,
      remoteActors,
      { fetchObject: vi.fn() } as unknown as RemoteObjectService,
      domainBlocks,
      delivery,
      notifications,
      keys,
      metrics,
      rateLimiter,
      tagExtraction,
    );
  });

  it('rejects when the signed digest does not match the exact received body', async () => {
    const signedActivity = {
      id: 'https://remote.test/activities/signed',
      type: 'Update',
      actor: sender.canonicalUri,
      object: { id: 'https://remote.test/notes/1', type: 'Note', content: 'signed' },
    };
    const submittedActivity = {
      ...signedActivity,
      id: 'https://remote.test/activities/submitted',
      object: { id: 'https://remote.test/notes/1', type: 'Note', content: 'swapped' },
    };
    const ctx = buildContext(signedActivity, signer);
    ctx.rawBody = Buffer.from(JSON.stringify(submittedActivity));

    await expect(inbox.handle(ctx)).resolves.toEqual({
      accepted: false,
      reason: 'INVALID_SIGNATURE',
    });
    expect(getOrFetchByUri).not.toHaveBeenCalled();
    expect(consumeVerifiedOrigin).not.toHaveBeenCalled();
  });

  it('charges the verified canonical origin only after signature verification', async () => {
    const activity = {
      id: 'https://remote.test/activities/origin-budget',
      type: 'Unknown',
      actor: sender.canonicalUri,
    };

    await expect(inbox.handle(buildContext(activity, signer))).resolves.toEqual({
      accepted: true,
      duplicate: false,
    });
    expect(consumeVerifiedOrigin).toHaveBeenCalledWith('https://remote.test');
  });

  it('does not charge an actor-spoofed origin as though it were verified', async () => {
    const spoofedActor = 'https://spoofed.invalid/users/alice';
    const activity = {
      id: 'https://spoofed.invalid/activities/spoofed',
      type: 'Unknown',
      actor: spoofedActor,
    };

    await expect(
      inbox.handle(
        buildContext(activity, {
          ...signer,
          keyId: `${spoofedActor}#main-key`,
        }),
      ),
    ).resolves.toEqual({ accepted: false, reason: 'ACTOR_MISMATCH' });
    expect(consumeVerifiedOrigin).not.toHaveBeenCalled();
  });

  it('rejects an exhausted verified-origin budget before dispatch', async () => {
    consumeVerifiedOrigin.mockReturnValue(false);
    const activity = {
      id: 'https://remote.test/activities/rate-limited',
      type: 'Update',
      actor: sender.canonicalUri,
      object: { id: 'https://remote.test/notes/1', type: 'Note', content: 'blocked' },
    };

    await expect(inbox.handle(buildContext(activity, signer))).resolves.toEqual({
      accepted: false,
      reason: 'RATE_LIMITED',
    });
    expect(inboxActivityRepo.save).not.toHaveBeenCalled();
    expect(metrics.snapshot().inbox_rejected_ratelimit).toBe(1);
  });

  it('Update(Note) by the post’s own author edits the body and stamps editedAt', async () => {
    const noteId = 'https://remote.test/notes/1';
    postRepo.findOne.mockResolvedValue({
      id: 'post-1',
      authorActorId: sender.id,
      deletedAt: null,
    });

    const activity = {
      id: 'https://remote.test/activities/update-1',
      type: 'Update',
      actor: sender.canonicalUri,
      object: { id: noteId, type: 'Note', content: 'edited body' },
    };

    const result = await inbox.handle(buildContext(activity, signer));

    expect(result).toEqual({ accepted: true, duplicate: false });
    expect(postRepo.update).toHaveBeenCalledWith(
      { id: 'post-1' },
      { body: 'edited body', editedAt: expect.any(Date) as Date },
    );
    expect(metrics.snapshot()['inbox_handled{domain=remote.test,type=Update}']).toBe(1);
  });

  it('ignores Update(Note) from an actor who is not the post’s author', async () => {
    const noteId = 'https://remote.test/notes/2';
    postRepo.findOne.mockResolvedValue({
      id: 'post-2',
      authorActorId: 'someone-else',
      deletedAt: null,
    });

    const activity = {
      id: 'https://remote.test/activities/update-2',
      type: 'Update',
      actor: sender.canonicalUri,
      object: { id: noteId, type: 'Note', content: 'hostile edit' },
    };

    const result = await inbox.handle(buildContext(activity, signer));

    expect(result).toEqual({ accepted: true, duplicate: false });
    expect(postRepo.update).not.toHaveBeenCalled();
  });

  it('Update(Person) for the sender’s own actor refreshes the cached remote actor', async () => {
    const activity = {
      id: 'https://remote.test/activities/update-3',
      type: 'Update',
      actor: sender.canonicalUri,
      object: { id: sender.canonicalUri, type: 'Person', name: 'New Name' },
    };

    const result = await inbox.handle(buildContext(activity, signer));

    expect(result).toEqual({ accepted: true, duplicate: false });
    const refreshCall = (remoteActors.getOrFetchByUri as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        call[2] !== undefined && (call[2] as { forceRefetch?: boolean }).forceRefetch === true,
    );
    expect(refreshCall).toBeDefined();
    expect(refreshCall?.[1]).toBe(sender.canonicalUri);
  });

  it('never refreshes a cached actor other than the activity’s own signed sender', async () => {
    const activity = {
      id: 'https://remote.test/activities/update-4',
      type: 'Update',
      actor: sender.canonicalUri,
      object: { id: 'https://remote.test/users/someone-else', type: 'Person', name: 'Spoofed' },
    };

    const result = await inbox.handle(buildContext(activity, signer));

    expect(result).toEqual({ accepted: true, duplicate: false });
    const refreshCall = (remoteActors.getOrFetchByUri as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        call[2] !== undefined && (call[2] as { forceRefetch?: boolean }).forceRefetch === true,
    );
    expect(refreshCall).toBeUndefined();
  });
});

/** P18-007 (§180.2, ADR 0028 §3): inbound quote ingest — first-recognizable property wins,
 * §109-gated resolution through `RemoteObjectService`, and a violating/unverifiable quote
 * degrades to a plain post, never an endorsed one. Same fake-`EntityManager` pattern as the
 * A-035 suite above; the only faked collaborator with behavior is `fetchObject`. */
describe('InboxService — inbound quotes + tags (P18-007)', () => {
  const ORIGIN = 'http://origin.test';
  const QUOTED_URI = 'https://remote2.test/notes/9';
  const BOB_URI = 'https://remote2.test/users/bob';
  const LOCAL_QUOTED_ID = '11111111-1111-4111-8111-111111111111';

  const QUOTED_NOTE_DOC = {
    id: QUOTED_URI,
    type: 'Note',
    content: 'quoted body',
    attributedTo: BOB_URI,
  };

  interface QuoteKit {
    inbox: InboxService;
    signer: { keyId: string; privateKeyPem: string };
    sender: Actor;
    fetchObject: ReturnType<typeof vi.fn>;
    postSaves: Record<string, unknown>[];
    quoteAuthSaves: Record<string, unknown>[];
    tagSaves: Record<string, unknown>[];
    postTagSaves: Record<string, unknown>[];
  }

  function quotedRow(overrides: Partial<Post> = {}): Post {
    return {
      id: 'quoted-1',
      authorActorId: 'bob-1',
      body: 'quoted body',
      postType: 'NOTE',
      visibility: 'PUBLIC',
      inReplyToId: null,
      rootPostId: 'quoted-1',
      canonicalUri: QUOTED_URI,
      originServer: 'remote2.test',
      isLocal: false,
      clientRequestId: null,
      deletedAt: null,
      quotePolicy: 'ANYONE',
      createdAt: new Date(),
      ...overrides,
    } as Post;
  }

  /** Rows matched generically by `where` equality, mirroring TypeORM `findOne`. */
  function matchingRepo(rows: Record<string, unknown>[]): { findOne: ReturnType<typeof vi.fn> } {
    return {
      findOne: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ??
            null,
        ),
      ),
    };
  }

  function kit(options: {
    quotedPost?: Post;
    follows?: Record<string, unknown>[];
    blocks?: Record<string, unknown>[];
    blockedDomains?: string[];
    fetchReturns?: Record<string, unknown> | null;
    fetchThrows?: Error;
  }): QuoteKit {
    const { publicKeyPem, privateKeyPem } = keyPair();
    const sender = fakeSender(publicKeyPem);
    const signer = { keyId: `${sender.canonicalUri}#main-key`, privateKeyPem };
    const bob = fakeSender('', {
      id: 'bob-1',
      handle: 'bob',
      handleNormalized: 'bob@remote2.test',
      homeServer: 'remote2.test',
      canonicalUri: BOB_URI,
      inboxUri: `${BOB_URI}/inbox`,
    });

    const postRows = new Map<string, Post>(
      options.quotedPost === undefined ? [] : [[options.quotedPost.id, options.quotedPost]],
    );
    const postSaves: Record<string, unknown>[] = [];
    const postRepo = {
      findOne: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        for (const row of postRows.values()) {
          const record = row as unknown as Record<string, unknown>;
          if (Object.entries(where).every(([key, value]) => record[key] === value)) {
            return Promise.resolve(row);
          }
        }
        return Promise.resolve(null);
      }),
      create: vi.fn((value: unknown) => value),
      save: vi.fn((row: Post) => {
        postRows.set(row.id, row);
        postSaves.push(row as unknown as Record<string, unknown>);
        return Promise.resolve(row);
      }),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    const inboxActivityRepo = {
      create: vi.fn((value: unknown) => value),
      save: vi.fn().mockResolvedValue(undefined),
    };

    const quoteAuthSaves: Record<string, unknown>[] = [];
    const quoteAuthRepo = {
      create: vi.fn((value: unknown) => value),
      save: vi.fn((row: Record<string, unknown>) => {
        quoteAuthSaves.push(row);
        return Promise.resolve(row);
      }),
    };
    const tagSaves: Record<string, unknown>[] = [];
    const tagRepo = {
      findOne: vi.fn(({ where }: { where: { name: string } }) =>
        Promise.resolve(tagSaves.find((row) => row.name === where.name) ?? null),
      ),
      create: vi.fn((value: unknown) => value),
      save: vi.fn((row: Record<string, unknown>) => {
        const created = { id: `tag-${String(row.name)}`, ...row };
        tagSaves.push(created);
        return Promise.resolve(created);
      }),
    };
    const postTagSaves: Record<string, unknown>[] = [];
    const postTagRepo = {
      create: vi.fn((value: unknown) => value),
      save: vi.fn((row: Record<string, unknown>) => {
        postTagSaves.push(row);
        return Promise.resolve(row);
      }),
    };

    const actorRepo = matchingRepo([
      sender as unknown as Record<string, unknown>,
      bob as unknown as Record<string, unknown>,
    ]);
    const followRepo = matchingRepo(options.follows ?? []);
    const blockRepo = matchingRepo(options.blocks ?? []);
    const muteRepo = matchingRepo([]);

    const fetchObject = vi.fn();
    if (options.fetchThrows !== undefined) {
      fetchObject.mockRejectedValue(options.fetchThrows);
    } else {
      fetchObject.mockResolvedValue(
        options.fetchReturns !== undefined ? options.fetchReturns : QUOTED_NOTE_DOC,
      );
    }

    const remoteActors = {
      resolveByAcct: vi.fn(),
      getOrFetchByUri: vi.fn((_manager: unknown, uri: string) =>
        Promise.resolve(uri === BOB_URI ? bob : sender),
      ),
    } as unknown as RemoteActorService;
    const blocked = new Set(options.blockedDomains ?? []);
    const domainBlocks = {
      isBlocked: (_manager: unknown, domain: string) => Promise.resolve(blocked.has(domain)),
    } as unknown as DomainBlockService;

    const manager = fakeManager(
      postRepo,
      inboxActivityRepo,
      new Map<unknown, unknown>([
        [Actor, actorRepo],
        [Follow, followRepo],
        [Block, blockRepo],
        [Mute, muteRepo],
        [QuoteAuthorization, quoteAuthRepo],
        [Tag, tagRepo],
        [PostTag, postTagRepo],
      ]),
    );
    const dataSource = {
      transaction: (fn: (m: ReturnType<typeof fakeManager>) => unknown) => fn(manager),
    } as unknown as DataSource;

    const inbox = new InboxService(
      dataSource,
      { publicOrigin: ORIGIN } as AppConfigService,
      remoteActors,
      { fetchObject } as unknown as RemoteObjectService,
      domainBlocks,
      { enqueue: vi.fn() } as unknown as DeliveryService,
      { notifyFollow: vi.fn(), notifyLike: vi.fn() } as unknown as NotificationsService,
      { getOrCreateKeyPair: vi.fn() } as unknown as KeyService,
      new FederationMetricsService({ federationEnabled: false } as AppConfigService),
      {
        consumeTransportPeer: vi.fn().mockReturnValue(true),
        consumeVerifiedOrigin: vi.fn().mockReturnValue(true),
      } as unknown as PeerRateLimiterService,
      {} as unknown as TagExtractionService,
    );
    return {
      inbox,
      signer,
      sender,
      fetchObject,
      postSaves,
      quoteAuthSaves,
      tagSaves,
      postTagSaves,
    };
  }

  let seq = 0;
  function createNote(noteProps: Record<string, unknown> = {}): Record<string, unknown> {
    seq += 1;
    return {
      id: `https://remote.test/activities/quote-${seq}`,
      type: 'Create',
      actor: 'https://remote.test/users/alice',
      object: {
        id: `https://remote.test/notes/quote-${seq}`,
        type: 'Note',
        content: 'quoting',
        ...noteProps,
      },
    };
  }

  /** The quoter post is always the last post save (any fetched quoted post is ingested first). */
  function quoterPost(kit: QuoteKit): Record<string, unknown> {
    const saved = kit.postSaves.at(-1);
    expect(saved).toBeDefined();
    return saved as Record<string, unknown>;
  }

  it('records an endorsed quote for each of the four inbound quote property spellings', async () => {
    const variants: Record<string, unknown>[] = [
      { quote: QUOTED_URI },
      { quoteUri: QUOTED_URI },
      { quoteUrl: QUOTED_URI },
      { _misskey_quote: QUOTED_URI },
    ];
    for (const variant of variants) {
      const testKit = kit({});
      await expect(
        testKit.inbox.handle(buildContext(createNote(variant), testKit.signer)),
      ).resolves.toEqual({ accepted: true, duplicate: false });

      expect(testKit.fetchObject).toHaveBeenCalledWith(QUOTED_URI);
      const quotedIngest = testKit.postSaves[0] as Record<string, unknown>;
      expect(quotedIngest.canonicalUri).toBe(QUOTED_URI);
      expect(quoterPost(testKit).quotedPostId).toBe(quotedIngest.id);
      expect(testKit.quoteAuthSaves).toHaveLength(1);
      expect(testKit.quoteAuthSaves[0]).toMatchObject({
        quotedPostId: quotedIngest.id,
        quoterActorId: 'sender-1',
        claimedPolicy: 'ANYONE',
        state: 'VERIFIED',
        verifiedAt: expect.any(Date) as Date,
      });
      expect(testKit.quoteAuthSaves[0]?.quotingPostId).toBe(quoterPost(testKit).id);
    }
  });

  it('recognizes both _misskey_quote namespace IRI spellings (with and without trailing slash)', async () => {
    for (const key of [
      'https://misskey-hub.net/ns#_misskey_quote',
      'https://misskey-hub.net/ns/#_misskey_quote',
    ]) {
      const testKit = kit({});
      await testKit.inbox.handle(buildContext(createNote({ [key]: QUOTED_URI }), testKit.signer));
      expect(testKit.fetchObject).toHaveBeenCalledWith(QUOTED_URI);
      expect(quoterPost(testKit).quotedPostId).toBeDefined();
    }
  });

  it('first recognizable property wins when several quote properties are present', async () => {
    const testKit = kit({});
    await testKit.inbox.handle(
      buildContext(
        createNote({
          quote: 'https://remote2.test/notes/winner',
          quoteUrl: 'https://remote2.test/notes/loser',
          _misskey_quote: 'https://remote2.test/notes/also-loser',
        }),
        testKit.signer,
      ),
    );
    expect(testKit.fetchObject).toHaveBeenCalledTimes(1);
    expect(testKit.fetchObject).toHaveBeenCalledWith('https://remote2.test/notes/winner');
  });

  it('falls through to the next property when a higher-precedence one is unrecognizable', async () => {
    const testKit = kit({});
    await testKit.inbox.handle(
      buildContext(createNote({ quote: 42, quoteUrl: QUOTED_URI }), testKit.signer),
    );
    expect(testKit.fetchObject).toHaveBeenCalledWith(QUOTED_URI);
    expect(quoterPost(testKit).quotedPostId).toBeDefined();
  });

  it('ingests a plain post (no linkage, no row) when the quoted object is gone (fetch → null)', async () => {
    const testKit = kit({ fetchReturns: null });
    await expect(
      testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer)),
    ).resolves.toEqual({ accepted: true, duplicate: false });
    expect(quoterPost(testKit).quotedPostId).toBeNull();
    expect(testKit.quoteAuthSaves).toHaveLength(0);
  });

  it('ingests a plain post when the quote fetch fails outright (never rejects the post)', async () => {
    const testKit = kit({ fetchThrows: new RemoteObjectFetchError('Fetch failed: timeout') });
    await expect(
      testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer)),
    ).resolves.toEqual({ accepted: true, duplicate: false });
    expect(quoterPost(testKit).quotedPostId).toBeNull();
    expect(testKit.quoteAuthSaves).toHaveLength(0);
  });

  it('ingests a plain post when the fetched object is not a valid Note', async () => {
    const testKit = kit({
      fetchReturns: { id: QUOTED_URI, type: 'Page', name: 'not a note' },
    });
    await testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer));
    expect(quoterPost(testKit).quotedPostId).toBeNull();
    expect(testKit.quoteAuthSaves).toHaveLength(0);
  });

  it('ingests a plain post for a NOBODY-policy local quoted post (§180.2 NEVER)', async () => {
    const testKit = kit({
      quotedPost: quotedRow({
        id: LOCAL_QUOTED_ID,
        isLocal: true,
        canonicalUri: null,
        originServer: null,
        quotePolicy: 'NOBODY',
      }),
    });
    await testKit.inbox.handle(
      buildContext(createNote({ quote: `${ORIGIN}/posts/${LOCAL_QUOTED_ID}` }), testKit.signer),
    );
    expect(testKit.fetchObject).not.toHaveBeenCalled();
    expect(testKit.postSaves).toHaveLength(1);
    expect(quoterPost(testKit).quotedPostId).toBeNull();
    expect(testKit.quoteAuthSaves).toHaveLength(0);
  });

  it('ingests a plain post when the remote note declares a self-only canQuote (NOBODY)', async () => {
    const testKit = kit({
      fetchReturns: {
        ...QUOTED_NOTE_DOC,
        interactionPolicy: { canQuote: BOB_URI },
      },
    });
    await testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer));
    // The quoted note itself is still ingested (a legitimate public post, exactly like
    // `handleAnnounce`'s fetch-then-check order) — it is the *quote linkage* that NOBODY
    // forbids (§180.2).
    expect(testKit.postSaves).toHaveLength(2);
    expect(testKit.postSaves[0]).toMatchObject({ quotePolicy: 'NOBODY' });
    expect(quoterPost(testKit).quotedPostId).toBeNull();
    expect(testKit.quoteAuthSaves).toHaveLength(0);
  });

  it('ingests a plain post when the remote policy is declared but unrecognizable', async () => {
    const testKit = kit({
      fetchReturns: { ...QUOTED_NOTE_DOC, interactionPolicy: { canQuote: { nested: true } } },
    });
    await testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer));
    expect(testKit.postSaves).toHaveLength(1);
    expect(quoterPost(testKit).quotedPostId).toBeNull();
  });

  it('records the quote when a FOLLOWERS policy has follow-graph evidence (granted-ASK)', async () => {
    const testKit = kit({
      quotedPost: quotedRow({
        id: LOCAL_QUOTED_ID,
        isLocal: true,
        canonicalUri: null,
        originServer: null,
        quotePolicy: 'FOLLOWERS',
      }),
      follows: [{ followerActorId: 'sender-1', followeeActorId: 'bob-1', status: 'FOLLOWING' }],
    });
    await testKit.inbox.handle(
      buildContext(createNote({ quote: `${ORIGIN}/posts/${LOCAL_QUOTED_ID}` }), testKit.signer),
    );
    expect(quoterPost(testKit).quotedPostId).toBe(LOCAL_QUOTED_ID);
    expect(testKit.quoteAuthSaves).toHaveLength(1);
    expect(testKit.quoteAuthSaves[0]).toMatchObject({
      quotedPostId: LOCAL_QUOTED_ID,
      claimedPolicy: 'FOLLOWERS',
      state: 'VERIFIED',
    });
  });

  it('ingests a plain post when a FOLLOWERS policy has no follow evidence', async () => {
    const testKit = kit({
      quotedPost: quotedRow({
        id: LOCAL_QUOTED_ID,
        isLocal: true,
        canonicalUri: null,
        originServer: null,
        quotePolicy: 'FOLLOWERS',
      }),
    });
    await testKit.inbox.handle(
      buildContext(createNote({ quote: `${ORIGIN}/posts/${LOCAL_QUOTED_ID}` }), testKit.signer),
    );
    expect(quoterPost(testKit).quotedPostId).toBeNull();
    expect(testKit.quoteAuthSaves).toHaveLength(0);
  });

  it('maps a remote followers-audience canQuote to the FOLLOWERS class and honors follow evidence', async () => {
    const testKit = kit({
      fetchReturns: {
        ...QUOTED_NOTE_DOC,
        interactionPolicy: { canQuote: `${BOB_URI}/followers` },
      },
      follows: [{ followerActorId: 'sender-1', followeeActorId: 'bob-1', status: 'FOLLOWING' }],
    });
    await testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer));
    const quotedIngest = testKit.postSaves[0] as Record<string, unknown>;
    expect(quotedIngest.quotePolicy).toBe('FOLLOWERS');
    expect(quoterPost(testKit).quotedPostId).toBe(quotedIngest.id);
    expect(testKit.quoteAuthSaves[0]).toMatchObject({ claimedPolicy: 'FOLLOWERS' });
  });

  it('links a self-quote without an authorization row (FEP-044f auto-approval)', async () => {
    const testKit = kit({
      quotedPost: quotedRow({ authorActorId: 'sender-1', quotePolicy: 'ANYONE' }),
    });
    await testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer));
    expect(quoterPost(testKit).quotedPostId).toBe('quoted-1');
    expect(testKit.quoteAuthSaves).toHaveLength(0);
  });

  it('ingests a plain post when the quoted author blocks the quoter (§193 re-check)', async () => {
    const testKit = kit({
      blocks: [{ blockerActorId: 'bob-1', blockedActorId: 'sender-1' }],
    });
    await testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer));
    // Mirror of handleAnnounce: the quoted note is fetched/ingested first, then the
    // author-level block/mute re-check rejects the quote linkage.
    expect(testKit.postSaves).toHaveLength(2);
    expect(quoterPost(testKit).quotedPostId).toBeNull();
    expect(testKit.quoteAuthSaves).toHaveLength(0);
  });

  it('ingests a plain post when the quoted author sits on a domain-blocked server', async () => {
    const testKit = kit({ blockedDomains: ['remote2.test'] });
    await testKit.inbox.handle(buildContext(createNote({ quote: QUOTED_URI }), testKit.signer));
    expect(testKit.postSaves).toHaveLength(1);
    expect(quoterPost(testKit).quotedPostId).toBeNull();
  });

  it('endorses a quote of a local ANYONE-policy post without any remote fetch', async () => {
    const testKit = kit({
      quotedPost: quotedRow({
        id: LOCAL_QUOTED_ID,
        isLocal: true,
        canonicalUri: null,
        originServer: null,
      }),
    });
    await testKit.inbox.handle(
      buildContext(createNote({ quote: `${ORIGIN}/posts/${LOCAL_QUOTED_ID}` }), testKit.signer),
    );
    expect(testKit.fetchObject).not.toHaveBeenCalled();
    expect(quoterPost(testKit).quotedPostId).toBe(LOCAL_QUOTED_ID);
    expect(testKit.quoteAuthSaves[0]).toMatchObject({
      quotedPostId: LOCAL_QUOTED_ID,
      claimedPolicy: 'ANYONE',
      state: 'VERIFIED',
    });
  });

  it('ingests legacy Hashtag tags from the note and skips malformed entries', async () => {
    const testKit = kit({});
    await testKit.inbox.handle(
      buildContext(
        createNote({
          tag: [
            { type: 'Hashtag', name: '#Cats' },
            { type: 'Mention', href: BOB_URI },
            { type: 'Hashtag', name: 42 },
            'not-even-an-object',
          ],
        }),
        testKit.signer,
      ),
    );
    expect(testKit.tagSaves).toEqual([{ id: 'tag-cats', name: 'cats', displayName: 'Cats' }]);
    expect(testKit.postTagSaves).toEqual([{ postId: quoterPost(testKit).id, tagId: 'tag-cats' }]);
  });

  it('a plain note without quote or tags writes no quote/tag rows (regression)', async () => {
    const testKit = kit({});
    await testKit.inbox.handle(buildContext(createNote(), testKit.signer));
    expect(testKit.fetchObject).not.toHaveBeenCalled();
    expect(quoterPost(testKit).quotedPostId).toBeNull();
    expect(testKit.quoteAuthSaves).toHaveLength(0);
    expect(testKit.postTagSaves).toHaveLength(0);
  });
});
