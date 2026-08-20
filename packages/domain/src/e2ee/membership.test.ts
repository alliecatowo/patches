import { describe, expect, it } from 'vitest';

import type { E2eeIdentityRootView } from './certificates.js';
import {
  assertGroupMembershipBounds,
  assertMembershipChain,
  assertMembershipEventShape,
  assertMembershipSucceeds,
  membershipGenesisPreviousDigest,
  verifyMembershipEventSignature,
  type E2eeMembershipEventView,
} from './membership.js';
import { E2EE_GROUP_MAX_MEMBERS, E2eeContractError } from './modes.js';
import { fakeDigest, fakeSign, seededBytes } from './testing.js';
import { ED25519_PUBLIC_KEY_BYTES, E2EE_DIGEST_BYTES } from './types.js';

const CONVERSATION_ID = 'conversation-1';
const ROOT_KEY_A = seededBytes(ED25519_PUBLIC_KEY_BYTES, 1);
const rootA: E2eeIdentityRootView = {
  actorId: 'actor-a',
  generation: 1,
  publicKey: ROOT_KEY_A,
  rootBytes: new TextEncoder().encode('root-a'),
  selfSignature: fakeSign(ROOT_KEY_A, new TextEncoder().encode('root-a')),
};

function genesis(memberActorIds: readonly string[]): E2eeMembershipEventView {
  return {
    conversationId: CONVERSATION_ID,
    epoch: 1n,
    previousDigest: membershipGenesisPreviousDigest(),
    digest: seededBytes(E2EE_DIGEST_BYTES, 0),
    eventBytes: new Uint8Array(0),
    action: 'GENESIS',
    actorId: 'actor-a',
    memberActorIds: [...memberActorIds].sort(),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  };
}

function signedLink(
  previous: E2eeMembershipEventView,
  overrides: {
    action: 'ADD' | 'REMOVE';
    actorId: string;
    targetActorId: string;
    memberActorIds: readonly string[];
  },
): E2eeMembershipEventView {
  const eventBytes = new TextEncoder().encode(
    `${String(previous.epoch + 1n)}:${overrides.action}:${overrides.targetActorId}`,
  );
  return {
    conversationId: previous.conversationId,
    epoch: previous.epoch + 1n,
    previousDigest: previous.digest,
    digest: fakeDigest(eventBytes),
    eventBytes,
    action: overrides.action,
    actorId: overrides.actorId,
    targetActorId: overrides.targetActorId,
    memberActorIds: [...overrides.memberActorIds].sort(),
    rootGeneration: rootA.generation,
    rootSignature: fakeSign(ROOT_KEY_A, eventBytes),
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
  };
}

describe('assertMembershipEventShape', () => {
  it('accepts a well-formed genesis link', () => {
    expect(() => assertMembershipEventShape(genesis(['actor-a', 'actor-b']))).not.toThrow();
  });

  it('rejects a genesis link naming a target actor', () => {
    expect(() =>
      assertMembershipEventShape({ ...genesis(['actor-a']), targetActorId: 'actor-b' }),
    ).toThrow(E2eeContractError);
  });

  it('rejects an unsorted member list', () => {
    expect(() =>
      assertMembershipEventShape({
        ...genesis(['actor-a']),
        memberActorIds: ['actor-b', 'actor-a'],
      }),
    ).toThrow(/sorted/);
  });

  it('rejects epoch 1 with a non-genesis action', () => {
    const g = genesis(['actor-a']);
    expect(() => assertMembershipEventShape({ ...g, action: 'ADD', targetActorId: 'x' })).toThrow(
      /genesis/,
    );
  });
});

