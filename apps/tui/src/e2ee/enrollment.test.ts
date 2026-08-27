/**
 * Enrollment flow tests, centred on B-131: a failed identity-root lookup must never be
 * read as "this account has no root yet". Minting an identity root on the strength of a
 * request that never completed — and persisting it — wedges the device permanently
 * against a server that disagrees, which no retry can undo.
 */
import { create } from '@bufbuild/protobuf';
import {
  E2eeIdentityRootSchema,
  type E2eeIdentityRoot,
  type EnrollDeviceRequest,
  type PublishIdentityRootRequest,
} from '@patches/proto/es';
import { assertRosterSucceeds, E2EE_PROTOCOL_V1, type E2eeDeviceRosterView } from '@patches/domain';
import {
  signDeviceRoster,
  signingKeyPairFromPrivate,
  verifyRosterSnapshot,
  type DoubleRatchetState,
  type VerifiedRosterSnapshot,
} from '@patches/crypto';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  ENROLLMENT_RECORD_KEY,
  ENROLLMENT_REFUSAL_COPY,
  decodeStoredEnrollment,
  disposeStoredEnrollment,
  encodeStoredEnrollment,
  enrollThisDevice,
  generateEnrollment,
  publishRootRequestFromRecord,
  type EnrollmentCapability,
  type EnrollmentTransport,
} from './enrollment.js';
import type { RatchetSessionVault } from './ratchet-vault.js';
import type { VaultOpenInfo } from './vault-store.js';

const ACTOR_ID = 'actor-me';
const NOW_MS = 1_770_000_000_000;

/** Only the opaque-record half of the vault is exercised by enrollment; the ratchet
 * methods throw so an accidental dependency on them fails loudly instead of silently. */
function memoryVault(): RatchetSessionVault & { readonly records: Map<string, Uint8Array> } {
  const records = new Map<string, Uint8Array>();
  const unused = (): never => {
    throw new Error('enrollment must not touch ratchet session state');
  };
  return {
    records,
    open: (): Promise<VaultOpenInfo> =>
      Promise.resolve({ generation: 0, adoptedStagedSessions: [], discardedTempFiles: [] }),
    listSessions: () => Promise.resolve([...records.keys()]),
    getSession: (): Promise<DoubleRatchetState | undefined> => unused(),
    stageSend: (): Promise<void> => unused(),
    confirmSend: (): Promise<void> => unused(),
    applyUpdate: (): Promise<void> => unused(),
    deleteSession: (): Promise<void> => unused(),
    getOpaqueRecord: (key) => Promise.resolve(records.get(key)),
    putOpaqueRecord: (key, value) => {
      records.set(key, value.slice());
      return Promise.resolve();
    },
    wipe: () => {
      records.clear();
      return Promise.resolve();
    },
    close: () => undefined,
  };
}

const usableCapability: EnrollmentCapability = {
  state: 3,
  supportedProtocolVersions: [E2EE_PROTOCOL_V1],
};

interface FakeTransport extends EnrollmentTransport {
  readonly getCapability: Mock<() => Promise<EnrollmentCapability | undefined>>;
  readonly getIdentityRoot: Mock<(actorId: string) => Promise<E2eeIdentityRoot | undefined>>;
  readonly publishIdentityRoot: Mock<(request: PublishIdentityRootRequest) => Promise<unknown>>;
  readonly enrollDevice: Mock<(request: EnrollDeviceRequest) => Promise<unknown>>;
}

function fakeTransport(): FakeTransport {
  return {
    getCapability: vi.fn<() => Promise<EnrollmentCapability | undefined>>(() =>
      Promise.resolve(usableCapability),
    ),
    getIdentityRoot: vi.fn<(actorId: string) => Promise<E2eeIdentityRoot | undefined>>(() =>
      Promise.resolve(undefined),
    ),
    publishIdentityRoot: vi.fn<(request: PublishIdentityRootRequest) => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    ),
    enrollDevice: vi.fn<(request: EnrollDeviceRequest) => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    ),
  };
}

function publishedRoot(publicKey: Uint8Array): E2eeIdentityRoot {
  return create(E2eeIdentityRootSchema, { actorId: ACTOR_ID, generation: 1, publicKey });
}

function run(
  transport: EnrollmentTransport,
  vault: RatchetSessionVault,
): ReturnType<typeof enrollThisDevice> {
  return enrollThisDevice({ actorId: ACTOR_ID, transport, vault, nowMs: () => NOW_MS });
}

