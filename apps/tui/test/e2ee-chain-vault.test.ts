import { describe, expect, it } from 'vitest';

import {
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  sha256Hash,
  sign,
  signingKeyPairFromPrivate,
} from '@patches/crypto';
import {
  canonicalGroupControlTranscript,
  E2EE_DEVICE_CERTIFICATE_VERSION,
  verifyIdentityRoot,
} from '@patches/domain';

import { E2EE_DEVICE_STATUS, E2EE_GROUP_CHANGE_KIND } from '../src/api/wire/enums.js';
import { fromDate } from '../src/api/wire/time.js';
import { type LocalDeviceIdentity } from '../src/e2ee/local-identity.js';
import type {
  E2eeDeviceCertificate,
  E2eeDeviceRoster,
  E2eeGroupControlEvent,
  E2eeIdentityRoot,
} from '../src/api/wire/types.js';
import {
  encodeCertificateTranscript,
  encodeRosterTranscript,
} from '../src/e2ee/node-transcripts.js';
import {
  identityRootFromWire,
  strictVerifier,
  verifyActorChain,
  type VerifiedPeerChain,
} from '../src/e2ee/chain.js';
import { verifyGroupControlEvents } from '../src/e2ee/group-control.js';
import { createVaultE2eeSender } from '../src/app/e2ee-send.js';
import { E2eeNotEnrolledError } from '../src/e2ee/runtime.js';
import { wipeE2eeState } from '../src/e2ee/ratchet-vault.js';
import { VaultCorruptionError } from '../src/e2ee/vault-errors.js';
import { MemoryVaultStore, type RatchetVaultStore } from '../src/e2ee/vault-store.js';
import { TypedRatchetVault } from '../src/e2ee/ratchet-vault.js';
import { MemoryVaultFs, testLocalIdentity } from '../src/e2ee/test-support.js';
import { NO_KEYRING } from '../src/e2ee/vault-key-providers.js';

// ---------------------------------------------------------------------------
// Wire-shaped fixtures built with the node's own transcript encoders, so chain
// verification is pinned to what a real node signs (see node-transcripts.ts).
// ---------------------------------------------------------------------------

const CREATED = new Date('2026-08-01T00:00:00Z');
const EXPIRES = new Date('2027-08-01T00:00:00Z');

interface ChainFixture {
  readonly rootWire: E2eeIdentityRoot;
  readonly rootPrivate: Uint8Array;
  readonly rosterWire: E2eeDeviceRoster;
  readonly certificatesWire: E2eeDeviceCertificate[];
  readonly deviceSigningPrivate: Uint8Array;
}

