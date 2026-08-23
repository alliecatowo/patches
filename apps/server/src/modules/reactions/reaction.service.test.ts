import { Repost } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';

import type { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import type { FederationGateway } from '../federation/federation-gateway.js';
import type { NotificationsService } from '../notifications/notification.service.js';
import type { PostView } from '../posts/post.dto.js';
import type { PostService } from '../posts/post.service.js';
import type { DataSource, EntityManager } from 'typeorm';

import { ReactionsService } from './reaction.service.js';

/**
 * P18-003 wiring coverage — a fake `EntityManager`/`DataSource` (same pattern
 * `activitypub-federation-gateway.service.test.ts` uses), proving the repost paths call the
 * federation seam with the *saved repost row's id* (the deterministic Announce id is
 * reconstructed from it, ADR 0028 §4), in the right order relative to the local writes.
 */

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const POST_ID = '22222222-2222-4222-9222-222222222222';

function publicPostView(): PostView {
  return {
    id: POST_ID,
    deleted: false,
    visibility: 'PUBLIC',
    author: { id: 'author-1' },
  } as unknown as PostView;
}

/** Fake repositories + the manager handed to `dataSource.transaction`'s callback. `save`
 * simulates Postgres assigning the surrogate uuid. */
function fakeManager(options: { existing?: Repost | null }) {
  const findOne = vi.fn().mockResolvedValue(options.existing ?? null);
  const create = vi.fn().mockImplementation((row: Partial<Repost>) => row);
  const save = vi.fn().mockImplementation((row: Partial<Repost>) =>
    Promise.resolve({
      ...row,
      id: 'repost-new',
    }),
  );
  const del = vi.fn().mockResolvedValue({ affected: options.existing === undefined ? 0 : 1 });
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity !== Repost) throw new Error(`unexpected entity: ${String(entity)}`);
      return { findOne, create, save, delete: del };
    },
  };
  return { manager: manager as unknown as EntityManager, findOne, save, delete: del };
}

/** Builds the service against fakes and returns standalone mock references — asserting via
 * `federation.announceRemotePost` directly trips `@typescript-eslint/unbound-method` (same
 * reason `activitypub-federation-gateway.service.test.ts` keeps an `enqueue` reference). */
function buildService(manager: EntityManager) {
  const dataSource = {
    transaction: <T>(run: (m: EntityManager) => Promise<T>) => run(manager),
    getRepository: () => {
      throw new Error('service must do repost writes inside a transaction');
    },
  } as unknown as DataSource;
  const getPost = vi.fn().mockResolvedValue(publicPostView());
  const notifyRepost = vi.fn().mockResolvedValue(undefined);
  const increment = vi.fn().mockResolvedValue(1);
  const announceRemotePost = vi.fn().mockResolvedValue(undefined);
  const unannounceRemotePost = vi.fn().mockResolvedValue(undefined);
  const service = new ReactionsService(
    dataSource,
    { getPost } as unknown as PostService,
    { notifyRepost } as unknown as NotificationsService,
    { increment } as unknown as DbRateLimitStore,
    {
      announceRemotePost,
      unannounceRemotePost,
    } as unknown as FederationGateway,
  );
  return { service, announceRemotePost, unannounceRemotePost };
}

describe('ReactionsService repost federation wiring (P18-003)', () => {
  it('repostPost announces through the gateway with the saved repost row id', async () => {
    const { manager } = fakeManager({});
    const { service, announceRemotePost, unannounceRemotePost } = buildService(manager);

    await service.repostPost(ACTOR_ID, POST_ID);

    expect(announceRemotePost).toHaveBeenCalledTimes(1);
    expect(announceRemotePost).toHaveBeenCalledWith(manager, 'repost-new');
    expect(unannounceRemotePost).not.toHaveBeenCalled();
  });

  it('repostPost does not announce when the repost already existed', async () => {
    const existing = { id: 'repost-old', actorId: ACTOR_ID, postId: POST_ID } as Repost;
    const { manager } = fakeManager({ existing });
    const { service, announceRemotePost } = buildService(manager);

    await service.repostPost(ACTOR_ID, POST_ID);

    expect(announceRemotePost).not.toHaveBeenCalled();
  });

  it('unrepostPost unannounces with the row id before deleting, in one transaction', async () => {
    const existing = { id: 'repost-old', actorId: ACTOR_ID, postId: POST_ID } as Repost;
    const { manager, findOne, delete: del } = fakeManager({ existing });
    const { service, unannounceRemotePost } = buildService(manager);

    await service.unrepostPost(ACTOR_ID, POST_ID);

    expect(findOne).toHaveBeenCalledWith({ where: { actorId: ACTOR_ID, postId: POST_ID } });
    expect(del).toHaveBeenCalledWith({ actorId: ACTOR_ID, postId: POST_ID });
    // ADR 0028 §4: the Undo is resolved from the row *before* it is gone.
    expect(unannounceRemotePost).toHaveBeenCalledWith(manager, 'repost-old');
    const unannounceOrder = unannounceRemotePost.mock.invocationCallOrder[0] ?? -1;
    const deleteOrder = del.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    expect(unannounceOrder).toBeGreaterThan(-1);
    expect(unannounceOrder).toBeLessThan(deleteOrder);
  });

  it('unrepostPost is a no-op for the seam when there is no repost row', async () => {
    const { manager } = fakeManager({});
    const { service, unannounceRemotePost } = buildService(manager);

    await service.unrepostPost(ACTOR_ID, POST_ID);

    expect(unannounceRemotePost).not.toHaveBeenCalled();
  });
});