describe('enrollThisDevice — identity-root preflight (B-131)', () => {
  let transport: FakeTransport;
  let vault: ReturnType<typeof memoryVault>;

  beforeEach(() => {
    transport = fakeTransport();
    vault = memoryVault();
  });

  it('mints and enrolls when the node says the account has no root yet', async () => {
    const outcome = await run(transport, vault);

    expect(outcome.status).toBe('enrolled');
    expect(outcome).toMatchObject({ createdRoot: true, rosterSequence: 1n });
    expect(transport.publishIdentityRoot).toHaveBeenCalledTimes(1);
    expect(transport.enrollDevice).toHaveBeenCalledTimes(1);
    const stored = vault.records.get(ENROLLMENT_RECORD_KEY);
    expect(stored).toBeDefined();
    expect(decodeStoredEnrollment(stored ?? new Uint8Array(), NOW_MS).submitted).toBe(true);
  });

  it('does NOT mint or persist anything when the root lookup fails', async () => {
    transport.getIdentityRoot.mockRejectedValue(new Error('network down'));

    await expect(run(transport, vault)).rejects.toThrow('network down');

    // The whole point of B-131: a failed request is not an answer.
    expect(vault.records.size).toBe(0);
    expect(transport.publishIdentityRoot).not.toHaveBeenCalled();
    expect(transport.enrollDevice).not.toHaveBeenCalled();
  });

  it('re-checks remotely on the retry after a failed lookup', async () => {
    transport.getIdentityRoot.mockRejectedValueOnce(new Error('network down'));
    await expect(run(transport, vault)).rejects.toThrow('network down');

    const outcome = await run(transport, vault);

    expect(transport.getIdentityRoot).toHaveBeenCalledTimes(2);
    expect(outcome.status).toBe('enrolled');
  });

  it('surfaces a failed capability preflight instead of claiming the node disabled E2EE', async () => {
    transport.getCapability.mockRejectedValue(new Error('network down'));

    await expect(run(transport, vault)).rejects.toThrow('network down');

    expect(vault.records.size).toBe(0);
    expect(transport.getIdentityRoot).not.toHaveBeenCalled();
  });

  it('refuses honestly when the node disabled E2EE, without touching identity', async () => {
    transport.getCapability.mockResolvedValue({ state: 1, supportedProtocolVersions: [] });

    const outcome = await run(transport, vault);

    expect(outcome).toEqual({
      status: 'refused',
      reason: 'capability-off',
      copy: ENROLLMENT_REFUSAL_COPY.capabilityOff,
    });
    expect(vault.records.size).toBe(0);
  });

  it('refuses when the account already publishes a root this device does not hold', async () => {
    transport.getIdentityRoot.mockResolvedValue(publishedRoot(new Uint8Array(32).fill(4)));

    const outcome = await run(transport, vault);

    expect(outcome).toEqual({
      status: 'refused',
      reason: 'remote-root',
      copy: ENROLLMENT_REFUSAL_COPY.remoteRoot,
    });
    expect(vault.records.size).toBe(0);
    expect(transport.enrollDevice).not.toHaveBeenCalled();
  });
});