function buildChain(actorId: string, deviceId: string, rootSeedText: string): ChainFixture {
  const rootPair = signingKeyPairFromPrivate(seed32(rootSeedText));
  const deviceSigning = generateSigningKeyPair();
  const deviceAgreement = generateKeyAgreementKeyPair();
  const certificateBytes = encodeCertificateTranscript({
    actorId,
    deviceId,
    rootGeneration: 1,
    certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
    signingPublicKey: deviceSigning.publicKey,
    agreementPublicKey: deviceAgreement.publicKey,
    supportedProtocolVersions: ['patches-e2ee-v1'],
    createdAtMs: CREATED.getTime(),
    expiresAtMs: EXPIRES.getTime(),
  });
  const certificateDigest = sha256Hash(certificateBytes);
  const certificatesWire: E2eeDeviceCertificate[] = [
    {
      $typeName: 'patches.v1.E2eeDeviceCertificate',
      actorId,
      deviceId,
      rootGeneration: 1,
      certificateVersion: E2EE_DEVICE_CERTIFICATE_VERSION,
      signingPublicKey: deviceSigning.publicKey,
      agreementPublicKey: deviceAgreement.publicKey,
      supportedProtocolVersions: ['patches-e2ee-v1'],
      createdAt: fromDate(CREATED),
      expiresAt: fromDate(EXPIRES),
      certificateBytes,
      rootSignature: sign(rootPair.privateKey, certificateBytes),
      certificateDigest,
      status: E2EE_DEVICE_STATUS.ACTIVE,
    },
  ];
  const rosterBytes = encodeRosterTranscript({
    actorId,
    sequence: 1n,
    rootGeneration: 1,
    previousDigest: new Uint8Array(32),
    entries: [
      {
        deviceId,
        certificateDigest,
        active: true,
        addedAtMs: CREATED.getTime(),
      },
    ],
  });
  const rosterWire: E2eeDeviceRoster = {
    $typeName: 'patches.v1.E2eeDeviceRoster',
    actorId,
    sequence: 1n,
    rootGeneration: 1,
    previousDigest: new Uint8Array(32),
    digest: sha256Hash(rosterBytes),
    rosterBytes,
    rootSignature: sign(rootPair.privateKey, rosterBytes),
    entries: [
      {
        $typeName: 'patches.v1.E2eeRosterEntry',
        deviceId,
        certificateDigest,
        active: true,
        addedAt: fromDate(CREATED),
      },
    ],
    createdAt: fromDate(CREATED),
  };
  const rootBytes = new TextEncoder().encode(`patches-root:${actorId}:1`);
  const rootWire: E2eeIdentityRoot = {
    $typeName: 'patches.v1.E2eeIdentityRoot',
    actorId,
    generation: 1,
    publicKey: rootPair.publicKey,
    rootBytes,
    selfSignature: sign(rootPair.privateKey, rootBytes),
    previousRootSignature: new Uint8Array(0),
    createdAt: fromDate(CREATED),
  };
  return {
    rootWire,
    rootPrivate: rootPair.privateKey,
    rosterWire,
    certificatesWire,
    deviceSigningPrivate: deviceSigning.privateKey,
  };
}

function seed32(text: string): Uint8Array {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(text).subarray(0, 32));
  return out;
}

describe('client-side chain verification (B-101)', () => {
  it('verifies a well-formed published chain end to end', () => {
    const fix = buildChain('actor-x', 'device-x', 'seed-one');
    const chain = verifyActorChain({
      rootWire: fix.rootWire,
      rosterWire: fix.rosterWire,
      certificatesWire: fix.certificatesWire,
      now: CREATED,
    });
    expect(chain.activeDevices.get('device-x')?.signingPublicKey).toBeDefined();
  });

  it('fails closed when a served convenience field disagrees with the signed transcript', () => {
    const fix = buildChain('actor-x', 'device-x', 'seed-two');
    const tamperedCertificates = fix.certificatesWire.map((cert) => ({
      ...cert,
      signingPublicKey: cert.signingPublicKey.slice(),
    }));
    const cert = tamperedCertificates[0];
    if (cert !== undefined) cert.signingPublicKey[0] = (cert.signingPublicKey[0] ?? 0) ^ 1;
    expect(() =>
      verifyActorChain({
        rootWire: fix.rootWire,
        rosterWire: fix.rosterWire,
        certificatesWire: tamperedCertificates,
        now: CREATED,
      }),
    ).toThrow();
  });

  it('fails closed when certificate_bytes are swapped after signing', () => {
    const fix = buildChain('actor-x', 'device-x', 'seed-three');
    const tamperedCertificates = fix.certificatesWire.map((cert) => ({
      ...cert,
      certificateBytes: cert.certificateBytes.slice(),
    }));
    const cert = tamperedCertificates[0];
    if (cert !== undefined) {
      cert.certificateBytes[5] = (cert.certificateBytes[5] ?? 0) ^ 0xff;
    }
    expect(() =>
      verifyActorChain({
        rootWire: fix.rootWire,
        rosterWire: fix.rosterWire,
        certificatesWire: tamperedCertificates,
        now: CREATED,
      }),
    ).toThrow();
  });

  it("rejects an expired active device's certificate", () => {
    const fix = buildChain('actor-x', 'device-x', 'seed-four');
    expect(() =>
      verifyActorChain({
        rootWire: fix.rootWire,
        rosterWire: fix.rosterWire,
        certificatesWire: fix.certificatesWire,
        now: EXPIRES,
      }),
    ).toThrow();
  });

  it('identity roots fail closed without proof of possession', () => {
    const fix = buildChain('actor-x', 'device-x', 'seed-five');
    const broken = {
      ...identityRootFromWire(fix.rootWire),
      selfSignature: new Uint8Array(64),
    };
    expect(() => verifyIdentityRoot(broken, { verifier: strictVerifier })).toThrow();
  });
});

