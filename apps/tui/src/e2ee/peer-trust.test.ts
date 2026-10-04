import { generateSigningKeyPair } from '@patches/crypto';
import { describe, expect, it } from 'vitest';

import { generateEnrollment } from './enrollment.js';
import { acceptPeerIdentityReset, isUnverifiedReset } from './peer-trust.js';
import {
  loadPeerIdentityPin,
  savePeerIdentityPin,
  type PeerPinVaultAccess,
} from './ratchet-vault.js';

const nowMs = Date.now();

function mint(actorId: string, generation: number) {
  const keys = generateSigningKeyPair();
  const root = generateEnrollment({
    actorId,
    nowMs,
    root: { ...keys, createdAtMs: nowMs - 1000, generation },
  }).record.identity.ownRoster.root;
  return { rootBytes: root.rootBytes, selfSignature: root.selfSignature };
}

function memoryPins(): PeerPinVaultAccess {
  const records = new Map<string, Uint8Array>();
  return {
    getOpaqueRecord: (key) => Promise.resolve(records.get(key)),
    putOpaqueRecord: (key, value) => {
      records.set(key, value);
      return Promise.resolve();
    },
  };
}

async function pinned(root: ReturnType<typeof mint>): Promise<PeerPinVaultAccess> {
  const vault = memoryPins();
  await savePeerIdentityPin(vault, 'actor-peer', {
    ...root,
    rosterSequence: 4,
    rosterDigest: new Uint8Array(32).fill(7),
  });
  return vault;
}

describe('peer identity reset re-trust (P2-H2)', () => {
  it('only a validly self-signed, strictly newer root of the same actor is offered', async () => {
    const first = mint('actor-peer', 2);
    const vault = await pinned(first);
    const pin = await loadPeerIdentityPin(vault, 'actor-peer');
    if (pin === undefined) throw new Error('setup');

    expect(isUnverifiedReset(pin, mint('actor-peer', 3), nowMs)).toBe(true);
    expect(isUnverifiedReset(pin, first, nowMs)).toBe(false);
    expect(isUnverifiedReset(pin, mint('actor-peer', 2), nowMs)).toBe(false);
    expect(isUnverifiedReset(pin, mint('actor-peer', 1), nowMs)).toBe(false);
    expect(isUnverifiedReset(pin, mint('actor-other', 3), nowMs)).toBe(false);
    expect(
      isUnverifiedReset(
        pin,
        { ...mint('actor-peer', 3), selfSignature: new Uint8Array(64) },
        nowMs,
      ),
    ).toBe(false);
  });

  it('re-pins exactly the accepted root and restarts the roster pin', async () => {
    const vault = await pinned(mint('actor-peer', 1));
    const next = mint('actor-peer', 2);
    await acceptPeerIdentityReset({ vault, actorId: 'actor-peer', root: next, nowMs });
    const pin = await loadPeerIdentityPin(vault, 'actor-peer');
    expect(pin?.rootBytes).toEqual(next.rootBytes);
    expect(pin?.rosterSequence).toBe(0);
  });

  it('refuses a rollback, a forged signature and a missing pin', async () => {
    const vault = await pinned(mint('actor-peer', 3));
    await expect(
      acceptPeerIdentityReset({ vault, actorId: 'actor-peer', root: mint('actor-peer', 2), nowMs }),
    ).rejects.toThrow();
    await expect(
      acceptPeerIdentityReset({
        vault,
        actorId: 'actor-peer',
        root: { ...mint('actor-peer', 4), selfSignature: new Uint8Array(64) },
        nowMs,
      }),
    ).rejects.toThrow();
    await expect(
      acceptPeerIdentityReset({
        vault: memoryPins(),
        actorId: 'actor-peer',
        root: mint('actor-peer', 4),
        nowMs,
      }),
    ).rejects.toThrow('no pinned identity');
  });
});
