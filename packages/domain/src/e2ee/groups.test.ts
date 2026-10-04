import { describe, expect, it } from 'vitest';

import {
  assertGroupControlChain,
  assertGroupControlShape,
  assertGroupControlSucceeds,
  assertGroupSizeWithinBound,
  canonicalGroupControlTranscript,
  deriveGroupMembership,
  sameMemberSet,
  groupControlGenesisTip,
  groupControlGenesisPreviousDigest,
  verifyGroupControlSignature,
  type E2eeGroupChangeKind,
  type E2eeGroupControlEventView,
} from './groups.js';
import { E2EE_DIGEST_BYTES, type Bytes, type SignatureVerifier } from './types.js';

function fakeDigest(seed: number): (input: Bytes) => Bytes {
  return (input: Bytes) => {
    const out = new Uint8Array(E2EE_DIGEST_BYTES);
    out[0] = seed;
    out[1] = input.length;
    for (let i = 0; i < input.length; i += 1) {
      const slot = E2EE_DIGEST_BYTES - 1 - (i % 8);
      out[slot] = (out[slot] ?? 0) ^ (input[i] ?? 0);
    }
    return out;
  };
}

const digest = fakeDigest(7);

/** A signer that accepts exactly one pre-agreed signature byte string, like the real one
 * accepts exactly one signature per (key, message). */
const acceptingVerifier: SignatureVerifier = { verifyEd25519: () => true };
const rejectingVerifier: SignatureVerifier = { verifyEd25519: () => false };

function eventView(overrides: Partial<E2eeGroupControlEventView> = {}): E2eeGroupControlEventView {
  const base: E2eeGroupControlEventView = {
    conversationId: 'conv-1',
    epoch: 2n,
    change: 'ADDED',
    subjectActorId: 'subject-1',
    signerActorId: 'signer-1',
    signerDeviceId: 'device-1',
    previousDigest: groupControlGenesisPreviousDigest(),
    digest: new Uint8Array(E2EE_DIGEST_BYTES).fill(1),
    eventBytes: new Uint8Array(64).fill(2),
    deviceSignature: new Uint8Array(64).fill(3),
    createdAt: new Date(),
    ...overrides,
  };
  return base;
}

describe('canonicalGroupControlTranscript', () => {
  it('is deterministic and bound to its domain separator', () => {
    const fields = {
      conversationId: 'c1',
      epoch: 2n,
      change: 'ADDED' as const,
      subjectActorId: 'a1',
      signerActorId: 'a2',
      signerDeviceId: 'd1',
      previousDigest: new Uint8Array(E2EE_DIGEST_BYTES),
    };
    const first = canonicalGroupControlTranscript(fields);
    const second = canonicalGroupControlTranscript(fields);
    expect([...first]).toEqual([...second]);

    // A different change kind must change the bytes — the signature binds which transition
    // this event is, so ADDED and REMOVED can never share a transcript.
    const removed = canonicalGroupControlTranscript({ ...fields, change: 'REMOVED' as const });
    expect([...removed]).not.toEqual([...first]);

    // A different epoch must change the bytes.
    const nextEpoch = canonicalGroupControlTranscript({ ...fields, epoch: 3n });
    expect([...nextEpoch]).not.toEqual([...first]);
  });

  it('rejects an epoch that does not fit a u64', () => {
    expect(() =>
      canonicalGroupControlTranscript({
        conversationId: 'c1',
        epoch: -1n,
        change: 'ADDED',
        subjectActorId: 'a1',
        signerActorId: 'a2',
        signerDeviceId: 'd1',
        previousDigest: new Uint8Array(E2EE_DIGEST_BYTES),
      }),
    ).toThrow(/range/);
  });
});

describe('assertGroupControlShape', () => {
  it('accepts a well-formed first event', () => {
    expect(() => assertGroupControlShape(eventView())).not.toThrow();
  });

  it('rejects epoch 1 — creation is not a control event', () => {
    expect(() => assertGroupControlShape(eventView({ epoch: 1n }))).toThrow(/start at 2/);
  });

  it('rejects an unknown change kind, a missing id, and wrong digest/signature lengths', () => {
    expect(() =>
      assertGroupControlShape(eventView({ change: 'RENAMED' as E2eeGroupChangeKind })),
    ).toThrow(/change kind/);
    expect(() => assertGroupControlShape(eventView({ subjectActorId: '' }))).toThrow(/missing/);
    expect(() => assertGroupControlShape(eventView({ digest: new Uint8Array(31) }))).toThrow(
      /digest must be 32/,
    );
    expect(() =>
      assertGroupControlShape(eventView({ deviceSignature: new Uint8Array(63) })),
    ).toThrow(/64-byte/);
  });
});