describe('assertMembershipSucceeds', () => {
  it('accepts the genesis link as the chain start', () => {
    expect(() => assertMembershipSucceeds(null, genesis(['actor-a', 'actor-b']))).not.toThrow();
  });

  it('rejects a non-genesis first link', () => {
    const bogus = signedLink(genesis(['actor-a']), {
      action: 'ADD',
      actorId: 'actor-a',
      targetActorId: 'actor-c',
      memberActorIds: ['actor-a', 'actor-c'],
    });
    expect(() => assertMembershipSucceeds(null, { ...bogus, epoch: 1n })).toThrow(
      E2eeContractError,
    );
  });

  it('applies a valid ADD', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-a',
      targetActorId: 'actor-c',
      memberActorIds: ['actor-a', 'actor-b', 'actor-c'],
    });
    expect(() => assertMembershipSucceeds(g, add)).not.toThrow();
  });

  it('rejects an ADD authored by a non-member', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-x',
      targetActorId: 'actor-c',
      memberActorIds: ['actor-a', 'actor-b', 'actor-c'],
    });
    expect(() => assertMembershipSucceeds(g, add)).toThrow(/current active member/);
  });

  it('rejects an ADD of an existing member', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-a',
      targetActorId: 'actor-b',
      memberActorIds: ['actor-a', 'actor-b'],
    });
    expect(() => assertMembershipSucceeds(g, add)).toThrow(/already a member/);
  });

  it('rejects an ADD that would exceed the group size bound', () => {
    const members = Array.from({ length: E2EE_GROUP_MAX_MEMBERS }, (_, i) => `actor-${String(i)}`);
    const g = genesis(members);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-0',
      targetActorId: 'actor-overflow',
      memberActorIds: [...members, 'actor-overflow'],
    });
    expect(() => assertMembershipSucceeds(g, add)).toThrow(/1\.\.8 members/);
  });

  it('applies a valid REMOVE, including a self-remove (leave)', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const remove = signedLink(g, {
      action: 'REMOVE',
      actorId: 'actor-b',
      targetActorId: 'actor-b',
      memberActorIds: ['actor-a'],
    });
    expect(() => assertMembershipSucceeds(g, remove)).not.toThrow();
  });

  it('rejects removing the last member', () => {
    const g = genesis(['actor-a']);
    const remove = signedLink(g, {
      action: 'REMOVE',
      actorId: 'actor-a',
      targetActorId: 'actor-a',
      memberActorIds: [],
    });
    expect(() => assertMembershipSucceeds(g, remove)).toThrow(/1\.\.8 members/);
  });

  it('rejects a skipped epoch', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-a',
      targetActorId: 'actor-c',
      memberActorIds: ['actor-a', 'actor-b', 'actor-c'],
    });
    expect(() => assertMembershipSucceeds(g, { ...add, epoch: add.epoch + 1n })).toThrow(
      /advance by exactly 1/,
    );
  });

  it('rejects a broken digest chain', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-a',
      targetActorId: 'actor-c',
      memberActorIds: ['actor-a', 'actor-b', 'actor-c'],
    });
    expect(() =>
      assertMembershipSucceeds(g, { ...add, previousDigest: seededBytes(E2EE_DIGEST_BYTES, 99) }),
    ).toThrow(/chain to the previous/);
  });
});

describe('assertMembershipChain', () => {
  it('folds a multi-link chain', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-a',
      targetActorId: 'actor-c',
      memberActorIds: ['actor-a', 'actor-b', 'actor-c'],
    });
    const remove = signedLink(add, {
      action: 'REMOVE',
      actorId: 'actor-c',
      targetActorId: 'actor-b',
      memberActorIds: ['actor-a', 'actor-c'],
    });
    expect(() => assertMembershipChain([g, add, remove])).not.toThrow();
  });
});

describe('assertGroupMembershipBounds', () => {
  it('accepts up to the max', () => {
    expect(() => assertGroupMembershipBounds(E2EE_GROUP_MAX_MEMBERS)).not.toThrow();
  });
  it('rejects over the max', () => {
    expect(() => assertGroupMembershipBounds(E2EE_GROUP_MAX_MEMBERS + 1)).toThrow(
      E2eeContractError,
    );
  });
});

describe('verifyMembershipEventSignature', () => {
  it('verifies a correctly signed link', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-a',
      targetActorId: 'actor-c',
      memberActorIds: ['actor-a', 'actor-b', 'actor-c'],
    });
    expect(() =>
      verifyMembershipEventSignature(add, rootA, {
        verifier: { verifyEd25519: () => true },
        digest: fakeDigest,
      }),
    ).not.toThrow();
  });

  it('rejects the genesis link (not signature-verified)', () => {
    expect(() =>
      verifyMembershipEventSignature(genesis(['actor-a']), rootA, {
        verifier: { verifyEd25519: () => true },
        digest: fakeDigest,
      }),
    ).toThrow(/genesis/);
  });

  it('rejects a signature that does not verify', () => {
    const g = genesis(['actor-a', 'actor-b']);
    const add = signedLink(g, {
      action: 'ADD',
      actorId: 'actor-a',
      targetActorId: 'actor-c',
      memberActorIds: ['actor-a', 'actor-b', 'actor-c'],
    });
    expect(() =>
      verifyMembershipEventSignature(add, rootA, {
        verifier: { verifyEd25519: () => false },
        digest: fakeDigest,
      }),
    ).toThrow(/messaging root/);
  });
});
