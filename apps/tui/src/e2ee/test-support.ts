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
