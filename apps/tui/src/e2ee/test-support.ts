import {
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  initializeInitiatorRatchet,
  randomBytes,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  verifyCertifiedDevice,
  verifyMessagingRoot,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
  type DoubleRatchetState,
  type KeyPair,
  type VerifiedPreKeyBundle,
  type X3dhSecrets,
} from '@patches/crypto';

import { selfPrekeyBundle, type LocalDeviceIdentity } from './local-identity.js';
import type { KeyringModuleLike, VaultAccount } from './vault-key-providers.js';
import type { VaultFileHandle, VaultFileOperations } from './vault-file-operations.js';

/** Test-only helpers for the vault suite: an in-memory filesystem with crash/fault
 * injection, a fake keyring, and synthetic Double Ratchet states. Never imported by
 * production code — the TUI's real fs/keyring seams are constructor-injected instead. */

export const TEST_ACCOUNT: VaultAccount = {
  nodeOrigin: 'patches.example:443',
  userId: 'user-1',
};

/** Steps a commit passes through; `MemoryVaultFs.crashAt`/`failAt` fire on these. */
export type FaultPoint = 'write' | 'sync' | 'chmod' | 'rename' | 'syncDirectory' | 'readdir';

export class SimulatedCrash extends Error {
  constructor() {
    super('simulated crash');
    this.name = 'SimulatedCrash';
  }
}

export class MemoryVaultFs implements VaultFileOperations {
  readonly files = new Map<string, Uint8Array>();
  readonly modes = new Map<string, number>();
  /** Pids considered alive for `isProcessAlive`; seeded with our own pid. */
  readonly alivePids = new Set<number>([process.pid]);
  /** Throws `SimulatedCrash` once when this step is next reached, before its effect. */
  crashAt: FaultPoint | undefined;
  /** Throws a plain `Error` once when this step is next reached. */
  failAt: FaultPoint | undefined;

  private checkpoint(point: FaultPoint): void {
    if (this.crashAt === point) {
      this.crashAt = undefined;
      throw new SimulatedCrash();
    }
    if (this.failAt === point) {
      this.failAt = undefined;
      throw new Error(`injected failure at ${point}`);
    }
  }

  mkdir(path: string): Promise<unknown> {
    this.modes.set(path, 0o700);
    return Promise.resolve(undefined);
  }

  openWriteExclusive(path: string, mode: number): Promise<VaultFileHandle> {
    if (this.files.has(path)) {
      const error = new Error('EEXIST') as NodeJS.ErrnoException;
      error.code = 'EEXIST';
      return Promise.reject(error);
    }
    this.files.set(path, new Uint8Array(0));
    this.modes.set(path, mode);
    const files = this.files;
    const checkpoint = (point: FaultPoint) => this.checkpoint(point);
    return Promise.resolve({
      writeFile(data: Uint8Array): Promise<void> {
        checkpoint('write');
        files.set(path, data.slice());
        return Promise.resolve();
      },
      sync(): Promise<void> {
        checkpoint('sync');
        return Promise.resolve();
      },
      close(): Promise<void> {
        return Promise.resolve();
      },
    });
  }

  readFile(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (file === undefined) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      return Promise.reject(error);
    }
    return Promise.resolve(file.slice());
  }

  rename(from: string, to: string): Promise<void> {
    return Promise.resolve().then(() => this.renameSync(from, to));
  }

  private renameSync(from: string, to: string): void {
    this.checkpoint('rename');
    const file = this.files.get(from);
    if (file === undefined) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    this.files.delete(from);
    this.files.set(to, file);
    this.modes.set(to, this.modes.get(from) ?? 0o600);
  }

  readdir(path: string): Promise<string[]> {
    return Promise.resolve().then(() => {
      this.checkpoint('readdir');
      const prefix = `${path}/`;
      return [...this.files.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length));
    });
  }

  rm(path: string): Promise<void> {
    this.files.delete(path);
    this.modes.delete(path);
    return Promise.resolve();
  }

  chmod(path: string, mode: number): Promise<void> {
    return Promise.resolve().then(() => {
      this.checkpoint('chmod');
      this.modes.set(path, mode);
    });
  }

  syncDirectory(): Promise<void> {
    return Promise.resolve().then(() => this.checkpoint('syncDirectory'));
  }

  isProcessAlive(pid: number): boolean {
    return this.alivePids.has(pid);
  }
}

