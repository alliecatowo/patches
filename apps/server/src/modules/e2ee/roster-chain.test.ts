import { generateSigningKeyPair, sha256Hash, sign } from '@patches/crypto';
import type { E2eeIdentityRootView } from '@patches/domain';
import { describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { encodeRosterTranscript } from './e2ee.codec.js';
import { appendRoster } from './roster-chain.js';

interface FakeEntryProto {
  deviceId: string;
  certificateDigest: Buffer;
  active: boolean;
  addedAt: { seconds: string; nanos: number };
  revokedAt: undefined;
}

/** Builds a genuinely signed roster proto message the way a real client would. */
function signedRosterProto(input: {
  privateKey: Uint8Array;
  actorId: string;
  sequence: bigint;
  rootGeneration: number;
  previousDigest: Uint8Array;
  entries: readonly { deviceId: string; certificateDigest: Uint8Array; active: boolean }[];
}) {
  const addedAt = { seconds: '1780000000', nanos: 0 };
  const entries: FakeEntryProto[] = input.entries.map((entry) => ({
    deviceId: entry.deviceId,
    certificateDigest: Buffer.from(entry.certificateDigest),
    active: entry.active,
    addedAt,
    revokedAt: undefined,
  }));
  const rosterBytes = encodeRosterTranscript({
    actorId: input.actorId,
    sequence: input.sequence,
    rootGeneration: input.rootGeneration,
    previousDigest: input.previousDigest,
    entries: entries.map((entry) => ({
      deviceId: entry.deviceId,
      certificateDigest: entry.certificateDigest,
      active: entry.active,
      addedAt: new Date(1780000000 * 1000),
      revokedAt: undefined,
    })),
  });
  const digest = sha256Hash(rosterBytes);
  const rootSignature = sign(input.privateKey, rosterBytes);
  return {
    actorId: input.actorId,
    sequence: input.sequence.toString(),
    rootGeneration: input.rootGeneration,
    previousDigest: Buffer.from(input.previousDigest),
    digest: Buffer.from(digest),
    rosterBytes: Buffer.from(rosterBytes),
    rootSignature: Buffer.from(rootSignature),
    entries,
    createdAt: undefined,
  };
}

function fakeManager(previousRosterRow: unknown): EntityManager {
  const rosterRepo = {
    findOne: vi.fn().mockResolvedValue(previousRosterRow),
    create: vi.fn((input: unknown) => input),
    save: vi.fn((input: Record<string, unknown>) =>
      Promise.resolve({ id: 'roster-row-id', ...input }),
    ),
  };
  return {
    getRepository: vi.fn(() => rosterRepo),
  } as unknown as EntityManager;
}

describe('appendRoster (ADR 0020 §2, §14.14.4)', () => {
  const keys = generateSigningKeyPair();
  const root: E2eeIdentityRootView = {
    actorId: 'actor-1',
    generation: 1,
    publicKey: keys.publicKey,
    rootBytes: new Uint8Array(0),
    selfSignature: new Uint8Array(0),
  };
  const zero32 = new Uint8Array(32);

  it('accepts the genesis roster (sequence 1, all-zero previousDigest)', async () => {
    const proto = signedRosterProto({
      privateKey: keys.privateKey,
      actorId: 'actor-1',
      sequence: 1n,
      rootGeneration: 1,
      previousDigest: zero32,
      entries: [],
    });
    const manager = fakeManager(null);
    const result = await appendRoster(manager, 'actor-1', proto, root);
    expect(result.entries).toHaveLength(0);
  });

  it('rejects a roster that does not chain to the previous digest', async () => {
    const previousDigest = sha256Hash(new Uint8Array([9, 9, 9]));
    const previousRow = {
      actorId: 'actor-1',
      sequence: '1',
      previousDigest: Buffer.from(zero32),
      digest: Buffer.from(previousDigest),
      rosterBytes: Buffer.from(
        encodeRosterTranscript({
          actorId: 'actor-1',
          sequence: 1n,
          rootGeneration: 1,
          previousDigest: zero32,
          entries: [],
        }),
      ),
      rootSignature: Buffer.alloc(64),
      createdAt: new Date(),
    };
    const proto = signedRosterProto({
      privateKey: keys.privateKey,
      actorId: 'actor-1',
      sequence: 2n,
      rootGeneration: 1,
      // Wrong: does not equal `previousDigest` above — simulates a fork/rollback attempt.
      previousDigest: sha256Hash(new Uint8Array([1, 2, 3])),
      entries: [],
    });
    const manager = fakeManager(previousRow);
    await expect(appendRoster(manager, 'actor-1', proto, root)).rejects.toMatchObject({
      code: 'E2EE_ROSTER_CONFLICT',
    });
  });

  it('rejects a roster whose sequence skips ahead', async () => {
    const genesisBytes = encodeRosterTranscript({
      actorId: 'actor-1',
      sequence: 1n,
      rootGeneration: 1,
      previousDigest: zero32,
      entries: [],
    });
    const previousRow = {
      actorId: 'actor-1',
      sequence: '1',
      previousDigest: Buffer.from(zero32),
      digest: Buffer.from(sha256Hash(genesisBytes)),
      rosterBytes: Buffer.from(genesisBytes),
      rootSignature: Buffer.alloc(64),
      createdAt: new Date(),
    };
    const proto = signedRosterProto({
      privateKey: keys.privateKey,
      actorId: 'actor-1',
      sequence: 3n, // should be 2
      rootGeneration: 1,
      previousDigest: sha256Hash(genesisBytes),
      entries: [],
    });
    const manager = fakeManager(previousRow);
    await expect(appendRoster(manager, 'actor-1', proto, root)).rejects.toMatchObject({
      code: 'E2EE_ROSTER_CONFLICT',
    });
  });

  it('rejects a roster with an invalid root signature', async () => {
    const proto = signedRosterProto({
      privateKey: keys.privateKey,
      actorId: 'actor-1',
      sequence: 1n,
      rootGeneration: 1,
      previousDigest: zero32,
      entries: [],
    });
    proto.rootSignature = Buffer.alloc(64); // corrupt the signature
    const manager = fakeManager(null);
    await expect(appendRoster(manager, 'actor-1', proto, root)).rejects.toMatchObject({
      code: 'E2EE_CERTIFICATE_INVALID',
    });
  });

  it('rejects entries that do not match the signed roster transcript', async () => {
    const proto = signedRosterProto({
      privateKey: keys.privateKey,
      actorId: 'actor-1',
      sequence: 1n,
      rootGeneration: 1,
      previousDigest: zero32,
      entries: [],
    });
    // Tamper with the decoded convenience view without re-signing — this is exactly what
    // `decodedMatchesTranscript` verification exists to catch.
    proto.entries = [
      {
        deviceId: 'sneaky-device',
        certificateDigest: Buffer.alloc(32),
        active: true,
        addedAt: { seconds: '1780000000', nanos: 0 },
        revokedAt: undefined,
      },
    ];
    const manager = fakeManager(null);
    await expect(appendRoster(manager, 'actor-1', proto, root)).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
