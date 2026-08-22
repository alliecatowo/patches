import { generateKeyPairSync } from 'node:crypto';

import { InboxActivity, Post, type Actor } from '@patches/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import type { AppConfigService } from '../../../config/app-config.service.js';
import type { NotificationsService } from '../../notifications/notification.service.js';
import { FederationMetricsService } from '../federation-metrics.service.js';
import type { PeerRateLimiterService } from '../security/peer-rate-limiter.service.js';
import { computeDigestHeader } from '../signatures/digest.js';
import { signRequest } from '../signatures/http-signature.js';
import type { DeliveryService } from './delivery.service.js';
import type { DomainBlockService } from './domain-block.service.js';
import { InboxService, type InboxRequestContext } from './inbox.service.js';
import type { KeyService } from './key.service.js';
import type { RemoteActorService } from './remote-actor.service.js';

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

function fakeManager(postRepo: FakePostRepo, inboxActivityRepo: FakeInboxActivityRepo) {
  const getRepository = (entity: unknown): unknown => {
    if (entity === Post) return postRepo;
    if (entity === InboxActivity) return inboxActivityRepo;
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

    const manager = fakeManager(postRepo, inboxActivityRepo);
    const dataSource = {
      transaction: (fn: (m: ReturnType<typeof fakeManager>) => unknown) => fn(manager),
    } as unknown as DataSource;

    inbox = new InboxService(
      dataSource,
      config,
      remoteActors,
      domainBlocks,
      delivery,
      notifications,
      keys,
      metrics,
      rateLimiter,
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
