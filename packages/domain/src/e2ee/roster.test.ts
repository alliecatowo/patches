import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { E2eeIdentityRootView } from './certificates.js';
import { E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR } from './modes.js';
import {
  activeDeviceIds,
  assertRosterChain,
  assertRosterNotRolledBack,
  assertRosterShape,
  assertRosterSucceeds,
  rosterGenesisPreviousDigest,
  verifyRosterSignature,
  type E2eeDeviceRosterView,
  type E2eeRosterEntryView,
} from './roster.js';
import { fakeDigest, fakeSign, fakeVerifier, rejectingVerifier, seededBytes } from './testing.js';
import { ED25519_PUBLIC_KEY_BYTES, E2EE_DIGEST_BYTES } from './types.js';

const ROOT_KEY = seededBytes(ED25519_PUBLIC_KEY_BYTES, 1);
const ROOT_BYTES = new TextEncoder().encode('root-transcript:1');

const root: E2eeIdentityRootView = {
  actorId: 'actor-a',
  generation: 1,
  publicKey: ROOT_KEY,
  rootBytes: ROOT_BYTES,
  selfSignature: fakeSign(ROOT_KEY, ROOT_BYTES),
};

function entry(deviceId: string, seed: number, active = true): E2eeRosterEntryView {
  return {
    deviceId,
    certificateDigest: seededBytes(E2EE_DIGEST_BYTES, seed),
    active,
    addedAt: new Date('2026-08-01T00:00:00.000Z'),
    revokedAt: active ? null : new Date('2026-08-05T00:00:00.000Z'),
  };
}

