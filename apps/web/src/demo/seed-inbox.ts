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
import { DEMO_API_BASE, type DemoSeedPlan } from './demo-mode.js';

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

let inFlight: Promise<void> | undefined;

/**
 * Enrolls the visitor's browser as a messaging device, then has each fake friend (an in-memory
 * client signed in with the friend session `StartDemo` returned) enroll and send the scripted
 * messages to the visitor. Everything cryptographic is the real web runtime; nothing is faked
 * and the node never sees a key. The friends' vaults are wiped afterwards, so their keys do not
 * outlive this function.
 *
 * Single-flight: React may run the calling effect twice.
 */
export function seedDemoInbox(plan: DemoSeedPlan, visitorSessionActorId: string): Promise<void> {
  inFlight ??= run(plan, visitorSessionActorId).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

async function run(plan: DemoSeedPlan, visitorActorId: string): Promise<void> {
  if (DEMO_API_BASE === undefined || visitorActorId !== plan.visitorActorId) return;

  const visitor = webE2ee();
  const opened = await waitForStatus(visitor, new Set(['not-enrolled', 'enrolled']), 20_000);
  if (opened.kind === 'not-enrolled') {
    const outcome = await visitor.enroll();
    if (outcome.status !== 'enrolled' && outcome.status !== 'already-enrolled') {
      throw new Error('the visitor device did not enroll');
    }
  }

  for (const friend of plan.friends) {
    const script = DEMO_DM_SCRIPT[friend.key];
    if (script === undefined || script.length === 0) continue;
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
      const [first, ...rest] = script;
      if (first === undefined) continue;
      const conversationId = await manager.createConversation([plan.visitorActorId], first);
      for (const body of rest) await manager.send(conversationId, body);
    } catch (error) {
      // One friend failing must not leave the visitor with nothing: log the coarse reason
      // (never a body or key) and move on to the next friend.
      log.error('seeding one friend failed', {
        key: friend.key,
        reason: error instanceof Error ? error.name : 'unknown',
      });
    } finally {
      await manager.setActor(null);
      await wipeVaultStorage({ origin: location.origin, actorId: friend.actorId });
    }
  }
}