describe('enrollThisDevice — resuming a persisted record', () => {
  let transport: FakeTransport;
  let vault: ReturnType<typeof memoryVault>;

  beforeEach(() => {
    transport = fakeTransport();
    vault = memoryVault();
  });

  /** Leaves exactly the state a crash between persist and accept produces. */
  async function seedUnsubmittedRecord(): Promise<Uint8Array> {
    transport.enrollDevice.mockRejectedValueOnce(new Error('enroll failed'));
    await expect(run(transport, vault)).rejects.toThrow('enroll failed');
    const stored = vault.records.get(ENROLLMENT_RECORD_KEY);
    expect(stored).toBeDefined();
    expect(decodeStoredEnrollment(stored ?? new Uint8Array(), NOW_MS).submitted).toBe(false);
    transport.getIdentityRoot.mockClear();
    transport.publishIdentityRoot.mockClear();
    transport.enrollDevice.mockClear();
    return stored ?? new Uint8Array();
  }

  it('re-checks the remote root on resume rather than skipping straight to enroll', async () => {
    const before = await seedUnsubmittedRecord();
    const record = decodeStoredEnrollment(before, NOW_MS);
    transport.getIdentityRoot.mockResolvedValue(publishedRoot(record.rootPublic));

    const outcome = await run(transport, vault);

    expect(transport.getIdentityRoot).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('enrolled');
    // Our root is already published — do not publish a second one.
    expect(transport.publishIdentityRoot).not.toHaveBeenCalled();
    // The device keys are the ones that were persisted, never freshly minted.
    expect(outcome).toMatchObject({ identity: { deviceId: record.identity.deviceId } });
  });

  it('republishes the identical bootstrap root when the first publish never landed', async () => {
    const before = await seedUnsubmittedRecord();
    const record = decodeStoredEnrollment(before, NOW_MS);
    transport.getIdentityRoot.mockResolvedValue(undefined);

    const outcome = await run(transport, vault);

    expect(outcome.status).toBe('enrolled');
    expect(transport.publishIdentityRoot).toHaveBeenCalledTimes(1);
    const republished = transport.publishIdentityRoot.mock.calls[0]?.[0];
    const expected = publishRootRequestFromRecord(record);
    expect([...(republished?.identityRoot?.publicKey ?? [])]).toEqual([...record.rootPublic]);
    expect([...(republished?.identityRoot?.selfSignature ?? [])]).toEqual([
      ...(expected?.identityRoot?.selfSignature ?? []),
    ]);
  });

  it('refuses when another device published a different root in the meantime', async () => {
    await seedUnsubmittedRecord();
    transport.getIdentityRoot.mockResolvedValue(publishedRoot(new Uint8Array(32).fill(8)));

    const outcome = await run(transport, vault);

    expect(outcome).toEqual({
      status: 'refused',
      reason: 'remote-root',
      copy: ENROLLMENT_REFUSAL_COPY.remoteRoot,
    });
    expect(transport.enrollDevice).not.toHaveBeenCalled();
  });

  it('short-circuits an already-submitted record without any network call', async () => {
    await run(transport, vault);
    transport.getCapability.mockClear();
    transport.getIdentityRoot.mockClear();
    transport.enrollDevice.mockClear();

    const outcome = await run(transport, vault);

    expect(outcome.status).toBe('already-enrolled');
    expect(transport.getCapability).not.toHaveBeenCalled();
    expect(transport.getIdentityRoot).not.toHaveBeenCalled();
    expect(transport.enrollDevice).not.toHaveBeenCalled();
  });
});

describe('stored enrollment codec', () => {
  it('round-trips every field the resume path depends on', () => {
    const { record } = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW_MS });

    const decoded = decodeStoredEnrollment(encodeStoredEnrollment(record), NOW_MS + 60_000);

    expect(decoded.submitted).toBe(record.submitted);
    expect(decoded.createdRoot).toBe(record.createdRoot);
    expect([...decoded.rootPublic]).toEqual([...record.rootPublic]);
    expect([...decoded.rootPrivate]).toEqual([...record.rootPrivate]);
    expect(decoded.identity.deviceId).toBe(record.identity.deviceId);
    expect(decoded.identity.oneTimePreKeys.length).toBe(record.identity.oneTimePreKeys.length);
    expect(decoded.identity.ownRoster.sequence).toBe(record.identity.ownRoster.sequence);
    expect([...decoded.identity.selfDevice.certificateBytes]).toEqual([
      ...record.identity.selfDevice.certificateBytes,
    ]);
    expect([...decoded.identity.ownBundle.deviceSignature]).toEqual([
      ...record.identity.ownBundle.deviceSignature,
    ]);
  });

  it('has no bootstrap root to republish for a record that did not create one', () => {
    // A resumed (non-bootstrap) root must be a real, self-consistent keypair —
    // `generateEnrollment` immediately re-verifies everything it mints (ADR 0033 §3), so a
    // mismatched fixture keypair fails signature verification rather than being silently
    // accepted.
    const fixedRoot = signingKeyPairFromPrivate(new Uint8Array(32).fill(1));
    const { record } = generateEnrollment({
      actorId: ACTOR_ID,
      root: {
        privateKey: fixedRoot.privateKey,
        publicKey: fixedRoot.publicKey,
        createdAtMs: NOW_MS - 60_000,
      },
      nowMs: NOW_MS,
    });

    expect(record.createdRoot).toBe(false);
    expect(publishRootRequestFromRecord(record)).toBeUndefined();
  });
});

/** Converts a `@patches/crypto` verified snapshot into the `@patches/domain` view
 * `assertRosterSucceeds` operates on — the two packages model the same roster with
 * different (ms-number vs. `Date`) timestamp shapes. */
function toRosterView(snapshot: VerifiedRosterSnapshot): E2eeDeviceRosterView {
  return {
    actorId: snapshot.actorId,
    sequence: BigInt(snapshot.sequence),
    rootGeneration: snapshot.rootGeneration,
    previousDigest: snapshot.previousDigest,
    digest: snapshot.rosterDigest,
    rosterBytes: snapshot.rosterBytes,
    rootSignature: snapshot.rootSignature,
    entries: snapshot.entries.map((entry) => ({
      deviceId: entry.deviceId,
      certificateDigest: entry.certificateDigest,
      active: entry.active,
      addedAt: new Date(entry.addedAtMs),
      revokedAt: entry.revokedAtMs === undefined ? undefined : new Date(entry.revokedAtMs),
    })),
    createdAt: new Date(snapshot.createdAtMs),
  };
}