describe('group-control transcript verification (B-101)', () => {
  function buildEvent(
    signer: ChainFixture,
    overrides: Partial<Parameters<typeof canonicalGroupControlTranscript>[0]> = {},
  ): E2eeGroupControlEvent {
    const fields = {
      conversationId: 'conv-g',
      epoch: 2n,
      change: 'ADDED' as const,
      subjectActorId: 'actor-new',
      signerActorId: 'actor-x',
      signerDeviceId: 'device-x',
      previousDigest: new Uint8Array(32),
      ...overrides,
    };
    const eventBytes = canonicalGroupControlTranscript(fields);
    return {
      $typeName: 'patches.v1.E2eeGroupControlEvent',
      conversationId: fields.conversationId,
      epoch: fields.epoch,
      change: E2EE_GROUP_CHANGE_KIND.ADDED,
      subjectActorId: fields.subjectActorId,
      signerActorId: fields.signerActorId,
      signerDeviceId: fields.signerDeviceId,
      previousDigest: fields.previousDigest,
      digest: sha256Hash(eventBytes),
      eventBytes,
      deviceSignature: sign(signer.deviceSigningPrivate, eventBytes),
      createdAt: fromDate(CREATED),
    };
  }

  it('marks every row verified when signatures check against certified device keys', async () => {
    const signer = buildChain('actor-x', 'device-x', 'chain-g1');
    const chain: VerifiedPeerChain = verifyActorChain({
      rootWire: signer.rootWire,
      rosterWire: signer.rosterWire,
      certificatesWire: signer.certificatesWire,
      now: CREATED,
    });
    const verdict = await verifyGroupControlEvents([buildEvent(signer)], {
      loadVerifiedChain: (actorId) => Promise.resolve(actorId === 'actor-x' ? chain : undefined),
    });
    expect(verdict.allVerified).toBe(true);
    expect(verdict.rows[0]?.signatureVerified).toBe(true);
  });

  it('marks rows unverified when the signature does not check out', async () => {
    const signer = buildChain('actor-x', 'device-x', 'chain-g2');
    const chain = verifyActorChain({
      rootWire: signer.rootWire,
      rosterWire: signer.rosterWire,
      certificatesWire: signer.certificatesWire,
      now: CREATED,
    });
    const event = buildEvent(signer);
    event.deviceSignature = event.deviceSignature.slice();
    event.deviceSignature[3] = (event.deviceSignature[3] ?? 0) ^ 0x10;
    const verdict = await verifyGroupControlEvents([event], {
      loadVerifiedChain: () => Promise.resolve(chain),
    });
    expect(verdict.allVerified).toBe(false);
    expect(verdict.rows[0]?.signatureVerified).toBe(false);
  });

  it('fails rows closed when no verified chain is available for the signer', async () => {
    const signer = buildChain('actor-x', 'device-x', 'chain-g3');
    const verdict = await verifyGroupControlEvents([buildEvent(signer)], {
      loadVerifiedChain: () => Promise.resolve(undefined),
    });
    expect(verdict.allVerified).toBe(false);
  });

  it('treats an unknown change kind as an unverified row rather than guessing', async () => {
    const signer = buildChain('actor-x', 'device-x', 'chain-g4');
    const chain = verifyActorChain({
      rootWire: signer.rootWire,
      rosterWire: signer.rosterWire,
      certificatesWire: signer.certificatesWire,
      now: CREATED,
    });
    const event = buildEvent(signer);
    event.change = 99 as unknown as typeof event.change;
    const verdict = await verifyGroupControlEvents([event], {
      loadVerifiedChain: () => Promise.resolve(chain),
    });
    expect(verdict.allVerified).toBe(false);
    expect(verdict.rows[0]?.change).toBe('UNKNOWN');
  });
});

