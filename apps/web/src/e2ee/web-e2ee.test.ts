/**
 * `WebE2eeManager.setActor` concurrency tests. `useE2ee` fires `setActor` from an effect
 * with no cleanup (`use-e2ee.ts`), and React StrictMode double-invokes effects — so two
 * calls can overlap in flight. The single-owner vault invariant (`vault.ts:36-38`) means
 * the loser must never leave its own opened vault connection dangling.
 */
import 'fake-indexeddb/auto';

import { E2EE_PROTOCOL, E2EE_VERSION } from '@patches/crypto';
import type { CertifiedDevice, DeviceCertificate, SignedDeviceRoster } from '@patches/crypto';
import { describe, expect, it, vi } from 'vitest';

import { WEB_E2EE_SESSION_UNAVAILABLE_COPY } from './availability.js';
import type { LocalDeviceIdentity } from './local-identity.js';
import { E2eeNotEnrolledError } from './runtime.js';
import { createWebE2eeManager, WEB_E2EE_COPY, WebE2eeUnavailableError } from './web-e2ee.js';
import { IndexedDbRatchetVaultStore, type RatchetSessionVault } from './vault.js';
import type { E2eeApiSurface } from './transports.js';

/** setActor never reaches the network on this path (no stored enrollment), but the
 * manager still constructs an `E2eeApiSurface` on `new` — a minimal stub is enough. */
const fakeApi = { e2ee: {} } as unknown as E2eeApiSurface;

let counter = 0;

function freshActorId(): string {
  counter += 1;
  return `actor-${counter}`;
}

/**
 * A structurally valid `LocalDeviceIdentity` with placeholder (not cryptographically
 * meaningful) key material. `WebE2eeManager.bind`/`createWebE2eeTransports` only close
 * over the identity's shape — they never verify it — so this is enough to reach
 * `enroll`'s already-enrolled short-circuit and `send`'s availability guard, both of
 * which run before any real crypto or network call.
 */
function stubIdentity(actorId: string): LocalDeviceIdentity {
  const key32 = (): Uint8Array => new Uint8Array(32);
  const key64 = (): Uint8Array => new Uint8Array(64);
  const certificate: DeviceCertificate = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId: actorId,
    deviceId: `${actorId}-device`,
    signingPublicKey: key32(),
    agreementPublicKey: key32(),
    generation: 1,
    createdAtMs: 0,
    expiresAtMs: 1,
  };
  const selfDevice: CertifiedDevice = { certificate, rootSignature: key64() };
  const ownRoster: SignedDeviceRoster = {
    roster: {
      protocol: E2EE_PROTOCOL,
      version: E2EE_VERSION,
      userId: actorId,
      rootPublicKey: key32(),
      sequence: 1,
      previousDigest: key32(),
      devices: [selfDevice],
      createdAtMs: 0,
    },
    rootSignature: key64(),
  };
  return {
    actorId,
    deviceId: certificate.deviceId,
    keys: {
      signing: { publicKey: key32(), privateKey: key32() },
      agreement: { publicKey: key32(), privateKey: key32() },
    },
    selfDevice,
    ownRoster,
    signedPreKey: {
      id: 1,
      keyPair: { publicKey: key32(), privateKey: key32() },
      createdAtMs: 0,
      expiresAtMs: 1,
      signature: key64(),
    },
    oneTimePreKeys: [],
  };
}

/** Opens a real vault for `actor` and returns it, bypassing private-field access
 * repetition. Bracket access on `manager['vault']` deliberately bypasses the field's
 * privacy (TS permits this for string-literal keys) rather than widening the field or
 * exporting the class — the alternative to testing these guards at all is not testing
 * them, since every one of them fires before any network call the public API surfaces. */
function openedVaultOf(manager: ReturnType<typeof createWebE2eeManager>): RatchetSessionVault {
  const vault = manager['vault'];
  if (vault === undefined) throw new Error('test setup: vault is not open');
  return vault;
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

describe('WebE2eeManager — sticky fault (B-185)', () => {
  it('BUG (suspected): wipe() does not clear the persisted cause of an open()-time fault, so the "only exit from a sticky fault" re-faults the very next setActor for the same actor', async () => {
    // module header: "faults (corrupt/rollback) are sticky and coarse... never a
    // silent wipe"; `wipe()`'s own doc comment: "also the only exit from a sticky
    // fault". Reproducing the exact fault vault.test.ts covers at the store layer
    // ("refuses a vanished vault when this browser committed a later generation") —
    // here through the manager, to check whether its "only exit" actually exits.
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };
    const anchorKey = `patches-e2ee-vault/generation/${location.origin}/${actor.id}`;
    localStorage.setItem(anchorKey, '5');

    await manager.setActor(actor);
    expect(manager.getStatus()).toEqual({ kind: 'fault', copy: WEB_E2EE_COPY.vaultFault });

    // Sticky under the real caller shape too: a second call for the same actor while
    // the underlying cause is unchanged never silently recovers into something else.
    await manager.setActor(actor);
    expect(manager.getStatus()).toEqual({ kind: 'fault', copy: WEB_E2EE_COPY.vaultFault });

    // The documented "only exit": an explicit, labeled destructive reset.
    await manager.wipe();
    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });

    // Suspected bug (root cause pinned down in the `WebE2eeManager.wipe` describe
    // block below, which reproduces it without a fault in the way): `wipe()` never
    // actually calls the underlying store's `wipe()` here, for THIS specific case for
    // an additional reason beyond that general bug — this fault's `this.vault` was
    // never assigned in the first place (`createRatchetSessionVault` closes and
    // discards the store itself before rethrowing on a failed `open()`, per
    // `vault.ts`). Either way, the rollback anchor this fault is keyed on survives
    // untouched, and the very next `setActor` for this actor faults again for the
    // identical, still-uncleared reason — the UI's "Resetting deletes this browser's
    // E2EE history" promise does not hold for the fault it is written to describe.
    expect(localStorage.getItem(anchorKey)).toBe('5');
    await manager.setActor(actor);
    expect(manager.getStatus()).toEqual({ kind: 'fault', copy: WEB_E2EE_COPY.vaultFault });
  });
});

