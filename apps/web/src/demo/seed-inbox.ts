import { createPatchesApi } from '@patches/client';
import { createConnectTransport } from '@patches/client/connect';
import type { Interceptor } from '@connectrpc/connect';

import { logger } from '../lib/log.js';
import { wipeVaultStorage } from '../e2ee/vault.js';
import {
  createWebE2eeManager,
  webE2ee,
  type WebE2ee,
  type WebE2eeStatus,
} from '../e2ee/web-e2ee.js';
import { DEMO_DM_SCRIPT } from './dm-script.js';
import {
  DEMO_API_BASE,
  loadSeedProgress,
  saveSeedProgress,
  type DemoSeedPlan,
  type DemoSeedProgress,
} from './demo-mode.js';

const log = logger('demo-seed');

function bearer(token: string): Interceptor {
  return (next) => (req) => {
    req.header.set('authorization', `Bearer ${token}`);
    return next(req);
  };
}

/** Resolves with the first status in `kinds`, or rejects after `timeoutMs`. */
function waitForStatus(
  manager: WebE2ee,
  kinds: ReadonlySet<WebE2eeStatus['kind']>,
  timeoutMs: number,
): Promise<WebE2eeStatus> {
  return new Promise((resolve, reject) => {
    const current = manager.getStatus();
    if (kinds.has(current.kind)) {
      resolve(current);
      return;
    }
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('timed out waiting for the messaging device to open'));
    }, timeoutMs);
    const unsubscribe = manager.subscribe(() => {
      const next = manager.getStatus();
      if (!kinds.has(next.kind)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(next);
    });
  });
}

/** What the loading screen shows; every value comes from a real event in `run`. */
export type SeedStep = 'keys' | 'friends' | 'ready';

export interface SeedProgressEvent {
  readonly step: SeedStep;
  /** Friends whose messages have all been sent. */
  readonly friendsDone: number;
  readonly friendsTotal: number;
}

/** A seeding failure with the step it happened in, so the screen can say what to retry. */
export class SeedError extends Error {
  readonly step: SeedStep;
  constructor(step: SeedStep, message: string) {
    super(message);
    this.name = 'SeedError';
    this.step = step;
  }
}

let inFlight: Promise<void> | undefined;

/**
 * Enrolls the visitor's browser as a messaging device, then has each fake friend (an in-memory
 * client signed in with the friend session `StartDemo` returned) enroll and send the scripted
 * messages to the visitor. Everything cryptographic is the real web runtime; nothing is faked
 * and the node never sees a key. The friends' vaults are wiped once they finish, so their keys
 * do not outlive this function.
 *
 * Idempotent per sandbox: progress (finished friends, the conversation each has opened and how
 * many messages it sent) is kept in `sessionStorage` after every step, so a hard reload, a
 * retry after a failure, or a second tab resumes where it stopped and never opens a second
 * conversation with the same friend.
 *
 * Single-flight: React may run the calling effect twice.
 */
export function seedDemoInbox(
  plan: DemoSeedPlan,
  visitorSessionActorId: string,
  onProgress: (event: SeedProgressEvent) => void = () => undefined,
): Promise<void> {
  inFlight ??= run(plan, visitorSessionActorId, onProgress).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

async function run(
  plan: DemoSeedPlan,
  visitorActorId: string,
  onProgress: (event: SeedProgressEvent) => void,
): Promise<void> {
  if (DEMO_API_BASE === undefined || visitorActorId !== plan.visitorActorId) return;

  const scripted = plan.friends.filter((friend) => (DEMO_DM_SCRIPT[friend.key]?.length ?? 0) > 0);
  let progress: DemoSeedProgress = loadSeedProgress();
  const update = (next: DemoSeedProgress): void => {
    progress = next;
    saveSeedProgress(next);
  };
  const emit = (step: SeedStep): void => {
    onProgress({
      step,
      friendsDone: scripted.filter((friend) => progress.done.includes(friend.key)).length,
      friendsTotal: scripted.length,
    });
  };

  emit('keys');
  try {
    if (!progress.visitorEnrolled) {
      const visitor = webE2ee();
      const opened = await waitForStatus(visitor, new Set(['not-enrolled', 'enrolled']), 20_000);
      if (opened.kind === 'not-enrolled') {
        const outcome = await visitor.enroll();
        if (outcome.status !== 'enrolled' && outcome.status !== 'already-enrolled') {
          throw new Error('the visitor device did not enroll');
        }
      }
      update({ ...progress, visitorEnrolled: true });
    }
  } catch (error) {
    log.error('enrolling the visitor device failed', { reason: errorName(error) });
    throw new SeedError('keys', 'Your encryption keys could not be set up.');
  }

  emit('friends');
  for (const friend of scripted) {
    if (progress.done.includes(friend.key)) continue;
    const script = DEMO_DM_SCRIPT[friend.key] ?? [];
    const friendApi = createPatchesApi({
      transport: createConnectTransport({
        baseUrl: DEMO_API_BASE,
        useBinaryFormat: false,
        interceptors: [bearer(friend.accessToken)],
      }),
      clientName: 'web',
      clientVersion: '0.1.0',
    });
    const manager = createWebE2eeManager({ api: friendApi });
    try {
      await manager.setActor({ id: friend.actorId });
      await waitForStatus(manager, new Set(['not-enrolled', 'enrolled']), 20_000);
      if (manager.getStatus().kind === 'not-enrolled') await manager.enroll();

      let opened = progress.conversations[friend.key];
      if (opened === undefined) {
        // A reload can land between the node reserving the conversation and us recording its id.
        // The friend is a fresh account whose only conversation is this one, so adopt it.
        const existing = await friendApi.messages.listConversations({ limit: 5 });
        const found = existing.conversations[0];
        if (found !== undefined) {
          opened = { id: found.id, sent: 0 };
        } else {
          const [first] = script;
          if (first === undefined) continue;
          const id = await manager.createConversation([plan.visitorActorId], first);
          opened = { id, sent: 1 };
        }
        update({ ...progress, conversations: { ...progress.conversations, [friend.key]: opened } });
      }
      for (let index = opened.sent; index < script.length; index += 1) {
        const body = script[index];
        if (body === undefined) continue;
        await manager.send(opened.id, body);
        opened = { id: opened.id, sent: index + 1 };
        update({ ...progress, conversations: { ...progress.conversations, [friend.key]: opened } });
      }
      update({ ...progress, done: [...progress.done, friend.key] });
      emit('friends');
    } catch (error) {
      // Coarse reason only (never a body or key). The screen offers a retry, which resumes here.
      log.error('seeding one friend failed', { key: friend.key, reason: errorName(error) });
      throw new SeedError('friends', 'Your friends could not send their messages.');
    } finally {
      // Wipe only a friend that finished or failed cleanly; a reload kills this code before
      // `finally`, which is what keeps the friend's keys available to resume with.
      await manager.setActor(null);
      if (progress.done.includes(friend.key)) {
        await wipeVaultStorage({ origin: location.origin, actorId: friend.actorId });
      }
    }
  }
  emit('ready');
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}