describe('verifyGroupControlSignature', () => {
  it('checks the digest over the signed bytes, then the signature itself', () => {
    const event = eventView();
    expect(() =>
      verifyGroupControlSignature(event, new Uint8Array(32), {
        verifier: acceptingVerifier,
        digest,
      }),
    ).toThrow(/digest does not match/);
  });

  it('rejects an event the named device did not sign', () => {
    const event = eventView({ digest: digest(eventView().eventBytes) });
    expect(() =>
      verifyGroupControlSignature(event, new Uint8Array(32), {
        verifier: rejectingVerifier,
        digest,
      }),
    ).toThrow(/not signed/);
  });
});

describe('assertGroupControlSucceeds', () => {
  it('accepts the first transition at epoch 2 chaining from genesis', () => {
    expect(() => assertGroupControlSucceeds(null, eventView({ epoch: 2n }))).not.toThrow();
  });

  it('rejects a first event at any epoch other than 2', () => {
    expect(() => assertGroupControlSucceeds(null, eventView({ epoch: 3n }))).toThrow(/begin at/);
  });

  it('rejects a first event that does not chain from the all-zero digest', () => {
    expect(() =>
      assertGroupControlSucceeds(
        null,
        eventView({ previousDigest: new Uint8Array(E2EE_DIGEST_BYTES).fill(9) }),
      ),
    ).toThrow(/genesis/);
  });

  it('requires exactly +1 epoch and a chaining previous digest', () => {
    const tip = { epoch: 4n, digest: new Uint8Array(E2EE_DIGEST_BYTES).fill(5) };
    expect(() =>
      assertGroupControlSucceeds(tip, eventView({ epoch: 5n, previousDigest: tip.digest })),
    ).not.toThrow();
    expect(() =>
      assertGroupControlSucceeds(tip, eventView({ epoch: 6n, previousDigest: tip.digest })),
    ).toThrow(/advance by exactly 1/);
    expect(() =>
      assertGroupControlSucceeds(
        tip,
        eventView({ epoch: 5n, previousDigest: groupControlGenesisPreviousDigest() }),
      ),
    ).toThrow(/genesis/);
    expect(() =>
      assertGroupControlSucceeds(
        tip,
        eventView({ epoch: 5n, previousDigest: new Uint8Array(E2EE_DIGEST_BYTES).fill(6) }),
      ),
    ).toThrow(/chain to the previous/);
  });

  it('folds across a whole chain, oldest first', () => {
    const first = eventView({ epoch: 2n });
    const second = eventView({
      epoch: 3n,
      change: 'REMOVED',
      previousDigest: first.digest,
    });
    expect(() => assertGroupControlChain([first, second])).not.toThrow();
    expect(() => assertGroupControlChain([second, first])).toThrow();
  });
});

describe('assertGroupSizeWithinBound', () => {
  it('allows 1..8 and rejects 0 and 9', () => {
    for (const ok of [1, 2, 8]) expect(() => assertGroupSizeWithinBound(ok)).not.toThrow();
    for (const bad of [0, 9, 1.5]) expect(() => assertGroupSizeWithinBound(bad)).toThrow();
  });
});

describe('groupControlGenesisTip', () => {
  it('is epoch 1 with the all-zero digest', () => {
    const tip = groupControlGenesisTip();
    expect(tip.epoch).toBe(1n);
    expect(tip.digest.every((byte) => byte === 0)).toBe(true);
  });
});