/** A fake `@napi-rs/keyring` module backed by a Map — hermetic, no host keyring. */
export function fakeKeyring(): { keyring: KeyringModuleLike; entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    keyring: {
      Entry: class {
        private readonly id: string;
        constructor(service: string, account: string) {
          this.id = `${service}\u0000${account}`;
        }
        getPassword(): string | null {
          return entries.get(this.id) ?? null;
        }
        setPassword(password: string): void {
          entries.set(this.id, password);
        }
        deletePassword(): boolean {
          return entries.delete(this.id);
        }
      },
    },
  };
}

/** A minimal but real initiator Double Ratchet state (sending chain initialized). */
export function testRatchetState(): DoubleRatchetState {
  const secrets: X3dhSecrets = {
    rootKey: randomBytes(32),
    initiatorHeaderKey: randomBytes(32),
    responderHeaderKey: randomBytes(32),
  };
  const initiatorRatchetKey: KeyPair = generateKeyAgreementKeyPair();
  const responderRatchetKey = generateKeyAgreementKeyPair();
  return initializeInitiatorRatchet(secrets, initiatorRatchetKey, responderRatchetKey.publicKey);
}

/** Wraps a provider so the next `advanceGeneration` call fails once (simulating a
 * crash between the atomic file commit and the keyring anchor update). */
export function failAdvanceOnce(provider: {
  loadOrCreate: () => Promise<unknown>;
  advanceGeneration: (generation: number) => Promise<void>;
  delete: () => Promise<void>;
  persistent: boolean;
}): {
  loadOrCreate: () => Promise<unknown>;
  advanceGeneration: (generation: number) => Promise<void>;
  delete: () => Promise<void>;
  persistent: boolean;
} {
  let failed = false;
  return {
    persistent: provider.persistent,
    loadOrCreate: () => provider.loadOrCreate(),
    async advanceGeneration(generation: number) {
      if (!failed) {
        failed = true;
        throw new SimulatedCrash();
      }
      return provider.advanceGeneration(generation);
    },
    delete: () => provider.delete(),
  };
}

// ---------------------------------------------------------------------------
// A complete local messaging identity built from crypto primitives — shared by the
// B-101 runtime/chain tests so every suite exercises the same shape of enrolled device.
// ---------------------------------------------------------------------------

export function testLocalIdentity(
  actorId: string,
  deviceId: string,
): { readonly local: LocalDeviceIdentity; readonly bundle: VerifiedPreKeyBundle } {
  const nowMs = Date.now();
  const createdAtMs = 1;
  const expiresAtMs = nowMs + 24 * 60 * 60 * 1000;
  const rootKeys = generateSigningKeyPair();
  const signing = generateSigningKeyPair();
  const agreement = generateKeyAgreementKeyPair();

  const signedRoot = signMessagingRoot(rootKeys.privateKey, {
    actorId,
    generation: 1,
    publicKey: rootKeys.publicKey,
    createdAtMs,
  });
  const root = verifyMessagingRoot({
    rootBytes: signedRoot.rootBytes,
    selfSignature: signedRoot.selfSignature,
    nowMs,
  });

  const signedCertificate = signDeviceCertificate(rootKeys.privateKey, {
    actorId,
    deviceId,
    rootGeneration: 1,
    rootPublicKey: rootKeys.publicKey,
    certificateVersion: 1,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    supportedProtocolVersions: ['patches-e2ee-v1'],
    createdAtMs,
    expiresAtMs,
  });
  const selfDevice = verifyCertifiedDevice({
    certificateBytes: signedCertificate.certificateBytes,
    rootSignature: signedCertificate.rootSignature,
    root,
    nowMs,
  });

  const signedRoster = signDeviceRoster(rootKeys.privateKey, {
    actorId,
    rootGeneration: 1,
    rootPublicKey: rootKeys.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(32),
    createdAtMs,
    entries: [
      {
        deviceId,
        certificateDigest: signedCertificate.certificateDigest,
        active: true,
        addedAtMs: createdAtMs,
      },
    ],
  });
  const ownRoster = verifyRosterSnapshot({
    rosterBytes: signedRoster.rosterBytes,
    rootSignature: signedRoster.rootSignature,
    root,
    certificates: [
      {
        certificateBytes: signedCertificate.certificateBytes,
        rootSignature: signedCertificate.rootSignature,
      },
    ],
    nowMs,
  });

  const signedPreKeyId = 7;
  const signedPreKeyPair = generateKeyAgreementKeyPair();
  const signedBundle = signPreKeyBundle(signing.privateKey, {
    actorId,
    deviceId,
    certificateDigest: signedCertificate.certificateDigest,
    signedPrekeyId: signedPreKeyId,
    signedPrekeyPublicKey: signedPreKeyPair.publicKey,
    createdAtMs,
    expiresAtMs,
  });

  const oneTimePreKey = { id: 91, keyPair: generateKeyAgreementKeyPair() };
  const local: LocalDeviceIdentity = {
    actorId,
    deviceId,
    keys: { signing, agreement },
    selfDevice,
    ownRoster,
    signedPreKey: { id: signedPreKeyId, keyPair: signedPreKeyPair, createdAtMs, expiresAtMs },
    ownBundle: {
      bundleBytes: signedBundle.bundleBytes,
      deviceSignature: signedBundle.deviceSignature,
    },
    oneTimePreKeys: [oneTimePreKey],
  };
  const bundle = selfPrekeyBundle(
    local,
    { id: oneTimePreKey.id, publicKey: oneTimePreKey.keyPair.publicKey },
    nowMs,
  );
  return { local, bundle };
}

