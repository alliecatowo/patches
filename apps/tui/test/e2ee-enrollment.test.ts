/**
 * B-107 — device enrollment: material generation (both transcript families), the
 * encrypted-vault record, the idempotent orchestration, and the shell transport
 * adapters. Server RPC behavior itself is covered by `apps/server`'s integration
 * suite; these tests pin the CLIENT half against `@patches/crypto`'s strict verifiers
 * and the node-canonical transcript layouts in `src/e2ee/node-transcripts.ts`.
 */
import { create } from '@bufbuild/protobuf';
import { GetE2eeCapabilityResponseSchema } from '@patches/proto/es';
import {
  sha256Hash,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
  verifyStrict,
} from '@patches/crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  decodeCertificateTranscript,
  decodeRosterTranscript,
} from '../src/e2ee/node-transcripts.js';
import { selfPrekeyBundle } from '../src/e2ee/local-identity.js';
import type { FanoutPlan } from '../src/e2ee/runtime.js';
import { E2eeSetupUnavailableError, sessionIdFor } from '../src/e2ee/runtime.js';
import {
  ENROLLMENT_PEER_WARNING_COPY,
  ENROLLMENT_RECORD_KEY,
  ENROLLMENT_REFUSAL_COPY,
  decodeStoredEnrollment,
  encodeStoredEnrollment,
  enrollRequestFromRecord,
  enrollThisDevice,
  loadStoredEnrollment,
  saveStoredEnrollment,
  generateEnrollment,
  type EnrollmentTransport,
} from '../src/e2ee/enrollment.js';
import { TypedRatchetVault } from '../src/e2ee/ratchet-vault.js';
import { MemoryVaultStore } from '../src/e2ee/vault-store.js';
import {
  createE2eeTransports,
  createEnrollmentTransport,
  type E2eeApiSurface,
} from '../src/app/e2ee-transports.js';

const ACTOR_ID = 'actor-1';
const NOW = 1_755_000_000_000;
const E2EE_CAPABILITY_STATE = {
  UNSPECIFIED: 0,
  DISABLED: 1,
  ISOLATED_TEST_ONLY: 2,
  EXTERNAL_REVIEW_PENDING: 3,
  EXPERIMENTAL_CANARY: 4,
  ENABLED: 5,
} as const;

// ---------------------------------------------------------------------------
// Material generation
// ---------------------------------------------------------------------------

