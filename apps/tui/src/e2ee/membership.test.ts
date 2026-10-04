import { generateSigningKeyPair, sign } from '@patches/crypto';
import { canonicalGroupControlTranscript, type E2eeGroupChangeKind } from '@patches/domain';
import type { E2eeGroupControlEvent } from '../api/wire/types.js';
import { E2EE_GROUP_CHANGE_KIND as WireChange } from '../api/wire/enums.js';
import { describe, expect, it } from 'vitest';

import { sha256Digest } from './chain.js';
import {
  acceptNodeMembership,
  loadMembershipPin,
  MembershipMismatchError,
  verifyConversationMembership,
  type ServedMembership,
} from './membership.js';
import { fromDate } from '../api/wire/time.js';
import type { PeerPinVaultAccess } from './ratchet-vault.js';

const CONV = 'conv-1';
const ZERO = new Uint8Array(32);
const signer = generateSigningKeyPair();

function memoryVault(): PeerPinVaultAccess {
  const records = new Map<string, Uint8Array>();
  return {
    getOpaqueRecord: (key) => Promise.resolve(records.get(key)),
    putOpaqueRecord: (key, value) => {
      records.set(key, value);
      return Promise.resolve();
    },
  };
}

function event(
  epoch: bigint,
  change: E2eeGroupChangeKind,
  subject: string,
  previous: Uint8Array,
  by = 'alice',
): E2eeGroupControlEvent {
  const fields = {
    conversationId: CONV,
    epoch,
    change,
    subjectActorId: subject,
    signerActorId: by,
    signerDeviceId: 'device-a',
    previousDigest: previous,
  };
  const eventBytes = canonicalGroupControlTranscript(fields);
  return {
    conversationId: CONV,
    epoch,
    change: change === 'ADDED' ? WireChange.ADDED : WireChange.REMOVED,
    subjectActorId: subject,
    signerActorId: by,
    signerDeviceId: 'device-a',
    previousDigest: previous,
    digest: sha256Digest(eventBytes),
    eventBytes,
    deviceSignature: sign(signer.privateKey, eventBytes),
    createdAt: fromDate(new Date(0)),
  } as unknown as E2eeGroupControlEvent;
}

function served(epoch: bigint, members: string[], tip: Uint8Array = ZERO): ServedMembership {
  return { epoch, memberActorIds: members, tipDigest: tip };
}

const noEvents = () => Promise.resolve([] as E2eeGroupControlEvent[]);
const keyOf = (actorId: string, deviceId: string) =>
  Promise.resolve(actorId === 'alice' && deviceId === 'device-a' ? signer.publicKey : undefined);

function check(vault: PeerPinVaultAccess, s: ServedMembership, events = noEvents) {
  return verifyConversationMembership({
    vault,
    conversationId: CONV,
    served: s,
    listEvents: events,
    signerKey: keyOf,
  });
}

describe('group membership from the signed transcript (P2-H3)', () => {
  it('pins the first membership it sees and accepts it unchanged', async () => {
    const vault = memoryVault();
    await check(vault, served(1n, ['alice', 'bob']));
    await check(vault, served(1n, ['bob', 'alice']));
    expect((await loadMembershipPin(vault, CONV))?.members).toEqual(['alice', 'bob']);
  });

  it('refuses a member the node inserted with no signed event behind it', async () => {
    const vault = memoryVault();
    await check(vault, served(1n, ['alice', 'bob']));
    await expect(check(vault, served(1n, ['alice', 'bob', 'mallory']))).rejects.toBeInstanceOf(
      MembershipMismatchError,
    );
    // Same epoch, same members, forged tip digest.
    await expect(
      check(vault, served(1n, ['alice', 'bob'], new Uint8Array(32).fill(1))),
    ).rejects.toBeInstanceOf(MembershipMismatchError);
  });

  it('follows a signed addition and then refuses to go back', async () => {
    const vault = memoryVault();
    await check(vault, served(1n, ['alice', 'bob']));
    const add = event(2n, 'ADDED', 'carol', ZERO);
    await check(vault, served(2n, ['alice', 'bob', 'carol'], add.digest), () =>
      Promise.resolve([add]),
    );
    expect((await loadMembershipPin(vault, CONV))?.epoch).toBe(2n);
    await expect(check(vault, served(1n, ['alice', 'bob']))).rejects.toBeInstanceOf(
      MembershipMismatchError,
    );
  });

  it('refuses when the node adds someone the signed events do not', async () => {
    const vault = memoryVault();
    await check(vault, served(1n, ['alice', 'bob']));
    const add = event(2n, 'ADDED', 'carol', ZERO);
    await expect(
      check(vault, served(2n, ['alice', 'bob', 'carol', 'mallory'], add.digest), () =>
        Promise.resolve([add]),
      ),
    ).rejects.toBeInstanceOf(MembershipMismatchError);
  });

  it('refuses a higher epoch with no events, a gap, a forged field and an unknown signer', async () => {
    const vault = memoryVault();
    await check(vault, served(1n, ['alice', 'bob']));
    const add = event(2n, 'ADDED', 'carol', ZERO);
    const members = ['alice', 'bob', 'carol'];
    await expect(check(vault, served(2n, members, add.digest))).rejects.toBeInstanceOf(
      MembershipMismatchError,
    );
    const gap = event(3n, 'ADDED', 'carol', add.digest);
    await expect(
      check(vault, served(3n, members, gap.digest), () => Promise.resolve([gap])),
    ).rejects.toBeInstanceOf(MembershipMismatchError);
    const forged = { ...add, subjectActorId: 'mallory' } as E2eeGroupControlEvent;
    await expect(
      check(vault, served(2n, ['alice', 'bob', 'mallory'], add.digest), () =>
        Promise.resolve([forged]),
      ),
    ).rejects.toBeInstanceOf(MembershipMismatchError);
    const unknown = event(2n, 'ADDED', 'carol', ZERO, 'eve');
    await expect(
      check(vault, served(2n, members, unknown.digest), () => Promise.resolve([unknown])),
    ).rejects.toBeInstanceOf(MembershipMismatchError);
    // None of the refusals moved the pin.
    expect((await loadMembershipPin(vault, CONV))?.epoch).toBe(1n);
  });

  it('lets the user explicitly accept the node list, and only then', async () => {
    const vault = memoryVault();
    await check(vault, served(1n, ['alice', 'bob']));
    const injected = served(1n, ['alice', 'bob', 'mallory']);
    await expect(check(vault, injected)).rejects.toBeInstanceOf(MembershipMismatchError);
    await acceptNodeMembership(vault, CONV, injected);
    await expect(check(vault, injected)).resolves.toBeUndefined();
  });

  it('does not report a failed fetch as an attack', async () => {
    const vault = memoryVault();
    await check(vault, served(1n, ['alice', 'bob']));
    const failing = () => Promise.reject(new Error('network down'));
    await expect(check(vault, served(2n, ['alice', 'bob', 'carol']), failing)).rejects.toThrow(
      'network down',
    );
  });
});
