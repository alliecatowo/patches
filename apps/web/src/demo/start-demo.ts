import { createPatchesApi } from '@patches/client';
import { createConnectTransport } from '@patches/client/connect';
import { setActorSession } from '../api/session.js';
import { LocalStorageCredentialStore } from '../api/credentialStore.js';
import { DEMO_API_BASE, markDemoActive, saveSeedPlan } from './demo-mode.js';

/** Thrown with copy that is safe to show as-is. */
export class DemoUnavailableError extends Error {
  /** True when the node refused because this connection started too many sandboxes. */
  readonly rateLimited: boolean;
  constructor(message: string, options: { readonly rateLimited?: boolean } = {}) {
    super(message);
    this.name = new.target.name;
    this.rateLimited = options.rateLimited ?? false;
  }
}

/**
 * Creates a sandbox on the demo node, stores its sessions, and reloads the page onto it.
 *
 * The reload is the point: which node the app talks to is fixed when `api/client.ts` loads, so
 * the new page load starts already pointed at the demo node, signed in as the visitor. The
 * seeded direct messages are sealed after the reload by `useDemoSeeding`, using the friend
 * sessions saved here.
 */
export async function startDemo(onAccountCreated?: () => void): Promise<never> {
  if (DEMO_API_BASE === undefined) {
    throw new DemoUnavailableError('The demo is not available in this build.');
  }
  const demoApi = createPatchesApi({
    transport: createConnectTransport({ baseUrl: DEMO_API_BASE, useBinaryFormat: false }),
    clientName: 'web',
    clientVersion: '0.1.0',
  });

  let response;
  try {
    response = await demoApi.onboarding.startDemo({}, { timeoutMs: 60_000 });
  } catch (error) {
    throw new DemoUnavailableError(demoFailureCopy(error), { rateLimited: errorCode(error) === 8 });
  }

  const visitor = response.session;
  const actor = visitor?.actor;
  const expiresAt = response.expiresAt;
  if (visitor === undefined || actor === undefined || expiresAt === undefined) {
    throw new DemoUnavailableError('The demo returned an unexpected response. Try again.');
  }

  await new LocalStorageCredentialStore(DEMO_API_BASE).save({
    accessToken: visitor.accessToken,
    refreshToken: visitor.refreshToken,
  });
  setActorSession(actor);
  saveSeedPlan({
    visitorActorId: actor.id,
    friends: response.friends.flatMap((friend) => {
      const session = friend.session;
      const friendActor = session?.actor;
      if (session === undefined || friendActor === undefined) return [];
      return [
        {
          key: friendActor.handle.split('_')[0] ?? friendActor.handle,
          actorId: friendActor.id,
          handle: friendActor.handle,
          displayName: friendActor.displayName,
          accessToken: session.accessToken,
        },
      ];
    }),
  });
  markDemoActive(Number(expiresAt.seconds) * 1000);
  // The account exists; the next step (keys) runs on the reloaded page.
  onAccountCreated?.();
  window.location.assign('/');
  // The assignment navigates away; never resolve so callers cannot act on a dying page.
  return new Promise<never>(() => undefined);
}

/** Fixed, content-free copy per failure kind. */
function demoFailureCopy(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const code = errorCode(error);
  // Connect codes: 8 resource_exhausted, 14 unavailable, 4 deadline_exceeded.
  if (code === 8) return 'Too many demos from your connection. Try again in a little while.';
  if (code === 14 || code === 4 || name === 'AbortError') {
    return 'The demo server is waking up. Give it a few seconds and try again.';
  }
  return 'The demo could not start. Try again in a moment.';
}

function errorCode(error: unknown): number | undefined {
  return (error as { code?: number } | null)?.code;
}