describe('generateEnrollment (B-107)', () => {
  const generated = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW });

  it('produces a crypto-native identity that passes strict local verification', () => {
    const { identity } = generated.record;
    // Roster: root-signed, sequence 1, chaining from the zero digest.
    verifyRosterSnapshot(identity.ownRoster, NOW + 60_000);
    expect(identity.ownRoster.roster.sequence).toBe(1);
    expect(identity.ownRoster.roster.previousDigest).toHaveLength(32);
    // Certificate binds BOTH device public keys to actor + device id.
    expect(identity.selfDevice.certificate.userId).toBe(ACTOR_ID);
    expect(identity.selfDevice.certificate.signingPublicKey).toEqual(
      identity.keys.signing.publicKey,
    );
    expect(identity.selfDevice.certificate.agreementPublicKey).toEqual(
      identity.keys.agreement.publicKey,
    );
    // The signed prekey verifies as peers will verify it during X3DH.
    verifyPreKeyBundle(selfPrekeyBundle(identity), identity.ownRoster, NOW + 60_000);
    // One-time prekeys at the inventory target with unique ids.
    expect(identity.oneTimePreKeys.length).toBe(100);
    expect(new Set(identity.oneTimePreKeys.map((prekey) => prekey.id)).size).toBe(100);
  });

  it('signs the node-canonical certificate transcript with the same root key', () => {
    const { wire, identity, rootPublic } = generated.record;
    const decoded = decodeCertificateTranscript(wire.certificateBytes);
    expect(decoded.actorId).toBe(ACTOR_ID);
    expect(decoded.deviceId).toBe(identity.deviceId);
    expect(decoded.rootGeneration).toBe(1);
    expect(decoded.certificateVersion).toBe(1);
    expect(decoded.signingPublicKey).toEqual(identity.keys.signing.publicKey);
    expect(decoded.agreementPublicKey).toEqual(identity.keys.agreement.publicKey);
    expect(decoded.supportedProtocolVersions).toEqual(['patches-e2ee-v1']);
    expect(sha256Hash(wire.certificateBytes)).toHaveLength(32);
    expect(verifyStrict(rootPublic, wire.certificateBytes, wire.certificateRootSignature)).toBe(
      true,
    );
  });

  it('signs a node-canonical roster whose digest matches its transcript', () => {
    const { wire, identity, rootPublic } = generated.record;
    const decoded = decodeRosterTranscript(wire.rosterBytes);
    expect(decoded.actorId).toBe(ACTOR_ID);
    expect(decoded.sequence).toBe(1n);
    expect(decoded.rootGeneration).toBe(1);
    expect(decoded.previousDigest).toEqual(new Uint8Array(32));
    expect(decoded.entries).toHaveLength(1);
    const entry = decoded.entries[0];
    expect(entry?.deviceId).toBe(identity.deviceId);
    expect(entry?.active).toBe(true);
    expect(sha256Hash(wire.rosterBytes)).toEqual(wire.rosterDigestValue);
    expect(verifyStrict(rootPublic, wire.rosterBytes, wire.rosterRootSignature)).toBe(true);
  });

  it('signs the node prekey bundle transcript with the device signing key', () => {
    const { wire, identity } = generated.record;
    // The bundle signature EnrollDevice carries (`signed_prekey.signature` AND
    // `prekey_bundle_signature`) verifies over the canonical transcript bytes under
    // this DEVICE's signing key.
    expect(
      verifyStrict(identity.keys.signing.publicKey, wire.bundleBytes, wire.bundleSignature),
    ).toBe(true);
    // The request's two signatures are exactly those bytes.
    expect(generated.enrollRequest.prekeyBundleBytes).toEqual(wire.bundleBytes);
    expect(generated.enrollRequest.prekeyBundleSignature).toEqual(wire.bundleSignature);
    expect(generated.enrollRequest.signedPrekey?.signature).toEqual(wire.bundleSignature);
  });

  it('builds an EnrollDeviceRequest carrying certificate + roster + prekeys', () => {
    const request = generated.enrollRequest;
    expect(request.certificate?.actorId).toBe(ACTOR_ID);
    expect(request.certificate?.deviceId).toBe(generated.record.identity.deviceId);
    expect(request.certificate?.certificateBytes).toEqual(generated.record.wire.certificateBytes);
    expect(request.roster?.sequence).toBe(1n);
    expect(request.roster?.entries).toHaveLength(1);
    expect(request.oneTimePrekeys.map((prekey) => prekey.keyId)).toEqual(
      Array.from({ length: 100 }, (_, index) => BigInt(index + 1)),
    );
    expect(request.signedPrekey?.keyId).toBe(1n);
  });

  it('bootstraps only when no root exists; otherwise reuses the given authority', () => {
    const bootstrapRequest = generated.publishRootRequest;
    expect(bootstrapRequest).toBeDefined();
    expect(bootstrapRequest?.identityRoot?.generation ?? -1).toBe(1);

    const linked = generateEnrollment({
      actorId: ACTOR_ID,
      nowMs: NOW,
      root: { privateKey: generated.record.rootPrivate, publicKey: generated.record.rootPublic },
    });
    expect(linked.publishRootRequest).toBeUndefined();
    // Same authority → same safety-number input.
    expect(linked.record.identity.ownRoster.roster.rootPublicKey).toEqual(
      generated.record.rootPublic,
    );
  });
});

// ---------------------------------------------------------------------------
// Vault record codec
// ---------------------------------------------------------------------------