describe('deriveGroupMembership (audit P2-H3)', () => {
  const key = new Uint8Array(32).fill(5);
  const deps = { verifier: acceptingVerifier, digest };

  /** A fully consistent event: bytes re-encode from its fields, digest is over the bytes. */
  function signedEvent(input: {
    epoch: bigint;
    change: E2eeGroupChangeKind;
    subject: string;
    signer?: string;
    previous: Bytes;
  }): E2eeGroupControlEventView {
    const fields = {
      conversationId: 'conv-1',
      epoch: input.epoch,
      change: input.change,
      subjectActorId: input.subject,
      signerActorId: input.signer ?? 'alice',
      signerDeviceId: 'device-a',
      previousDigest: input.previous,
    };
    const eventBytes = canonicalGroupControlTranscript(fields);
    return {
      ...fields,
      eventBytes,
      digest: digest(eventBytes),
      deviceSignature: new Uint8Array(64).fill(9),
      createdAt: new Date(0),
    };
  }

  const genesis = {
    epoch: 1n,
    members: ['alice', 'bob'],
    tipDigest: groupControlGenesisPreviousDigest(),
  };

  it('applies a signed chain of additions and removals', () => {
    const add = signedEvent({
      epoch: 2n,
      change: 'ADDED',
      subject: 'carol',
      previous: genesis.tipDigest,
    });
    const remove = signedEvent({
      epoch: 3n,
      change: 'REMOVED',
      subject: 'bob',
      previous: add.digest,
    });
    const result = deriveGroupMembership({
      from: genesis,
      events: [add, remove],
      signerKeyFor: () => key,
      deps,
    });
    expect(result.epoch).toBe(3n);
    expect(result.members).toEqual(['alice', 'carol']);
    expect(result.tipDigest).toEqual(remove.digest);
  });

  it('refuses forged convenience fields paired with a valid signature', () => {
    const real = signedEvent({
      epoch: 2n,
      change: 'ADDED',
      subject: 'carol',
      previous: genesis.tipDigest,
    });
    // The node keeps the signed bytes for "carol" but serves a subject of "mallory".
    const forged = { ...real, subjectActorId: 'mallory' };
    expect(() =>
      deriveGroupMembership({ from: genesis, events: [forged], signerKeyFor: () => key, deps }),
    ).toThrow('do not match');
  });

  it('refuses a gap, a repeat, a reorder and a fork', () => {
    const e2 = signedEvent({
      epoch: 2n,
      change: 'ADDED',
      subject: 'carol',
      previous: genesis.tipDigest,
    });
    const e3 = signedEvent({ epoch: 3n, change: 'ADDED', subject: 'dave', previous: e2.digest });
    const run = (events: E2eeGroupControlEventView[]) =>
      deriveGroupMembership({ from: genesis, events, signerKeyFor: () => key, deps });
    expect(() => run([e3])).toThrow();
    expect(() => run([e2, e2])).toThrow();
    expect(() => run([e3, e2])).toThrow();
    const fork = signedEvent({
      epoch: 3n,
      change: 'ADDED',
      subject: 'erin',
      previous: new Uint8Array(32).fill(4),
    });
    expect(() => run([e2, fork])).toThrow('does not chain');
  });

  it('refuses a non-member signer, a missing key and a bad signature', () => {
    const outsider = signedEvent({
      epoch: 2n,
      change: 'ADDED',
      subject: 'carol',
      signer: 'mallory',
      previous: genesis.tipDigest,
    });
    expect(() =>
      deriveGroupMembership({ from: genesis, events: [outsider], signerKeyFor: () => key, deps }),
    ).toThrow('non-member');
    const ok = signedEvent({
      epoch: 2n,
      change: 'ADDED',
      subject: 'carol',
      previous: genesis.tipDigest,
    });
    expect(() =>
      deriveGroupMembership({ from: genesis, events: [ok], signerKeyFor: () => undefined, deps }),
    ).toThrow('certified device key');
    expect(() =>
      deriveGroupMembership({
        from: genesis,
        events: [ok],
        signerKeyFor: () => key,
        deps: { verifier: rejectingVerifier, digest },
      }),
    ).toThrow('not signed');
  });

  it('refuses illegal transitions and growth past the bound', () => {
    const addExisting = signedEvent({
      epoch: 2n,
      change: 'ADDED',
      subject: 'bob',
      previous: genesis.tipDigest,
    });
    expect(() =>
      deriveGroupMembership({
        from: genesis,
        events: [addExisting],
        signerKeyFor: () => key,
        deps,
      }),
    ).toThrow('existing member');
    const removeStranger = signedEvent({
      epoch: 2n,
      change: 'REMOVED',
      subject: 'zed',
      previous: genesis.tipDigest,
    });
    expect(() =>
      deriveGroupMembership({
        from: genesis,
        events: [removeStranger],
        signerKeyFor: () => key,
        deps,
      }),
    ).toThrow('non-member');
    const full = {
      epoch: 1n,
      members: ['alice', 'a', 'b', 'c', 'd', 'e', 'f', 'g'],
      tipDigest: genesis.tipDigest,
    };
    const overflow = signedEvent({
      epoch: 2n,
      change: 'ADDED',
      subject: 'h',
      previous: genesis.tipDigest,
    });
    expect(() =>
      deriveGroupMembership({ from: full, events: [overflow], signerKeyFor: () => key, deps }),
    ).toThrow();
  });

  it('compares member sets exactly', () => {
    expect(sameMemberSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameMemberSet(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    expect(sameMemberSet(['a', 'a'], ['a', 'b'])).toBe(false);
  });
});