// ---------------------------------------------------------------------------
// ADR 0037 device-link fakes — enrollment.test.ts / device-link.test.ts
// ---------------------------------------------------------------------------

import { create } from '@bufbuild/protobuf';
import {
  E2eeIdentityRootSchema,
  E2eeServiceBeginDeviceLinkResponseSchema,
  E2eeServiceListPendingDeviceLinksResponseSchema,
  GetPrekeyInventoryResponseSchema,
  UploadPrekeysResponseSchema,
  type E2eeDeviceCertificate,
  type E2eeDeviceLinkOffer,
  type E2eeDeviceRoster,
  type E2eeIdentityRoot,
  type E2eeServiceBeginDeviceLinkRequest,
  type E2eeServiceBeginDeviceLinkResponse,
  type E2eeServiceListPendingDeviceLinksResponse,
  type EnrollDeviceRequest,
  type GetPrekeyInventoryResponse,
  type PublishIdentityRootRequest,
  type RevokeDeviceRequest,
  type UploadPrekeysRequest,
  type UploadPrekeysResponse,
} from '@patches/proto/es';
import { vi, type Mock } from 'vitest';
import {
  activeDeviceIds,
  E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
  E2EE_ONE_TIME_PREKEY_TARGET,
  E2EE_PROTOCOL_V1,
} from '@patches/domain';

import { rosterViewFromWire } from './chain.js';
import { toDate } from '../api/wire/time.js';
import type {
  EnrollmentCapability,
  EnrollmentDeviceRoster,
  EnrollmentTransport,
} from './enrollment.js';
import type { RatchetSessionVault } from './ratchet-vault.js';
import type { VaultOpenInfo } from './vault-store.js';
import type {
  ClaimedPeerBundle,
  E2eeMailboxEnvelopeLike,
  E2eeMailboxTransport,
  E2eeSendTransport,
} from './runtime.js';
import type { VerifiedRosterSnapshot } from '@patches/crypto';

export const USABLE_CAPABILITY: EnrollmentCapability = {
  state: 3,
  supportedProtocolVersions: [E2EE_PROTOCOL_V1],
};

/** Only the opaque-record half of the vault is exercised by enrollment/device-link; the
 * ratchet methods throw so an accidental dependency on them fails loudly instead of
 * silently. */