describe('enrollment record codec', () => {
  it('round-trips through the encrypted vault record form', () => {
    const generated = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW });
    const decoded = decodeStoredEnrollment(encodeStoredEnrollment(generated.record));

    expect(decoded.submitted).toBe(false);
    expect(decoded.createdRoot).toBe(true);
    expect(decoded.identity.deviceId).toBe(generated.record.identity.deviceId);
    expect(decoded.identity.keys.signing.privateKey).toEqual(
      generated.record.identity.keys.signing.privateKey,
    );
    expect(decoded.wire.certificateBytes).toEqual(generated.record.wire.certificateBytes);
    expect(decoded.wire.rosterSequence).toBe(1n);
    // The restored identity still passes strict verification.
    verifyRosterSnapshot(decoded.identity.ownRoster, NOW + 60_000);
    verifyPreKeyBundle(
      selfPrekeyBundle(decoded.identity),
      decoded.identity.ownRoster,
      NOW + 60_000,
    );
  });

  it('rebuilds an EnrollDeviceRequest from the stored record without regenerating keys', () => {
    const generated = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW });
    const original = generated.enrollRequest;
    const rebuilt = enrollRequestFromRecord(generated.record);
    expect(rebuilt.certificate?.certificateBytes).toEqual(original.certificate?.certificateBytes);
    expect(rebuilt.certificate?.rootSignature).toEqual(original.certificate?.rootSignature);
    expect(rebuilt.certificate?.deviceId).toBe(original.certificate?.deviceId);
    expect(rebuilt.roster?.rosterBytes).toEqual(original.roster?.rosterBytes);
    expect(rebuilt.roster?.digest).toEqual(original.roster?.digest);
    expect(rebuilt.signedPrekey?.publicKey).toEqual(original.signedPrekey?.publicKey);
    expect(rebuilt.oneTimePrekeys.map((p) => p.keyId)).toEqual(
      original.oneTimePrekeys.map((p) => p.keyId),
    );
    expect(rebuilt.prekeyBundleBytes).toEqual(original.prekeyBundleBytes);
    expect(rebuilt.prekeyBundleSignature).toEqual(original.prekeyBundleSignature);
  });

  it('persists and reloads through a real vault store under the reserved key', async () => {
    const vault = new TypedRatchetVault(new MemoryVaultStore());
    await vault.open();
    const generated = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW });
    await saveStoredEnrollment(vault, generated.record);
    const loaded = await loadStoredEnrollment(vault);
    expect(loaded?.identity.deviceId).toBe(generated.record.identity.deviceId);
    // The reserved key must never collide with a real session id (`sessionIdFor`
    // composes UUID conversation ids, which cannot start with NUL).
    expect(ENROLLMENT_RECORD_KEY.startsWith('\u0000')).toBe(true);
    expect(sessionIdFor('conv', 'a', 'b').startsWith('\u0000')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

interface TransportSpy {
  capabilityCalls: number;
  identityRootCalls: number;
  publishCalls: number[];
  /** The vault contents observed at each `enrollDevice` call. */
  vaultAtEnrollCall: (Uint8Array | undefined)[];
  enrollCalls: { deviceIds: string[] }[];
}

function fakeTransport(
  vault: RatchetSessionVault,
  options?: {
    readonly capabilityState?: number | undefined;
    readonly protocolVersions?: string[] | undefined;
    readonly remoteRoot?: boolean | undefined;
    readonly failEnrollOnce?: boolean | undefined;
  },
): { transport: EnrollmentTransport; spy: TransportSpy } {
  const state: TransportSpy = {
    capabilityCalls: 0,
    identityRootCalls: 0,
    publishCalls: [],
    vaultAtEnrollCall: [],
    enrollCalls: [],
  };
  let enrollAttempts = 0;
  const transport: EnrollmentTransport = {
    getCapability() {
      state.capabilityCalls += 1;
      return Promise.resolve({
        state:
          options?.capabilityState === undefined
            ? E2EE_CAPABILITY_STATE.EXPERIMENTAL_CANARY
            : options.capabilityState,
        supportedProtocolVersions: options?.protocolVersions ?? ['patches-e2ee-v1'],
      });
    },
    getIdentityRoot(actorId: string) {
      state.identityRootCalls += 1;
      expect(actorId).toBe(ACTOR_ID);
      if (options?.remoteRoot === true) {
        return Promise.resolve({
          actorId,
          generation: 1,
          publicKey: new Uint8Array(32).fill(7),
          rootBytes: new Uint8Array(8),
          selfSignature: new Uint8Array(64),
        } as never);
      }
      return Promise.resolve(undefined);
    },
    publishIdentityRoot(request) {
      state.publishCalls.push(request.identityRoot?.generation ?? -1);
      return Promise.resolve({});
    },
    async enrollDevice(request) {
      state.vaultAtEnrollCall.push(await vault.getOpaqueRecord(ENROLLMENT_RECORD_KEY));
      state.enrollCalls.push({ deviceIds: [request.certificate?.deviceId ?? ''] });
      enrollAttempts += 1;
      if (options?.failEnrollOnce === true && enrollAttempts === 1) {
        throw new Error('transport unavailable');
      }
      return {};
    },
  };
  return { transport, spy: state };
}

function freshVault(): TypedRatchetVault {
  const vault = new TypedRatchetVault(new MemoryVaultStore());
  // The orchestration contract mirrors production: e2ee-send opens its store before
  // enrollment runs against it. `open()`'s effects land on the first microtask, ahead
  // of every subsequent store call these tests make.
  void vault.open();
  return vault;
}

describe('enrollThisDevice orchestration', () => {
  it('bootstraps the root then enrolls, persisting keys BEFORE any network call', async () => {
    const vault = freshVault();
    const { transport, spy } = fakeTransport(vault);
    const outcome = await enrollThisDevice({
      actorId: ACTOR_ID,
      transport,
      vault,
      nowMs: () => NOW,
    });

    expect(outcome.status).toBe('enrolled');
    if (outcome.status !== 'enrolled') return;
    expect(outcome.createdRoot).toBe(true);
    expect(outcome.rosterSequence).toBe(1n);
    // Order: capability probe → root check → root publish (gen 1) → enroll.
    expect(spy.capabilityCalls).toBe(1);
    expect(spy.identityRootCalls).toBe(1);
    expect(spy.publishCalls).toEqual([1]);
    expect(spy.enrollCalls).toHaveLength(1);
    // The record was durable before EnrollDevice ran.
    expect(spy.vaultAtEnrollCall[0]).toBeDefined();

    const stored = await loadStoredEnrollment(vault);
    expect(stored?.submitted).toBe(true);
  });

  it('is idempotent once submitted — no further network traffic', async () => {
    const vault = freshVault();
    const first = fakeTransport(vault);
    await enrollThisDevice({
      actorId: ACTOR_ID,
      transport: first.transport,
      vault,
      nowMs: () => NOW,
    });
    const second = fakeTransport(vault);
    const outcome = await enrollThisDevice({
      actorId: ACTOR_ID,
      transport: second.transport,
      vault,
      nowMs: () => NOW,
    });
    expect(outcome.status).toBe('already-enrolled');
    if (outcome.status === 'already-enrolled') {
      expect(outcome.identity.deviceId).toBe(
        (await loadStoredEnrollment(vault))?.identity.deviceId,
      );
    }
    expect(second.spy.capabilityCalls).toBe(0);
    expect(second.spy.enrollCalls).toHaveLength(0);
  });

  it('refuses without touching the vault when the node has E2EE off', async () => {
    const vault = freshVault();
    const { transport, spy } = fakeTransport(vault, {
      capabilityState: E2EE_CAPABILITY_STATE.DISABLED,
    });
    const outcome = await enrollThisDevice({ actorId: ACTOR_ID, transport, vault });
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.reason).toBe('capability-off');
    expect(outcome.copy).toBe(ENROLLMENT_REFUSAL_COPY.capabilityOff);
    expect(await loadStoredEnrollment(vault)).toBeUndefined();
    expect(spy.identityRootCalls).toBe(0);
  });

  it('refuses every non-usable capability state, including a failed probe', async () => {
    for (const state of [
      E2EE_CAPABILITY_STATE.UNSPECIFIED,
      E2EE_CAPABILITY_STATE.DISABLED,
      undefined,
    ]) {
      const vault = freshVault();
      const options =
        state === undefined
          ? { protocolVersions: ['patches-e2ee-v1'], capabilityState: -1 }
          : { capabilityState: state, protocolVersions: ['patches-e2ee-v1'] };
      const { transport } = fakeTransport(vault, options);
      const outcome = await enrollThisDevice({ actorId: ACTOR_ID, transport, vault });
      expect(outcome.status).toBe('refused');
    }
    // A probe that throws is treated like "capability unknown" — refused, not guessed.
    const vault = freshVault();
    const failingProbe: EnrollmentTransport = {
      getCapability: () => Promise.reject(new Error('down')),
      getIdentityRoot: () => Promise.resolve(undefined),
      publishIdentityRoot: () => Promise.resolve({}),
      enrollDevice: () => Promise.resolve({}),
    };
    const outcome = await enrollThisDevice({ actorId: ACTOR_ID, transport: failingProbe, vault });
    expect(outcome.status).toBe('refused');
  });

  it('requires the node to speak patches-e2ee-v1', async () => {
    const vault = freshVault();
    const { transport } = fakeTransport(vault, { protocolVersions: ['patches-e2ee-v9'] });
    const outcome = await enrollThisDevice({ actorId: ACTOR_ID, transport, vault });
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.reason).toBe('capability-off');
  });

  it('refuses when the account already publishes another device’s root', async () => {
    const vault = freshVault();
    const { transport, spy } = fakeTransport(vault, { remoteRoot: true });
    const outcome = await enrollThisDevice({ actorId: ACTOR_ID, transport, vault });
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.reason).toBe('remote-root');
    expect(outcome.copy).toBe(ENROLLMENT_REFUSAL_COPY.remoteRoot);
    expect(await loadStoredEnrollment(vault)).toBeUndefined();
    expect(spy.publishCalls).toHaveLength(0);
  });

  it('resumes verbatim after a failed submission instead of minting orphan keys', async () => {
    const vault = freshVault();
    const failing = fakeTransport(vault, { failEnrollOnce: true });
    await expect(
      enrollThisDevice({
        actorId: ACTOR_ID,
        transport: failing.transport,
        vault,
        nowMs: () => NOW,
      }),
    ).rejects.toThrow('transport unavailable');
    // The record exists but is not yet submitted.
    const partial = await loadStoredEnrollment(vault);
    expect(partial?.submitted).toBe(false);

    const retry = fakeTransport(vault);
    const outcome = await enrollThisDevice({
      actorId: ACTOR_ID,
      transport: retry.transport,
      vault,
      nowMs: () => NOW + 5_000,
    });
    expect(outcome.status).toBe('enrolled');
    // Identical device material across attempts.
    expect(retry.spy.enrollCalls[0]?.deviceIds[0]).toBe(failing.spy.enrollCalls[0]?.deviceIds[0]);
    // The bootstrap publish happened exactly once across both attempts.
    expect(failing.spy.publishCalls).toEqual([1]);
    expect(retry.spy.publishCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Shell transport adapters
// ---------------------------------------------------------------------------

const identityFixture = generateEnrollment({ actorId: ACTOR_ID, nowMs: NOW }).record.identity;

function fakeApiSurface(overrides: Partial<E2eeApiSurface> = {}): E2eeApiSurface {
  const base = {
    target: 'patches.test:50051',
    getE2eeCapability: vi.fn(() =>
      Promise.resolve(
        create(GetE2eeCapabilityResponseSchema, {
          capability: { state: E2EE_CAPABILITY_STATE.EXPERIMENTAL_CANARY },
        }),
      ),
    ),
    getIdentityRoot: vi.fn(() => Promise.resolve({} as never)),
    publishIdentityRoot: vi.fn(() => Promise.resolve({})),
    enrollDevice: vi.fn(() => Promise.resolve({})),
    getE2eeConversationState: vi.fn(() => Promise.resolve({} as never)),
    sendEnvelopes: vi.fn(() => Promise.resolve({})),
    listMailboxEnvelopes: vi.fn(() => Promise.resolve({} as never)),
    acknowledgeEnvelopes: vi.fn(() => Promise.resolve({})),
  };
  return { ...base, ...overrides } as E2eeApiSurface;
}

describe('createE2eeTransports adapter', () => {
  it('maps conversation state into a fanout plan over every active member device', async () => {
    const api = fakeApiSurface();
    (api.getE2eeConversationState as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      conversationId: 'conv-1',
      membershipEpoch: 3n,
      members: [
        {
          actorId: ACTOR_ID,
          activeDeviceIds: ['device-self', 'device-other'],
          supportsE2eeV1: true,
        },
        { actorId: 'actor-2', activeDeviceIds: ['peer-device'], supportsE2eeV1: true },
      ],
    });
    const transports = createE2eeTransports({
      api,
      accessToken: () => Promise.resolve('token-1'),
      identity: identityFixture,
    });
    const plan: FanoutPlan = await transports.loadFanoutPlan('conv-1');
    expect(plan.conversationId).toBe('conv-1');
    expect(plan.membershipEpoch).toBe(3n);
    expect(plan.targets).toEqual([
      { actorId: ACTOR_ID, deviceId: 'device-self' },
      { actorId: ACTOR_ID, deviceId: 'device-other' },
      { actorId: 'actor-2', deviceId: 'peer-device' },
    ]);
  });

  it('fails prekey claims closed without consuming inventory', async () => {
    const transports = createE2eeTransports({
      api: fakeApiSurface(),
      accessToken: () => Promise.resolve('token-1'),
      identity: identityFixture,
    });
    await expect(
      transports.claimPrekeyBundles({ conversationId: 'c', actorIds: ['x'] }),
    ).rejects.toBeInstanceOf(E2eeSetupUnavailableError);
  });

  it('serves its own crypto-native roster locally, refusing other actors', async () => {
    const transports = createE2eeTransports({
      api: fakeApiSurface(),
      accessToken: () => Promise.resolve('token-1'),
      identity: identityFixture,
    });
    const own = await transports.loadPeerRoster(ACTOR_ID);
    expect(own.roster.devices[0]?.certificate.deviceId).toBe(identityFixture.deviceId);
    await expect(transports.loadPeerRoster('actor-2')).rejects.toBeInstanceOf(
      E2eeSetupUnavailableError,
    );
  });

  it('drains the mailbox for THIS device and acknowledges through the api', async () => {
    const envelope = {
      envelopeId: 'env-9',
      logicalMessageId: 'lm-1',
      conversationId: sessionIdFor('conv-1', 'a', 'b'),
      membershipEpoch: 1n,
      senderActorId: 'actor-2',
      senderDeviceId: 'peer-device',
      recipientDeviceId: identityFixture.deviceId,
      encryptedHeader: new Uint8Array(4),
      ciphertext: new Uint8Array(8),
      openingCiphertext: new Uint8Array(0),
      ciphertextDigest: sha256Hash(new Uint8Array(8)),
      frankingCommitment: new Uint8Array(32),
      frankingTag: { profile: 'patches-franking-v1' },
      fanoutDigest: new Uint8Array(32),
    };
    const listMailboxEnvelopes = vi.fn(() =>
      Promise.resolve({
        envelopes: [envelope],
        page: { nextCursor: 'cursor-next' },
      }),
    );
    const acknowledgeEnvelopes = vi.fn(() => Promise.resolve({}));
    const transports = createE2eeTransports({
      api: fakeApiSurface({
        listMailboxEnvelopes,
        acknowledgeEnvelopes,
      } as unknown as Partial<E2eeApiSurface>),
      accessToken: () => Promise.resolve('token-1'),
      identity: identityFixture,
    });
    const page = await transports.listMailboxPage('');
    expect(page.nextCursor).toBe('cursor-next');
    expect(page.envelopes[0]?.frankingTag?.profile).toBe('patches-franking-v1');
    await transports.acknowledge(['env-9']);
    expect(acknowledgeEnvelopes).toHaveBeenCalledWith(
      { deviceId: identityFixture.deviceId, envelopeIds: ['env-9'] },
      'token-1',
    );
  });
});

describe('createEnrollmentTransport adapter', () => {
  it('reads NOT_FOUND on GetIdentityRoot as "no root published yet"', async () => {
    const api = fakeApiSurface({
      getIdentityRoot: () => Promise.reject(Object.assign(new Error('nf'), { code: 5 })),
    });
    const transport = createEnrollmentTransport({ api, accessToken: () => Promise.resolve('t') });
    await expect(transport.getIdentityRoot(ACTOR_ID)).resolves.toBeUndefined();
  });

  it('surfaces every other GetIdentityRoot failure instead of reading it as absence', async () => {
    const api = fakeApiSurface({
      getIdentityRoot: () => Promise.reject(Object.assign(new Error('unavailable'), { code: 14 })),
    });
    const transport = createEnrollmentTransport({ api, accessToken: () => Promise.resolve('t') });
    await expect(transport.getIdentityRoot(ACTOR_ID)).rejects.toThrow('unavailable');
  });

  it('exposes the peer-warning copy the screens render (ADR 0020 §3)', () => {
    expect(ENROLLMENT_PEER_WARNING_COPY).toContain('security notice');
  });
});

// ---------------------------------------------------------------------------
// Shell binding — the vault-backed sender owns enrollment and identity restore
// ---------------------------------------------------------------------------

import { createVaultE2eeSender } from '../src/app/e2ee-send.js';
import type { E2eeTransports } from '../src/app/e2ee-send.js';
import type { RatchetSessionVault } from '../src/e2ee/ratchet-vault.js';

function stubTransports(): E2eeTransports {
  return {
    loadFanoutPlan: () => Promise.resolve({ conversationId: '', membershipEpoch: 1n, targets: [] }),
    claimPrekeyBundles: () => Promise.resolve([]),
    sendEnvelopes: () => Promise.resolve({}),
    listMailboxPage: () => Promise.resolve({ envelopes: [], nextCursor: '' }),
    acknowledge: () => Promise.resolve(),
    loadPeerRoster: () => Promise.resolve(identityFixture.ownRoster),
  };
}

/**
 * A minimal vault whose RECORDS live in a caller-shared map, so two sender instances
 * can model "restart": each opens its own store object, both see the same bytes —
 * exactly how two processes share the encrypted vault FILE.
 */
function sharedMapVault(shared: Map<string, Uint8Array>): RatchetSessionVault {
  return {
    open: () =>
      Promise.resolve({ generation: 1, adoptedStagedSessions: [], discardedTempFiles: [] }),
    listSessions: () => Promise.resolve([]),
    getSession: () => Promise.resolve(undefined),
    stageRecord: () => Promise.resolve(),
    confirmSend: () => Promise.resolve(),
    applyUpdate: () => Promise.resolve(),
    deleteSession: () => Promise.resolve(),
    getOpaqueRecord: (key: string) => Promise.resolve(shared.get(key)?.slice()),
    putOpaqueRecord: (key: string, value: Uint8Array) => {
      shared.set(key, value.slice());
      return Promise.resolve();
    },
    wipe: () => {
      shared.clear();
      return Promise.resolve();
    },
    close: () => {},
  } as unknown as RatchetSessionVault;
}

describe('createVaultE2eeSender binding', () => {
  it('flips enrolled() true after a successful enrollment through its own vault', async () => {
    // The sender opens its injected store itself (ensureOpen) — hand it one unopened.
    const vault = new TypedRatchetVault(new MemoryVaultStore());
    const { transport } = fakeTransport(vault);
    const sender = createVaultE2eeSender({
      account: { nodeOrigin: 'patches.test', userId: ACTOR_ID },
      allowInsecureKeyFile: false,
      vault,
      buildTransports: stubTransports,
    });
    expect(sender.enrolled()).toBe(false);
    const outcome = await sender.enroll({ actorId: ACTOR_ID, transport });
    expect(outcome.status).toBe('enrolled');
    // B-107's headline: the runtime is no longer dormant behind `enrolled()`.
    expect(sender.enrolled()).toBe(true);
    sender.close();
  });

  it('restores a submitted enrollment into a fresh sender (session restart)', async () => {
    const shared = new Map<string, Uint8Array>();
    const makeSender = (): ReturnType<typeof createVaultE2eeSender> =>
      createVaultE2eeSender({
        account: { nodeOrigin: 'patches.test', userId: ACTOR_ID },
        allowInsecureKeyFile: false,
        vault: sharedMapVault(shared),
        buildTransports: stubTransports,
      });
    const first = makeSender();
    await first.enroll({
      actorId: ACTOR_ID,
      transport: fakeTransport(sharedMapVault(shared)).transport,
    });
    expect(first.enrolled()).toBe(true);
    first.close();

    // A "restart": same shared records, brand-new sender instance.
    const second = makeSender();
    expect(second.enrolled()).toBe(false);
    const restored = await second.restoreEnrollment();
    expect(restored).toBeDefined();
    expect(second.enrolled()).toBe(true);
    second.close();
  });

  it('unbinds on wipe so a wiped account starts over', async () => {
    const vault = new TypedRatchetVault(new MemoryVaultStore());
    const { transport } = fakeTransport(vault);
    const sender = createVaultE2eeSender({
      account: { nodeOrigin: 'patches.test', userId: ACTOR_ID },
      allowInsecureKeyFile: false,
      vault,
      buildTransports: stubTransports,
    });
    await sender.enroll({ actorId: ACTOR_ID, transport });
    expect(sender.enrolled()).toBe(true);
    await sender.wipe();
    expect(sender.enrolled()).toBe(false);
    expect(sender.fault()).toBeUndefined();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