// ---------------------------------------------------------------------------
// Vault lifecycle: P2-1 temp sweep and the sender facade's wipe/fault semantics.
// ---------------------------------------------------------------------------

describe('vault lifecycle (audit P1-2 / P2-1)', () => {
  it('sweeps wrapping-key temp siblings during wipeE2eeState', async () => {
    const fsx = new MemoryVaultFs();
    const vaultPath = '/data/account.vault';
    const keyFilePath = '/data/keys/account.key';
    await fsx.mkdir('/data');
    await fsx.mkdir('/data/keys');
    await fsx.openWriteExclusive(`${vaultPath}.123.abc.tmp`, 0o600).then((h) => h.close());
    await fsx.openWriteExclusive(`${keyFilePath}.77.def.tmp`, 0o600).then((h) => h.close());
    await fsx.openWriteExclusive(vaultPath, 0o600).then((h) => h.close());
    await fsx.openWriteExclusive(keyFilePath, 0o600).then((h) => h.close());
    await fsx.openWriteExclusive('/data/unrelated.txt', 0o600).then((h) => h.close());

    await wipeE2eeState({
      account: { nodeOrigin: 'n', userId: 'u' },
      vaultPath,
      keyFilePath,
      fileOperations: fsx,
      keyring: NO_KEYRING,
    });

    const names = Array.from(fsx.files.keys()).sort();
    expect(names).toEqual(['/data/unrelated.txt']);
  });

  it('reports not-enrolled for sends and polls until an identity exists', async () => {
    const sender = createVaultE2eeSender({
      account: { nodeOrigin: 'n', userId: 'u' },
      allowInsecureKeyFile: false,
      vault: new TypedRatchetVault(new MemoryVaultStore()),
    });
    await expect(sender.send('c', 'hi')).rejects.toBeInstanceOf(E2eeNotEnrolledError);
    await expect(sender.pollMailbox('c')).rejects.toBeInstanceOf(E2eeNotEnrolledError);
    expect(sender.enrolled()).toBe(false);
    sender.close();
  });

  it('routes wipe through the live store and clears sticky faults (audit P1-2)', async () => {
    class FaultyThenSpyStore extends MemoryVaultStore implements RatchetVaultStore {
      openCount = 0;
      wipeCalls = 0;
      failOpens = true;
      override open(): ReturnType<MemoryVaultStore['open']> {
        this.openCount += 1;
        if (this.failOpens) throw new VaultCorruptionError();
        return super.open();
      }
      override wipe(): Promise<void> {
        this.wipeCalls += 1;
        return super.wipe();
      }
    }
    const store = new FaultyThenSpyStore();
    const identity = testLocalIdentity('actor-x', 'device-x');
    const transports = {
      loadFanoutPlan: () =>
        Promise.resolve({ conversationId: 'c', membershipEpoch: 1n, targets: [] }),
      claimPrekeyBundles: () => Promise.resolve([]),
      sendEnvelopes: () => Promise.resolve({}),
      listMailboxPage: () => Promise.resolve({ envelopes: [], nextCursor: '' }),
      acknowledge: () => Promise.resolve(),
      loadPeerRoster: () => Promise.resolve(identity.local.ownRoster),
    };
    const sender = createVaultE2eeSender({
      account: { nodeOrigin: 'n', userId: 'u' },
      allowInsecureKeyFile: false,
      vault: new TypedRatchetVault(store),
      enrolled: { identity: identity.local satisfies LocalDeviceIdentity, transports },
    });
    // A corrupt vault raises the sticky inaccessible-history fault…
    await expect(sender.send('c', 'hi')).rejects.toBeInstanceOf(VaultCorruptionError);
    expect(sender.fault()).toBe('corrupt');
    // …and the explicit wipe goes THROUGH THE LIVE STORE, then clears the fault.
    store.failOpens = false;
    await sender.wipe();
    expect(store.wipeCalls).toBe(1);
    expect(sender.fault()).toBeUndefined();
    sender.close();
  });
});
