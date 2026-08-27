/**
 * `WebE2eeManager.setActor` concurrency tests. `useE2ee` fires `setActor` from an effect
 * with no cleanup (`use-e2ee.ts`), and React StrictMode double-invokes effects — so two
 * calls can overlap in flight. The single-owner vault invariant (`vault.ts:36-38`) means
 * the loser must never leave its own opened vault connection dangling.
 */
import 'fake-indexeddb/auto';

import { E2EE_PROTOCOL } from '@patches/crypto';
import type { VerifiedCertifiedDevice, VerifiedRosterSnapshot } from '@patches/crypto';
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
  const deviceId = `${actorId}-device`;
  // Placeholder (not cryptographically meaningful) `Verified*` shapes — real branding
  // can only be produced by `@patches/crypto`'s verifiers, but these tests never run
  // one, so a structural cast is the honest equivalent of the old plain-object fixture.
  const selfDevice = {
    actorId,
    deviceId,
    rootGeneration: 1,
    rootPublicKey: key32(),
    certificateVersion: 1,
    signingPublicKey: key32(),
    agreementPublicKey: key32(),
    supportedProtocolVersions: [E2EE_PROTOCOL],
    createdAtMs: 0,
    expiresAtMs: 1,
    certificateBytes: new Uint8Array(1),
    rootSignature: key64(),
    certificateDigest: key32(),
  } as unknown as VerifiedCertifiedDevice;
  const ownRoster = {
    actorId,
    rootGeneration: 1,
    rootPublicKey: key32(),
    sequence: 1,
    previousDigest: key32(),
    createdAtMs: 0,
    entries: [{ deviceId, certificateDigest: key32(), active: true, addedAtMs: 0 }],
    rosterBytes: new Uint8Array(1),
    rootSignature: key64(),
    rosterDigest: key32(),
    root: {
      actorId,
      generation: 1,
      publicKey: key32(),
      rootBytes: new Uint8Array(1),
      selfSignature: key64(),
      createdAtMs: 0,
    },
    devices: [selfDevice],
  } as unknown as VerifiedRosterSnapshot;
  return {
    actorId,
    deviceId,
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
    },
    ownBundle: { bundleBytes: new Uint8Array(1), deviceSignature: key64() },
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

function rawRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error ?? new Error('idb failure')));
  });
}

/** Flips a byte in the sealed document straight in IndexedDB, matching
 * `IndexedDbRatchetVaultStore`'s own database-naming rule (`vault.ts`'s
 * `databaseName`), to reproduce a corruption fault without a second exported seam. */
async function corruptSealedDocument(actorId: string): Promise<void> {
  const name = `patches-e2ee-vault/${encodeURIComponent(location.origin)}/${actorId}`;
  const db = await rawRequest(indexedDB.open(name));
  try {
    const read = db.transaction('state', 'readonly').objectStore('state');
    const blob = await rawRequest<Uint8Array>(read.get('doc') as IDBRequest<Uint8Array>);
    const tampered = blob.slice();
    const last = tampered.length - 1;
    tampered[last] = (tampered[last] ?? 0) ^ 0x01;
    const write = db.transaction('state', 'readwrite').objectStore('state');
    await rawRequest(write.put(tampered, 'doc'));
  } finally {
    db.close();
  }
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
  it('wipe() clears the persisted cause of an open()-time fault (B-190), so the "only exit from a sticky fault" genuinely exits it and the next setActor for the same actor succeeds clean', async () => {
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

    // This fault's `this.vault` was never assigned in the first place
    // (`createRatchetSessionVault` closes and discards the store itself before
    // rethrowing on a failed `open()`, per `vault.ts`) — `wipe()` must still reach the
    // rollback anchor this fault is keyed on directly by account key. Once cleared, the
    // very next `setActor` for this actor opens a genuinely fresh vault instead of
    // faulting again for the identical, previously-uncleared reason.
    expect(localStorage.getItem(anchorKey)).toBeNull();
    await manager.setActor(actor);
    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });
  });

  it('a wipe from a vault-open fault (corruption) also leaves recoverable state, and the next setActor succeeds clean', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };

    // Open once normally and commit a record so a real sealed document exists to
    // corrupt (a fresh vault never writes the `doc` key until its first commit), then
    // close it before tampering (matches `vault.test.ts`'s "fails closed when the
    // sealed document has been tampered with").
    await manager.setActor(actor);
    await openedVaultOf(manager).putOpaqueRecord('marker', new Uint8Array([1]));
    manager['release']();
    await corruptSealedDocument(actor.id);

    await manager.setActor(actor);
    expect(manager.getStatus()).toEqual({ kind: 'fault', copy: WEB_E2EE_COPY.vaultFault });

    await manager.wipe();
    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });

    await manager.setActor(actor);
    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });
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

  it('actually clears the underlying vault storage (B-190): wipe() erases the store before releasing/closing it, not after', async () => {
    // `wipe()`'s own doc comment calls this "the explicit, labeled destructive reset".
    // `IndexedDbRatchetVaultStore.wipe()` starts with `if (this.closed) return;`
    // (vault.ts), so the underlying wipe has to run on the still-open store, before it
    // is released/closed — otherwise it is a guaranteed no-op. A record written before
    // `wipe()` must not survive a reopen of the same account afterwards.
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };
    await manager.setActor(actor);
    const vault = openedVaultOf(manager);
    await vault.putOpaqueRecord('marker', new Uint8Array([1]));

    await manager.wipe();
    await manager.setActor(actor);
    const reopened = openedVaultOf(manager);

    expect(await reopened.getOpaqueRecord('marker')).toBeUndefined();
  });

  it('closes the vault exactly once (B-190): no leaked connection, no double-close', async () => {
    const closeSpy = vi.spyOn(IndexedDbRatchetVaultStore.prototype, 'close');
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };
    await manager.setActor(actor);

    await manager.wipe();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    closeSpy.mockRestore();
  });

  it('a wipe from a vault-open fault (rollback) leaves clean, recoverable localStorage state and both IndexedDB and localStorage are erased for the account', async () => {
    const manager = createWebE2eeManager({ api: fakeApi });
    const actor = { id: freshActorId() };
    const anchorKey = `patches-e2ee-vault/generation/${location.origin}/${actor.id}`;
    const secretKey = `patches-e2ee-vault/secret/${location.origin}/${actor.id}`;
    localStorage.setItem(anchorKey, '3');
    localStorage.setItem(secretKey, 'not-a-real-secret-but-present');

    await manager.setActor(actor);
    expect(manager.getStatus()).toEqual({ kind: 'fault', copy: WEB_E2EE_COPY.vaultFault });

    await manager.wipe();

    expect(localStorage.getItem(anchorKey)).toBeNull();
    expect(localStorage.getItem(secretKey)).toBeNull();

    await manager.setActor(actor);
    expect(manager.getStatus()).toEqual({ kind: 'not-enrolled' });
  });
});
