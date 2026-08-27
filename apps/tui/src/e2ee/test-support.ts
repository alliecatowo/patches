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
  type E2eeDeviceCertificate,
  type E2eeDeviceLinkOffer,
  type E2eeDeviceRoster,
  type E2eeIdentityRoot,
  type E2eeServiceBeginDeviceLinkRequest,
  type E2eeServiceBeginDeviceLinkResponse,
  type E2eeServiceListPendingDeviceLinksResponse,
  type EnrollDeviceRequest,
  type PublishIdentityRootRequest,
} from '@patches/proto/es';
import { vi, type Mock } from 'vitest';
import { E2EE_PROTOCOL_V1 } from '@patches/domain';

import type {
  EnrollmentCapability,
  EnrollmentDeviceRoster,
  EnrollmentTransport,
} from './enrollment.js';
import type { RatchetSessionVault } from './ratchet-vault.js';
import type { VaultOpenInfo } from './vault-store.js';

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
export interface FakeE2eeNode {
  readonly rosterByActor: Map<string, EnrollmentDeviceRoster>;
  readonly pendingOffersByActor: Map<string, E2eeDeviceLinkOffer[]>;
}

export function createFakeE2eeNode(): FakeE2eeNode {
  return { rosterByActor: new Map(), pendingOffersByActor: new Map() };
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
    getIdentityRoot: vi.fn<(actorId: string) => Promise<E2eeIdentityRoot | undefined>>(() =>
      Promise.resolve(undefined),
    ),
    publishIdentityRoot: vi.fn<(request: PublishIdentityRootRequest) => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    ),
    enrollDevice: vi.fn<(request: EnrollDeviceRequest) => Promise<unknown>>(() =>
      Promise.resolve(undefined),
    ),
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
  };
}