/** Builds a well-formed roster that chains onto `previous`. */
function makeRoster(
  sequence: bigint,
  entries: readonly E2eeRosterEntryView[],
  previous: E2eeDeviceRosterView | null,
  overrides: Partial<E2eeDeviceRosterView> = {},
): E2eeDeviceRosterView {
  const rosterBytes = new TextEncoder().encode(
    `roster:${String(sequence)}:${entries.map((e) => `${e.deviceId}:${String(e.active)}`).join(',')}`,
  );
  return {
    actorId: root.actorId,
    sequence,
    rootGeneration: root.generation,
    previousDigest: previous === null ? rosterGenesisPreviousDigest() : previous.digest,
    digest: fakeDigest(rosterBytes),
    rosterBytes,
    rootSignature: fakeSign(ROOT_KEY, rosterBytes),
    entries,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('roster shape', () => {
  it('accepts a genesis roster chaining from the all-zero digest', () => {
    expect(() => assertRosterShape(makeRoster(1n, [entry('d1', 10)], null))).not.toThrow();
  });

  it('requires the genesis digest exactly at sequence 1 and nowhere else', () => {
    const genesis = makeRoster(1n, [entry('d1', 10)], null);
    expect(() =>
      assertRosterShape({ ...genesis, previousDigest: seededBytes(E2EE_DIGEST_BYTES, 4) }),
    ).toThrow('must chain from the all-zero digest');
    expect(() =>
      assertRosterShape({
        ...genesis,
        sequence: 2n,
        previousDigest: rosterGenesisPreviousDigest(),
      }),
    ).toThrow('Only the first roster');
  });

  it('rejects duplicate devices, wrong-length digests and bad signature lengths', () => {
    const base = makeRoster(1n, [entry('d1', 10), entry('d1', 11)], null);
    expect(() => assertRosterShape(base)).toThrow('more than once');
    expect(() =>
      assertRosterShape(makeRoster(1n, [entry('d1', 10)], null, { digest: seededBytes(31, 2) })),
    ).toThrow('digest must be 32 bytes');
    expect(() =>
      assertRosterShape(
        makeRoster(1n, [entry('d1', 10)], null, { rootSignature: seededBytes(63, 2) }),
      ),
    ).toThrow('64-byte Ed25519 signature');
  });

  it('rejects an entry that is both active and revoked', () => {
    const contradictory: E2eeRosterEntryView = {
      ...entry('d1', 10),
      active: true,
      revokedAt: new Date('2026-08-05T00:00:00.000Z'),
    };
    expect(() => assertRosterShape(makeRoster(1n, [contradictory], null))).toThrow(
      'both active and revoked',
    );
  });

  it('caps active devices per actor', () => {
    const tooMany = Array.from({ length: E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR + 1 }, (_, i) =>
      entry(`d${String(i)}`, 20 + i),
    );
    expect(() => assertRosterShape(makeRoster(1n, tooMany, null))).toThrow(
      'at most 8 active devices',
    );
  });
});

describe('roster signature', () => {
  it('accepts a root-signed roster whose digest covers its transcript', () => {
    const roster = makeRoster(1n, [entry('d1', 10)], null);
    expect(() =>
      verifyRosterSignature(roster, root, { verifier: fakeVerifier, digest: fakeDigest }),
    ).not.toThrow();
  });

  it('rejects a mismatched digest, a foreign signer, a wrong actor and a superseded generation', () => {
    const roster = makeRoster(1n, [entry('d1', 10)], null);
    expect(() =>
      verifyRosterSignature({ ...roster, digest: seededBytes(E2EE_DIGEST_BYTES, 9) }, root, {
        verifier: fakeVerifier,
        digest: fakeDigest,
      }),
    ).toThrow('digest does not match');
    expect(() =>
      verifyRosterSignature(roster, root, { verifier: rejectingVerifier, digest: fakeDigest }),
    ).toThrow('not signed by this actor');
    expect(() =>
      verifyRosterSignature({ ...roster, actorId: 'actor-b' }, root, {
        verifier: fakeVerifier,
        digest: fakeDigest,
      }),
    ).toThrow('different actor');
    expect(() =>
      verifyRosterSignature({ ...roster, rootGeneration: 0 }, root, {
        verifier: fakeVerifier,
        digest: fakeDigest,
      }),
    ).toThrow('superseded root generation');
  });
});

describe('roster monotonicity', () => {
  it('accepts an exact successor', () => {
    const first = makeRoster(1n, [entry('d1', 10)], null);
    const second = makeRoster(2n, [entry('d1', 10), entry('d2', 11)], first);
    expect(() => assertRosterSucceeds(first, second)).not.toThrow();
    expect(() => assertRosterChain([first, second])).not.toThrow();
  });

  it('rejects a gap, a repeat, and a chain that does not start at 1', () => {
    const first = makeRoster(1n, [entry('d1', 10)], null);
    const skipped = makeRoster(3n, [entry('d1', 10)], first);
    expect(() => assertRosterSucceeds(first, skipped)).toThrow('advance by exactly 1');
    const second = makeRoster(2n, [entry('d1', 10)], first);
    const repeated = makeRoster(2n, [entry('d1', 10)], first);
    expect(() => assertRosterSucceeds(second, repeated)).toThrow('advance by exactly 1');
    const orphan = makeRoster(2n, [entry('d1', 10)], null, {
      previousDigest: seededBytes(E2EE_DIGEST_BYTES, 41),
    });
    expect(() => assertRosterChain([orphan])).toThrow('must begin at sequence 1');
  });

  it('rejects a fork: a successor that does not chain to the previous digest', () => {
    const first = makeRoster(1n, [entry('d1', 10)], null);
    const forked = makeRoster(2n, [entry('d1', 10)], first, {
      previousDigest: seededBytes(E2EE_DIGEST_BYTES, 99),
    });
    expect(() => assertRosterSucceeds(first, forked)).toThrow('does not chain');
  });

  it('rejects a silent device removal — inactive, never dropped', () => {
    const first = makeRoster(1n, [entry('d1', 10), entry('d2', 11)], null);
    const dropped = makeRoster(2n, [entry('d1', 10)], first);
    expect(() => assertRosterSucceeds(first, dropped)).toThrow('never removed');
    const deactivated = makeRoster(2n, [entry('d1', 10), entry('d2', 11, false)], first);
    expect(() => assertRosterSucceeds(first, deactivated)).not.toThrow();
  });

  it('rejects a device id re-pointed at a different certificate', () => {
    const first = makeRoster(1n, [entry('d1', 10)], null);
    const repointed = makeRoster(2n, [entry('d1', 55)], first);
    expect(() => assertRosterSucceeds(first, repointed)).toThrow('changed certificate');
  });

  it('rejects un-revocation and a backwards root generation', () => {
    const first = makeRoster(1n, [entry('d1', 10, false)], null);
    const reactivated = makeRoster(2n, [entry('d1', 10, true)], first);
    expect(() => assertRosterSucceeds(first, reactivated)).toThrow('cannot be reactivated');

    const gen2 = makeRoster(1n, [entry('d1', 10)], null, { rootGeneration: 2 });
    const downgraded = makeRoster(2n, [entry('d1', 10)], gen2, { rootGeneration: 1 });
    expect(() => assertRosterSucceeds(gen2, downgraded)).toThrow('generation went backwards');
  });

  it('rejects a chain that switches actors', () => {
    const first = makeRoster(1n, [entry('d1', 10)], null);
    const hijacked = makeRoster(2n, [entry('d1', 10)], first, { actorId: 'actor-b' });
    expect(() => assertRosterSucceeds(first, hijacked)).toThrow('switched actors');
  });

  it('detects a node serving an older roster than the client already verified', () => {
    const served = makeRoster(3n, [entry('d1', 10)], null, {
      previousDigest: seededBytes(E2EE_DIGEST_BYTES, 7),
    });
    expect(() => assertRosterNotRolledBack(3n, served)).not.toThrow();
    expect(() => assertRosterNotRolledBack(4n, served)).toThrow('rollback');
  });

  it('lists active device ids in a deterministic order', () => {
    const roster = makeRoster(1n, [entry('d3', 12), entry('d1', 10), entry('d2', 11, false)], null);
    expect(activeDeviceIds(roster)).toEqual(['d1', 'd3']);
  });

  it('property: an honestly built chain of any length verifies, and any single mutation breaks it', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 7 }),
        fc.constantFrom('sequence', 'previousDigest', 'actorId'),
        (length, rawIndex, mutation) => {
          const chain: E2eeDeviceRosterView[] = [];
          let previous: E2eeDeviceRosterView | null = null;
          for (let i = 0; i < length; i += 1) {
            const entries = Array.from({ length: i + 1 }, (_, d) => entry(`d${String(d)}`, 30 + d));
            const roster = makeRoster(BigInt(i + 1), entries, previous);
            chain.push(roster);
            previous = roster;
          }
          expect(() => assertRosterChain(chain)).not.toThrow();

          const index = 1 + (rawIndex % (length - 1));
          const target = chain[index]!;
          const mutated: E2eeDeviceRosterView =
            mutation === 'sequence'
              ? { ...target, sequence: target.sequence + 1n }
              : mutation === 'previousDigest'
                ? { ...target, previousDigest: seededBytes(E2EE_DIGEST_BYTES, 200 + index) }
                : { ...target, actorId: 'actor-intruder' };
          const broken = [...chain];
          broken[index] = mutated;
          expect(() => assertRosterChain(broken)).toThrow();
        },
      ),
      { numRuns: 150 },
    );
  });
});
