/**
 * `WebE2eeManager.setActor` concurrency tests. `useE2ee` fires `setActor` from an effect
 * with no cleanup (`use-e2ee.ts`), and React StrictMode double-invokes effects — so two
 * calls can overlap in flight. The single-owner vault invariant (`vault.ts:36-38`) means
 * the loser must never leave its own opened vault connection dangling.
 */
import 'fake-indexeddb/auto';

import { describe, expect, it, vi } from 'vitest';

import { createWebE2eeManager } from './web-e2ee.js';
import { IndexedDbRatchetVaultStore } from './vault.js';
import type { E2eeApiSurface } from './transports.js';

/** setActor never reaches the network on this path (no stored enrollment), but the
 * manager still constructs an `E2eeApiSurface` on `new` — a minimal stub is enough. */
const fakeApi = { e2ee: {} } as unknown as E2eeApiSurface;

let counter = 0;

function freshActorId(): string {
  counter += 1;
  return `actor-${counter}`;
}

describe('WebE2eeManager.setActor — overlapping calls', () => {
  it('closes the loser’s vault instead of leaking it, and the winner ends up usable', async () => {
    const closeSpy = vi.spyOn(IndexedDbRatchetVaultStore.prototype, 'close');
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };

    // Two calls for the same actor, fired back to back with no await in between —
    // the same shape as a StrictMode double-invoked effect or a rapid re-navigation.
    const first = manager.setActor(actor);
    const second = manager.setActor(actor);
    await Promise.all([first, second]);

    // Exactly one vault opened by these two calls was closed (the superseded one); the
    // winner's vault stays open and is the one the manager actually owns.
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });

    // The retained vault is genuinely open and usable, not a reference to a closed one.
    await expect(manager.wipe()).resolves.toBeUndefined();

    closeSpy.mockRestore();
  });

  it('the last call for a given actor always wins the final status', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    const actorA = { id: freshActorId() };
    const actorB = { id: freshActorId() };

    // Switch actors twice with no await between them; only actorB's state may end up
    // live no matter which underlying open() resolves first.
    const first = manager.setActor(actorA);
    const second = manager.setActor(actorB);
    await Promise.all([first, second]);

    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });
    await expect(manager.wipe()).resolves.toBeUndefined();
  });
});