export function memoryVault(): RatchetSessionVault & { readonly records: Map<string, Uint8Array> } {
  const records = new Map<string, Uint8Array>();
  const unused = (): never => {
    throw new Error('enrollment/device-link must not touch ratchet session state');
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

export function publishedRoot(actorId: string, publicKey: Uint8Array): E2eeIdentityRoot {
  return create(E2eeIdentityRootSchema, { actorId, generation: 1, publicKey });
}

/** One in-memory "node": rosters by actor, and pending link offers by actor — enough
 * state for `beginDeviceLinkOffer` -> `approveLinkOffer` -> `pollLinkedEnrollment` to run
 * end to end against fakes without a real server (ADR 0037 §1). */
/**
 * A device's server-side prekey bookkeeping (issue #278) — the fake's stand-in for the node's
 * `E2eeSignedPrekeyEntity`/`E2eeOneTimePrekeyKeyIdEntity` rows. `issuedOneTimePrekeyIds` is the
 * immutable per-device ledger the real server enforces (`E2eeOneTimePrekeyKeyIdEntity`'s primary
 * key): once an id lands here, `uploadPrekeys` below refuses it a second time, regardless of
 * whether it is still "unconsumed".
 */
export interface FakePrekeyState {
  readonly issuedOneTimePrekeyIds: Set<string>;
  readonly unconsumedOneTimePrekeyIds: Set<string>;
  signedPrekeyId: bigint;
  signedPrekeyCreatedAtMs: number;
}

export interface FakeE2eeNode {
  readonly rosterByActor: Map<string, EnrollmentDeviceRoster>;
  readonly pendingOffersByActor: Map<string, E2eeDeviceLinkOffer[]>;
  /** Backs `getIdentityRoot`/`publishIdentityRoot` (ADR 0037 §2's `rotateMessagingRoot`) —
   * absent until some transport bound to this node calls `publishIdentityRoot`. */
  readonly rootByActor: Map<string, E2eeIdentityRoot>;
  /** Per-device mailbox queues — backs `fakeMessagingMailboxTransport`/`sendEnvelopes`. */
  readonly mailboxesByDevice: Map<string, E2eeMailboxEnvelopeLike[]>;
  /** Enrolled devices' local identities, registered via `registerMessagingDevice` — the
   * fake's stand-in for the node's own prekey store, so `claimPrekeyBundles` has bundles to
   * hand out for every active device of a claimed actor. */
  readonly messagingIdentities: Map<string, LocalDeviceIdentity>;
  /** Backs `getPrekeyInventory`/`uploadPrekeys` (issue #278) — seeded by `enrollDevice` from
   * whatever the enrolling device submitted, and mutated only by `uploadPrekeys` and the
   * `consumeOneTimePrekeys` test helper below. */
  readonly prekeyState: Map<string, FakePrekeyState>;
}

export function createFakeE2eeNode(): FakeE2eeNode {
  return {
    rosterByActor: new Map(),
    pendingOffersByActor: new Map(),
    rootByActor: new Map(),
    mailboxesByDevice: new Map(),
    messagingIdentities: new Map(),
    prekeyState: new Map(),
  };
}

/** Test-only simulation of the node handing out (claiming) one-time prekeys — removes up to
 * `count` arbitrary ids from the device's unconsumed set without touching the issued-id ledger,
 * mirroring what `ClaimPrekeyBundles` does server-side. Used to build a "remaining ≤ threshold"
 * fixture without hand-rolling ledger state. */
export function consumeOneTimePrekeys(node: FakeE2eeNode, deviceId: string, count: number): void {
  const state = node.prekeyState.get(deviceId);
  if (state === undefined) throw new Error('fake node: consumeOneTimePrekeys for unknown device');
  let remaining = count;
  for (const id of state.unconsumedOneTimePrekeyIds) {
    if (remaining <= 0) break;
    state.unconsumedOneTimePrekeyIds.delete(id);
    remaining -= 1;
  }
}

/** Publishes (replaces) one actor's served roster + certificates on the fake node —
 * what `approveLinkOffer`/`rotateMessagingRoot` and `pollLinkedEnrollment`/`listLinkOffers`
 * read and write across two different transport instances bound to the same node. */
export function setFakeRoster(
  node: FakeE2eeNode,
  actorId: string,
  roster: E2eeDeviceRoster,
  certificates: readonly E2eeDeviceCertificate[],
): void {
  node.rosterByActor.set(actorId, { roster, certificates: [...certificates] });
}

export interface FakeTransport extends EnrollmentTransport {
  readonly getCapability: Mock<() => Promise<EnrollmentCapability | undefined>>;
  readonly getIdentityRoot: Mock<(actorId: string) => Promise<E2eeIdentityRoot | undefined>>;
  readonly publishIdentityRoot: Mock<(request: PublishIdentityRootRequest) => Promise<unknown>>;
  readonly enrollDevice: Mock<(request: EnrollDeviceRequest) => Promise<unknown>>;
  readonly getDeviceRoster: Mock<(actorId: string) => Promise<EnrollmentDeviceRoster>>;
  readonly beginDeviceLink: Mock<
    (request: E2eeServiceBeginDeviceLinkRequest) => Promise<E2eeServiceBeginDeviceLinkResponse>
  >;
  readonly listPendingDeviceLinks: Mock<() => Promise<E2eeServiceListPendingDeviceLinksResponse>>;
  readonly cancelDeviceLink: Mock<(linkId: string) => Promise<unknown>>;
  readonly revokeDevice: Mock<(request: RevokeDeviceRequest) => Promise<unknown>>;
  readonly getPrekeyInventory: Mock<(deviceId: string) => Promise<GetPrekeyInventoryResponse>>;
  readonly uploadPrekeys: Mock<(request: UploadPrekeysRequest) => Promise<UploadPrekeysResponse>>;
}

let fakeLinkIdCounter = 0;

/**
 * One transport double bound to `actorId` — mirrors how a real client's transport is
 * bound to the calling device's authenticated actor. `node` is shared across every
 * `fakeTransport(...)` instance in a test so the offer-side and authority-side (and, for
 * rotation, the same device on both sides of a `getDeviceRoster` round trip) observe each
 * other's writes, exactly as two devices talking to the same node would.
 */
export function fakeTransport(options: { actorId: string; node?: FakeE2eeNode }): FakeTransport {
  const node = options.node ?? createFakeE2eeNode();
  const actorId = options.actorId;
  return {
    getCapability: vi.fn<() => Promise<EnrollmentCapability | undefined>>(() =>
      Promise.resolve(USABLE_CAPABILITY),
    ),
    getIdentityRoot: vi.fn<(actorId: string) => Promise<E2eeIdentityRoot | undefined>>(
      (forActorId) => Promise.resolve(node.rootByActor.get(forActorId)),
    ),
    // Fakes the server's persistence only (not its verification — that is exactly what
    // `enrollThisDevice`/`device-link.ts` already re-verify client-side before calling this).
    // A rotation's `PublishIdentityRoot` call carries the new root plus roster S+1 (every prior
    // entry inactive, no new device yet — the node's own real `appendRoster` requires an active
    // entry's device to already have a saved certificate, which the following `EnrollDevice`
    // call provides); bootstrap's generation-1 call carries no roster at all.
    publishIdentityRoot: vi.fn<(request: PublishIdentityRootRequest) => Promise<unknown>>(
      (request) => {
        const root = request.identityRoot;
        if (root === undefined) throw new Error('fake node: PublishIdentityRoot with no root');
        node.rootByActor.set(actorId, root);
        if (request.roster !== undefined) {
          const existing = node.rosterByActor.get(actorId);
          node.rosterByActor.set(actorId, {
            roster: request.roster,
            certificates: existing?.certificates ?? [],
          });
        }
        return Promise.resolve(undefined);
      },
    ),
    enrollDevice: vi.fn<(request: EnrollDeviceRequest) => Promise<unknown>>((request) => {
      const certificate = request.certificate;
      const roster = request.roster;
      if (certificate === undefined || roster === undefined) {
        throw new Error('fake node: EnrollDevice missing certificate or roster');
      }
      const existing = node.rosterByActor.get(actorId);
      node.rosterByActor.set(actorId, {
        roster,
        certificates: [...(existing?.certificates ?? []), certificate],
      });
      // Issue #278: seeds this device's prekey bookkeeping from exactly what it enrolled with,
      // so `getPrekeyInventory`/`uploadPrekeys` see the same starting inventory a real node
      // would have persisted from the same `EnrollDeviceRequest`.
      const signedPrekey = request.signedPrekey;
      if (signedPrekey !== undefined) {
        const issued = new Set(request.oneTimePrekeys.map((prekey) => String(prekey.keyId)));
        node.prekeyState.set(certificate.deviceId, {
          issuedOneTimePrekeyIds: issued,
          unconsumedOneTimePrekeyIds: new Set(issued),
          signedPrekeyId: signedPrekey.keyId,
          signedPrekeyCreatedAtMs: toDate(signedPrekey.createdAt)?.getTime() ?? Date.now(),
        });
      }
      return Promise.resolve(undefined);
    }),
    getDeviceRoster: vi.fn<(actorId: string) => Promise<EnrollmentDeviceRoster>>((forActorId) =>
      Promise.resolve(
        node.rosterByActor.get(forActorId) ?? { roster: undefined, certificates: [] },
      ),
    ),
    beginDeviceLink: vi.fn<
      (request: E2eeServiceBeginDeviceLinkRequest) => Promise<E2eeServiceBeginDeviceLinkResponse>
    >((request) => {
      const offer = request.offer;
      if (offer === undefined) throw new Error('fake node: BeginDeviceLink with no offer');
      fakeLinkIdCounter += 1;
      const linkId = `fake-link-${String(fakeLinkIdCounter)}`;
      const stored: E2eeDeviceLinkOffer = { ...offer, linkId };
      const existing = node.pendingOffersByActor.get(actorId) ?? [];
      node.pendingOffersByActor.set(actorId, [...existing, stored]);
      return Promise.resolve(
        create(E2eeServiceBeginDeviceLinkResponseSchema, { linkId, expiresAt: offer.createdAt }),
      );
    }),
    listPendingDeviceLinks: vi.fn<() => Promise<E2eeServiceListPendingDeviceLinksResponse>>(() =>
      Promise.resolve(
        create(E2eeServiceListPendingDeviceLinksResponseSchema, {
          offers: node.pendingOffersByActor.get(actorId) ?? [],
        }),
      ),
    ),
    cancelDeviceLink: vi.fn<(linkId: string) => Promise<unknown>>((linkId) => {
      const existing = node.pendingOffersByActor.get(actorId) ?? [];
      node.pendingOffersByActor.set(
        actorId,
        existing.filter((candidate) => candidate.linkId !== linkId),
      );
      return Promise.resolve(undefined);
    }),
    revokeDevice: vi.fn<(request: RevokeDeviceRequest) => Promise<unknown>>((request) => {
      const roster = request.roster;
      if (roster === undefined) throw new Error('fake node: RevokeDevice with no roster');
      const existing = node.rosterByActor.get(actorId);
      node.rosterByActor.set(actorId, { roster, certificates: existing?.certificates ?? [] });
      return Promise.resolve(undefined);
    }),
    getPrekeyInventory: vi.fn<(deviceId: string) => Promise<GetPrekeyInventoryResponse>>(
      (deviceId) => {
        const state = node.prekeyState.get(deviceId);
        if (state === undefined) {
          throw new Error('fake node: GetPrekeyInventory for unknown device');
        }
        const count = state.unconsumedOneTimePrekeyIds.size;
        return Promise.resolve(
          create(GetPrekeyInventoryResponseSchema, {
            oneTimePrekeyCount: count,
            oneTimePrekeyTarget: E2EE_ONE_TIME_PREKEY_TARGET,
            replenishThreshold: E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
            oneTimePrekeysExhausted: count === 0,
            // The fake never independently ages a key past due — `maintainPrekeys` decides
            // rotation from the identity's own `createdAtMs` against the caller's injected
            // clock, never from this flag, so it is always safe to report false here.
            signedPrekeyRotationDue: false,
          }),
        );
      },
    ),
    uploadPrekeys: vi.fn<(request: UploadPrekeysRequest) => Promise<UploadPrekeysResponse>>(
      (request) => {
        const state = node.prekeyState.get(request.deviceId);
        if (state === undefined) {
          throw new Error('fake node: UploadPrekeys for unknown device');
        }
        const signedPrekey = request.signedPrekey;
        if (signedPrekey !== undefined) {
          // Mirrors the real server's `rotateSignedPrekey`: a rotated id must strictly advance.
          if (signedPrekey.keyId <= state.signedPrekeyId) {
            throw new Error('fake node: a rotated signed prekey must advance the device key id');
          }
          state.signedPrekeyId = signedPrekey.keyId;
          state.signedPrekeyCreatedAtMs = toDate(signedPrekey.createdAt)?.getTime() ?? Date.now();
        }
        // Mirrors the real server's immutable per-device ledger: an id, once issued, is never
        // accepted again — checked BEFORE any of this batch is applied, so a batch containing
        // even one reused id is rejected atomically, like the real transaction.
        for (const prekey of request.oneTimePrekeys) {
          if (state.issuedOneTimePrekeyIds.has(String(prekey.keyId))) {
            throw new Error('fake node: one-time prekey ids must be unique per device');
          }
        }
        const capacity = E2EE_ONE_TIME_PREKEY_TARGET - state.unconsumedOneTimePrekeyIds.size;
        if (request.oneTimePrekeys.length > capacity) {
          throw new Error('fake node: one-time prekey upload exceeds inventory capacity');
        }
        for (const prekey of request.oneTimePrekeys) {
          const id = String(prekey.keyId);
          state.issuedOneTimePrekeyIds.add(id);
          state.unconsumedOneTimePrekeyIds.add(id);
        }
        return Promise.resolve(
          create(UploadPrekeysResponseSchema, {
            oneTimePrekeyCount: state.unconsumedOneTimePrekeyIds.size,
            ...(signedPrekey === undefined ? {} : { signedPrekey }),
          }),
        );
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Messaging fake node additions — two-device-interop.test.ts (issue #273)
// ---------------------------------------------------------------------------

/** Registers one enrolled device's local identity with the fake node so
 * `fakeMessagingSendTransport`'s `claimPrekeyBundles` has a bundle to hand out for it — the
 * fake's stand-in for the node's own prekey store, populated once `EnrollDevice`/an approved
 * link lands for that device. */
export function registerMessagingDevice(node: FakeE2eeNode, identity: LocalDeviceIdentity): void {
  node.messagingIdentities.set(identity.deviceId, identity);
}

/** Reconstructs the node's CURRENTLY SERVED roster for `actorId` as a `VerifiedRosterSnapshot`,
 * the same way any transport client independently re-verifies it on every call — never reused
 * from a registered device's own, possibly stale, locally cached `identity.ownRoster` (ADR 0020
 * §2/§4). This is what makes `claimPrekeyBundles`/`loadPeerRoster` here match a real node: they
 * always answer with the latest roster, regardless of what any one device last saved locally. */
function verifiedServedRoster(
  node: FakeE2eeNode,
  actorId: string,
  nowMs: number,
): VerifiedRosterSnapshot {
  const rootWire = node.rootByActor.get(actorId);
  const served = node.rosterByActor.get(actorId);
  if (rootWire === undefined || served?.roster === undefined) {
    throw new Error('fake node: no served identity root/roster for actor');
  }
  const root = verifyMessagingRoot({
    rootBytes: rootWire.rootBytes,
    selfSignature: rootWire.selfSignature,
    nowMs,
  });
  return verifyRosterSnapshot({
    rosterBytes: served.roster.rosterBytes,
    rootSignature: served.roster.rootSignature,
    root,
    certificates: served.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });
}

function fakeMailboxFor(node: FakeE2eeNode, deviceId: string): E2eeMailboxEnvelopeLike[] {
  let box = node.mailboxesByDevice.get(deviceId);
  if (box === undefined) {
    box = [];
    node.mailboxesByDevice.set(deviceId, box);
  }
  return box;
}

let fakeMessagingEnvelopeIdCounter = 0;

export interface FakeMessagingTransportOptions {
  readonly node: FakeE2eeNode;
  readonly actorId: string;
  readonly deviceId: string;
  /** Every actor whose active devices the fanout must cover — own-device fanout (own OTHER
   * devices) is computed here from the node's roster, exactly as the real server does. */
  readonly participantActorIds: readonly string[];
  readonly membershipEpoch?: bigint;
  readonly nowMs?: () => number;
}

/** One device's send-side messaging transport bound to a shared fake node — mirrors
 * `fakeTransport`'s per-device binding, but for the runtime's `E2eeSendTransport` seam
 * (`runtime-session.ts`) rather than enrollment/linking. `loadFanoutPlan` and
 * `claimPrekeyBundles` both derive targets from the node's CURRENT roster, so a fanout always
 * covers every active device of every participant actor, including the sender's own other
 * devices — the server-side own-device fanout ADR 0020 §7 describes. */
export function fakeMessagingSendTransport(
  options: FakeMessagingTransportOptions,
): E2eeSendTransport {
  const { node, actorId, participantActorIds } = options;
  const nowMs = options.nowMs ?? ((): number => Date.now());
  const membershipEpoch = options.membershipEpoch ?? 1n;
  return {
    loadFanoutPlan: (conversationId) => {
      const targets: { actorId: string; deviceId: string }[] = [];
      for (const memberActorId of participantActorIds) {
        const served = node.rosterByActor.get(memberActorId);
        if (served?.roster === undefined) continue;
        const view = rosterViewFromWire(served.roster);
        for (const deviceId of activeDeviceIds(view)) {
          targets.push({ actorId: memberActorId, deviceId });
        }
      }
      return Promise.resolve({ conversationId, membershipEpoch, targets });
    },
    claimPrekeyBundles: ({ actorIds }) => {
      const now = nowMs();
      const out: ClaimedPeerBundle[] = [];
      for (const claimActorId of actorIds) {
        const served = node.rosterByActor.get(claimActorId);
        if (served?.roster === undefined) continue;
        const view = rosterViewFromWire(served.roster);
        const roster = verifiedServedRoster(node, claimActorId, now);
        for (const deviceId of activeDeviceIds(view)) {
          const identity = node.messagingIdentities.get(deviceId);
          if (identity === undefined) continue;
          const oneTime = identity.oneTimePreKeys[0];
          // Verifies the device's own already-signed bundle bytes against the FRESHLY served
          // roster (`roster`, above) rather than `identity.ownRoster` — mirrors the real
          // client's `claimPrekeyBundles` (`app/e2ee-transports.ts`), which never trusts a
          // registered device's possibly-stale own snapshot for this. `identity.ownRoster` here
          // is only ever `registerMessagingDevice`'s one-time-frozen snapshot from whenever that
          // device last called it — using it would reintroduce issue #277's staleness inside the
          // fake node itself.
          const bundle = verifyPreKeyBundle({
            bundleBytes: identity.ownBundle.bundleBytes,
            deviceSignature: identity.ownBundle.deviceSignature,
            certificateBytes: identity.selfDevice.certificateBytes,
            certificateRootSignature: identity.selfDevice.rootSignature,
            ...(oneTime === undefined
              ? {}
              : { oneTimePreKey: { id: oneTime.id, publicKey: oneTime.keyPair.publicKey } }),
            roster,
            nowMs: now,
          });
          out.push({ actorId: claimActorId, deviceId, bundle, roster });
          // A one-time prekey is one-time even at the node's own prekey store (issue #153):
          // once handed to a claim, it must never be offered to a second one. Mirrors the
          // consuming half of what `runtime-session.ts`'s responder side now does locally.
          if (oneTime !== undefined) {
            node.messagingIdentities.set(deviceId, {
              ...identity,
              oneTimePreKeys: identity.oneTimePreKeys.filter((prekey) => prekey.id !== oneTime.id),
            });
          }
        }
      }
      return Promise.resolve(out);
    },
    sendEnvelopes: (request) => {
      for (const envelope of request.message.deviceEnvelopes) {
        fakeMessagingEnvelopeIdCounter += 1;
        fakeMailboxFor(node, envelope.recipientDeviceId).push({
          envelopeId: `fake-msg-env-${String(fakeMessagingEnvelopeIdCounter)}`,
          logicalMessageId: request.message.logicalMessageId,
          conversationId: request.conversationId,
          membershipEpoch: request.message.membershipEpoch,
          senderActorId: actorId,
          senderDeviceId: request.senderDeviceId,
          recipientDeviceId: envelope.recipientDeviceId,
          encryptedHeader: envelope.encryptedHeader,
          ciphertext: envelope.ciphertext,
          frankingCommitment: request.message.frankingCommitment,
          frankingTag: { profile: request.message.frankingProfile },
        });
      }
      return Promise.resolve(undefined);
    },
  };
}

/** One device's receive-side messaging transport bound to a shared fake node (mirrors
 * `fakeMessagingSendTransport`'s binding, for `E2eeMailboxTransport`). */
export function fakeMessagingMailboxTransport(options: {
  readonly node: FakeE2eeNode;
  readonly deviceId: string;
  readonly nowMs?: () => number;
}): E2eeMailboxTransport {
  const { node, deviceId } = options;
  const nowMs = options.nowMs ?? ((): number => Date.now());
  return {
    listMailboxPage: (cursor) => {
      const box = fakeMailboxFor(node, deviceId);
      const start = cursor === '' ? 0 : Number(cursor);
      const page = box.slice(start, start + 50);
      const next = start + page.length;
      return Promise.resolve({
        envelopes: page,
        nextCursor: next < box.length ? String(next) : '',
      });
    },
    acknowledge: (ids) => {
      const remaining = fakeMailboxFor(node, deviceId).filter(
        (envelope) => !ids.includes(envelope.envelopeId),
      );
      node.mailboxesByDevice.set(deviceId, remaining);
      return Promise.resolve();
    },
    loadPeerRoster: (actorId) => Promise.resolve(verifiedServedRoster(node, actorId, nowMs())),
  };
}