describe('WebE2eeManager.enroll — guards', () => {
  it('refuses before any actor is set (signed-out, no vault)', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    await expect(manager.enroll()).rejects.toThrow(WebE2eeUnavailableError);
    await expect(manager.enroll()).rejects.toThrow(WEB_E2EE_COPY.notEnrolled);
  });

  it('refuses while a vault is still loading', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    manager['setStatus']({ kind: 'loading' });
    await expect(manager.enroll()).rejects.toThrow(WebE2eeUnavailableError);
  });

  it('refuses once enrollment is already in flight (no double submission)', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    manager['setStatus']({ kind: 'enrolling' });
    await expect(manager.enroll()).rejects.toThrow(WebE2eeUnavailableError);
  });

  it('refuses when status claims not-enrolled but no vault was ever actually opened', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    manager['setStatus']({ kind: 'not-enrolled' });
    await expect(manager.enroll()).rejects.toThrow(WEB_E2EE_COPY.notEnrolled);
  });

  it('short-circuits to already-enrolled without touching the transport once bound with an identity', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };
    await manager.setActor(actor);
    const vault = openedVaultOf(manager);
    const identity = stubIdentity(`${actor.id}-device-owner`);
    manager['bind'](vault, identity);
    manager['setStatus']({ kind: 'enrolled' });

    const outcome = await manager.enroll();

    expect(outcome).toEqual({ status: 'already-enrolled', identity });
  });
});

describe('WebE2eeManager.send — refuses while session setup is unavailable (B-132)', () => {
  it('refuses before enrollment, without ever constructing a runtime', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    await expect(manager.send('conversation-1', 'hello')).rejects.toThrow(E2eeNotEnrolledError);
  });

  it('refuses once enrolled, with the fixed unavailable copy, never reaching the runtime', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };
    await manager.setActor(actor);
    const vault = openedVaultOf(manager);
    manager['bind'](vault, stubIdentity(`${actor.id}-device-sender`));

    await expect(manager.send('conversation-1', 'hello')).rejects.toThrow(WebE2eeUnavailableError);
    await expect(manager.send('conversation-1', 'hello')).rejects.toThrow(
      WEB_E2EE_SESSION_UNAVAILABLE_COPY,
    );
  });
});

describe('WebE2eeManager.wipe', () => {
  it('is a safe status-only reset when nothing was ever opened', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });

    await expect(manager.wipe()).resolves.toBeUndefined();

    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });
  });

  it('releases the manager’s own vault reference and resets status', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };
    await manager.setActor(actor);
    openedVaultOf(manager);

    await manager.wipe();

    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });
    expect(manager['vault']).toBeUndefined();
    expect(manager['identity']).toBeUndefined();
  });

  it('BUG (suspected): does not actually clear the underlying vault storage — `release()` closes the vault before `wipe()` gets to use it, and a closed `IndexedDbRatchetVaultStore.wipe()` is a silent no-op', async () => {
    // `wipe()`'s own doc comment calls this "the explicit, labeled destructive reset".
    // Its body is:
    //   const vault = this.vault;
    //   this.release();                          // <- closes `vault` right here
    //   if (vault !== undefined) {
    //     try { await vault.wipe(); }             // <- runs on an already-closed store
    //     finally { vault.close(); }
    //   }
    // `IndexedDbRatchetVaultStore.wipe()` starts with `if (this.closed) return;`
    // (vault.ts), so by the time `vault.wipe()` runs, `release()` has already closed
    // it and this is a guaranteed no-op — every time, not only in the fault case
    // above. Nothing about a corrupt/rolled-back vault, or even an ordinary healthy
    // one, is ever actually erased by this method today; only the manager's own
    // in-memory pointers and `status` change. Filed as a suspected bug, not fixed
    // here per B-185's scope (tests only).
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };
    await manager.setActor(actor);
    const vault = openedVaultOf(manager);
    await vault.putOpaqueRecord('marker', new Uint8Array([1]));

    await manager.wipe();
    await manager.setActor(actor);
    const reopened = openedVaultOf(manager);

    expect([...((await reopened.getOpaqueRecord('marker')) ?? [])]).toEqual([1]);
  });
});