describe('generateEnrollment — linking a second device onto an existing roster', () => {
  it('advances sequence by 1, chains the digest, and carries every prior entry forward', () => {
    const bootstrap = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW_MS });
    const rootPrivate = bootstrap.record.rootPrivate;
    const rootPublic = bootstrap.record.rootPublic;
    const root = bootstrap.record.identity.ownRoster.root;
    const firstDeviceCertificate = {
      certificateBytes: bootstrap.record.identity.selfDevice.certificateBytes,
      rootSignature: bootstrap.record.identity.selfDevice.rootSignature,
    };

    // Advance the authority's own roster to sequence 3 (two routine re-publishes with the
    // same single device) before the second device links, so the chain check below is
    // exercised against a roster that has actually moved, not just sequence 1 -> 2.
    let roster: VerifiedRosterSnapshot = bootstrap.record.identity.ownRoster;
    for (let sequence = 2; sequence <= 3; sequence += 1) {
      const signed = signDeviceRoster(rootPrivate, {
        actorId: ACTOR_ID,
        rootGeneration: root.generation,
        rootPublicKey: rootPublic,
        sequence,
        previousDigest: roster.rosterDigest,
        createdAtMs: root.createdAtMs + sequence,
        entries: roster.entries,
      });
      roster = verifyRosterSnapshot({
        rosterBytes: signed.rosterBytes,
        rootSignature: signed.rootSignature,
        root,
        certificates: [firstDeviceCertificate],
        nowMs: NOW_MS,
      });
    }
    expect(roster.sequence).toBe(3);

    const linked = generateEnrollment({
      actorId: ACTOR_ID,
      nowMs: NOW_MS,
      root: {
        privateKey: rootPrivate,
        publicKey: rootPublic,
        createdAtMs: root.createdAtMs,
        generation: root.generation,
        currentRoster: roster,
        certificates: [firstDeviceCertificate],
      },
    });

    expect(linked.record.createdRoot).toBe(false);
    expect(linked.publishRootRequest).toBeUndefined();
    const nextRoster = linked.record.identity.ownRoster;
    expect(nextRoster.sequence).toBe(4);
    expect(nextRoster.rootGeneration).toBe(root.generation);
    expect([...nextRoster.previousDigest]).toEqual([...roster.rosterDigest]);
    expect(nextRoster.entries).toHaveLength(2);
    const carried = nextRoster.entries.find(
      (entry) => entry.deviceId === bootstrap.record.identity.deviceId,
    );
    expect(carried).toEqual(roster.entries[0]);
    const linkedEntry = nextRoster.entries.find(
      (entry) => entry.deviceId === linked.record.identity.deviceId,
    );
    expect(linkedEntry?.active).toBe(true);

    // The produced roster is a valid successor of the pre-link roster per the domain's own
    // chain rules — the same check a peer or the node runs.
    expect(() =>
      assertRosterSucceeds(toRosterView(roster), toRosterView(nextRoster)),
    ).not.toThrow();
  });

  it('leaves the first-device bootstrap path unchanged', () => {
    const { record, publishRootRequest } = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW_MS });

    expect(record.createdRoot).toBe(true);
    expect(publishRootRequest).toBeDefined();
    expect(record.identity.ownRoster.sequence).toBe(1);
    expect(record.identity.ownRoster.rootGeneration).toBe(1);
    expect(record.identity.ownRoster.entries).toHaveLength(1);
    expect([...record.identity.ownRoster.previousDigest]).toEqual(
      new Array(record.identity.ownRoster.previousDigest.length).fill(0),
    );
  });
});

describe('disposeStoredEnrollment', () => {
  it('zeroizes the account root private key in place and leaves everything else untouched', () => {
    const { record } = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW_MS });
    const rootPublicBefore = [...record.rootPublic];
    const deviceIdBefore = record.identity.deviceId;

    disposeStoredEnrollment(record);

    expect([...record.rootPrivate]).toEqual(new Array(record.rootPrivate.length).fill(0));
    // Best-effort hygiene only (ADR 0020 §4): it must not corrupt the rest of the record,
    // which callers may still read (e.g. `record.identity` after a resume-path load).
    expect([...record.rootPublic]).toEqual(rootPublicBefore);
    expect(record.identity.deviceId).toBe(deviceIdBefore);
  });
});
