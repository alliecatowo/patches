import { randomUUID } from 'node:crypto';

import { generateSigningKeyPair, sha256Hash, sign } from '@patches/crypto';
import { createTestUser } from '@patches/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';

import { E2eeDeviceRosterService } from '../src/modules/e2ee/device-roster.service.js';
import {
  encodeCertificateTranscript,
  encodePrekeyBundleTranscript,
  encodeRosterTranscript,
} from '../src/modules/e2ee/e2ee.codec.js';
import { E2eeIdentityRootService } from '../src/modules/e2ee/identity-root.service.js';
import { E2eePrekeyService } from '../src/modules/e2ee/prekey.service.js';
import { createServerTestDataSource } from './support/database.js';

/**
 * `E2eeService`'s account-root/device-roster/prekey lifecycle (ADR 0020, P13-004/P13-005)
 * against real PostgreSQL. Exercises the services directly (not over gRPC — `@patches/proto`
 * has no `E2eeService` client factory yet; that is a separate task's file) the same way
 * `messages.service.test.ts` exercises `MessagesService` directly, just with a real database
 * instead of a mocked `EntityManager` so the roster-chain/atomic-claim SQL itself is covered.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL_SERVER ?? process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping e2ee integration tests: TEST_DATABASE_URL is not set (start ' +
      'Postgres with `mise run compose -- up -d`).',
  );
}

const ZERO_32 = new Uint8Array(32);
const PROTOCOL = 'patches-e2ee-v1';

function ts(date: Date): { seconds: string; nanos: number } {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds: String(seconds), nanos: (ms - seconds * 1000) * 1_000_000 };
}

interface TestActorKeys {
  actorId: string;
  rootPrivateKey: Uint8Array;
  rootPublicKey: Uint8Array;
}

function signedIdentityRoot(actor: TestActorKeys) {
  const rootBytes = new TextEncoder().encode(`root:${actor.actorId}:1`);
  return {
    actorId: actor.actorId,
    generation: 1,
    publicKey: Buffer.from(actor.rootPublicKey),
    rootBytes: Buffer.from(rootBytes),
    selfSignature: Buffer.from(sign(actor.rootPrivateKey, rootBytes)),
    previousRootSignature: Buffer.alloc(0),
    createdAt: undefined,
    rotatedAt: undefined,
  };
}

interface DeviceKeys {
  deviceId: string;
  signingPrivateKey: Uint8Array;
  signingPublicKey: Uint8Array;
  agreementPublicKey: Uint8Array;
}

function newDevice(): DeviceKeys {
  const signing = generateSigningKeyPair();
  const agreement = generateSigningKeyPair(); // only the public half is used as a stand-in agreement key
  return {
    deviceId: randomUUID(),
    signingPrivateKey: signing.privateKey,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
  };
}

function signedCertificate(actor: TestActorKeys, device: DeviceKeys, now: Date) {
  const createdAt = now;
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const certificateBytes = Buffer.from(
    encodeCertificateTranscript({
      actorId: actor.actorId,
      deviceId: device.deviceId,
      rootGeneration: 1,
      certificateVersion: 1,
      signingPublicKey: device.signingPublicKey,
      agreementPublicKey: device.agreementPublicKey,
      supportedProtocolVersions: [PROTOCOL],
      createdAt,
      expiresAt,
    }),
  );
  const certificateDigest = sha256Hash(certificateBytes);
  return {
    actorId: actor.actorId,
    deviceId: device.deviceId,
    rootGeneration: 1,
    certificateVersion: 1,
    signingPublicKey: Buffer.from(device.signingPublicKey),
    agreementPublicKey: Buffer.from(device.agreementPublicKey),
    supportedProtocolVersions: [PROTOCOL],
    createdAt: ts(createdAt),
    expiresAt: ts(expiresAt),
    certificateBytes,
    rootSignature: Buffer.from(sign(actor.rootPrivateKey, certificateBytes)),
    certificateDigest: Buffer.from(certificateDigest),
    status: 0,
    revokedAt: undefined,
  };
}

function signedRoster(
  actor: TestActorKeys,
  sequence: bigint,
  previousDigest: Uint8Array,
  entries: readonly { deviceId: string; certificateDigest: Uint8Array; active: boolean }[],
  now: Date,
) {
  const rosterBytes = Buffer.from(
    encodeRosterTranscript({
      actorId: actor.actorId,
      sequence,
      rootGeneration: 1,
      previousDigest,
      entries: entries.map((entry) => ({ ...entry, addedAt: now, revokedAt: undefined })),
    }),
  );
  const digest = sha256Hash(rosterBytes);
  return {
    actorId: actor.actorId,
    sequence: sequence.toString(),
    rootGeneration: 1,
    previousDigest: Buffer.from(previousDigest),
    digest: Buffer.from(digest),
    rosterBytes,
    rootSignature: Buffer.from(sign(actor.rootPrivateKey, rosterBytes)),
    entries: entries.map((entry) => ({
      deviceId: entry.deviceId,
      certificateDigest: Buffer.from(entry.certificateDigest),
      active: entry.active,
      addedAt: ts(now),
      revokedAt: undefined,
    })),
    createdAt: undefined,
  };
}

function signedPrekeyBundle(
  actor: TestActorKeys,
  device: DeviceKeys,
  certificateDigest: Uint8Array,
  keyId: bigint,
  now: Date,
) {
  const createdAt = now;
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const publicKey = generateSigningKeyPair().publicKey; // stand-in X25519 public key
  const transcript = encodePrekeyBundleTranscript({
    certificateDigest,
    agreementPublicKey: device.agreementPublicKey,
    protocolVersion: '',
    actorId: actor.actorId,
    deviceId: device.deviceId,
    signedPrekeyId: keyId,
    signedPrekeyPublicKey: publicKey,
    signedPrekeyCreatedAt: createdAt,
    signedPrekeyExpiresAt: expiresAt,
  });
  const signature = sign(device.signingPrivateKey, transcript);
  return {
    signedPrekey: {
      keyId: keyId.toString(),
      publicKey: Buffer.from(publicKey),
      signature: Buffer.from(signature),
      createdAt: ts(createdAt),
      expiresAt: ts(expiresAt),
    },
    prekeyBundleBytes: Buffer.from(transcript),
    prekeyBundleSignature: Buffer.from(signature),
  };
}

function oneTimePrekeys(count: number, startId: number): { keyId: string; publicKey: Buffer }[] {
  return Array.from({ length: count }, (_, i) => ({
    keyId: String(startId + i),
    publicKey: Buffer.from(generateSigningKeyPair().publicKey),
  }));
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'E2eeService lifecycle (ADR 0020, P13-004/P13-005)',
  () => {
    let dataSource: DataSource;
    let identityRoots: E2eeIdentityRootService;
    let deviceRosters: E2eeDeviceRosterService;
    let prekeys: E2eePrekeyService;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      identityRoots = new E2eeIdentityRootService(dataSource);
      deviceRosters = new E2eeDeviceRosterService(dataSource);
      prekeys = new E2eePrekeyService(dataSource);
    }, 60_000);

    afterAll(async () => {
      await dataSource.destroy();
    });

    async function newActor(): Promise<TestActorKeys> {
      const { actor } = await createTestUser(dataSource.manager);
      const rootKeys = generateSigningKeyPair();
      return {
        actorId: actor.id,
        rootPrivateKey: rootKeys.privateKey,
        rootPublicKey: rootKeys.publicKey,
      };
    }

    async function enrollFirstDevice(actor: TestActorKeys, prekeyCount = 5) {
      await identityRoots.publishIdentityRoot(actor.actorId, {
        identityRoot: signedIdentityRoot(actor),
        roster: undefined,
      });
      const device = newDevice();
      const now = new Date();
      const certificate = signedCertificate(actor, device, now);
      const roster = signedRoster(
        actor,
        1n,
        ZERO_32,
        [
          {
            deviceId: device.deviceId,
            certificateDigest: certificate.certificateDigest,
            active: true,
          },
        ],
        now,
      );
      const bundle = signedPrekeyBundle(actor, device, certificate.certificateDigest, 1n, now);
      const response = await deviceRosters.enrollDevice(actor.actorId, {
        certificate,
        roster,
        signedPrekey: bundle.signedPrekey,
        oneTimePrekeys: oneTimePrekeys(prekeyCount, 1),
        prekeyBundleBytes: bundle.prekeyBundleBytes,
        prekeyBundleSignature: bundle.prekeyBundleSignature,
      } as never);
      return { device, response };
    }

    it('enrolls a device, publishing certificate + roster + prekeys atomically', async () => {
      const actor = await newActor();
      const { device, response } = await enrollFirstDevice(actor);
      expect(response.certificate?.deviceId).toBe(device.deviceId);
      expect(response.roster?.sequence).toBe('1');

      const inventory = await prekeys.getPrekeyInventory(actor.actorId, {
        deviceId: device.deviceId,
      });
      expect(inventory.oneTimePrekeyCount).toBe(5);
      expect(inventory.oneTimePrekeysExhausted).toBe(false);
    });

    it('rejects EnrollDevice when the certificate does not match its signed transcript', async () => {
      const actor = await newActor();
      await identityRoots.publishIdentityRoot(actor.actorId, {
        identityRoot: signedIdentityRoot(actor),
        roster: undefined,
      });
      const device = newDevice();
      const now = new Date();
      const certificate = signedCertificate(actor, device, now);
      // Tamper with the decoded convenience field without re-signing/re-encoding
      // `certificateBytes` — exactly what `decodedMatchesTranscript` verification must catch.
      certificate.certificateVersion = 2;
      const roster = signedRoster(
        actor,
        1n,
        ZERO_32,
        [
          {
            deviceId: certificate.deviceId,
            certificateDigest: certificate.certificateDigest,
            active: true,
          },
        ],
        now,
      );
      const bundle = signedPrekeyBundle(actor, device, certificate.certificateDigest, 1n, now);
      await expect(
        deviceRosters.enrollDevice(actor.actorId, {
          certificate,
          roster,
          signedPrekey: bundle.signedPrekey,
          oneTimePrekeys: [],
          prekeyBundleBytes: bundle.prekeyBundleBytes,
          prekeyBundleSignature: bundle.prekeyBundleSignature,
        } as never),
      ).rejects.toMatchObject({ code: 'E2EE_CERTIFICATE_INVALID' });
    });

    it('revokes a device: publishes the roster, marks it revoked, and deletes unused one-time prekeys', async () => {
      const actor = await newActor();
      const { device } = await enrollFirstDevice(actor, 3);
      const now = new Date();
      // Fetch the actual stored roster to get the real certificate digest committed at enroll time.
      const currentRoster = await deviceRosters.getDeviceRoster({ actorId: actor.actorId });
      const activeEntry = currentRoster.roster?.entries.find(
        (entry) => entry.deviceId === device.deviceId,
      );
      expect(activeEntry).toBeDefined();

      const roster = signedRoster(
        actor,
        2n,
        currentRoster.roster?.digest as Buffer,
        [
          {
            deviceId: device.deviceId,
            certificateDigest: activeEntry?.certificateDigest as unknown as Uint8Array,
            active: false,
          },
        ],
        now,
      );

      const result = await deviceRosters.revokeDevice(actor.actorId, {
        deviceId: device.deviceId,
        roster,
      });
      expect(result.roster?.sequence).toBe('2');
      expect(result.deletedOneTimePrekeyCount).toBe(3);

      await expect(
        prekeys.getPrekeyInventory(actor.actorId, { deviceId: device.deviceId }),
      ).rejects.toMatchObject({ code: 'E2EE_DEVICE_NOT_FOUND' });
    });

    it('rejects PublishDeviceRoster with a sequence gap', async () => {
      const actor = await newActor();
      await enrollFirstDevice(actor, 0);
      const now = new Date();
      // Sequence 3 when the roster is only at sequence 1 — a gap.
      const roster = signedRoster(actor, 3n, ZERO_32, [], now);
      await expect(
        deviceRosters.publishDeviceRoster(actor.actorId, { roster }),
      ).rejects.toMatchObject({ code: 'E2EE_ROSTER_CONFLICT' });
    });

    it('uploads a rotated signed prekey and tops up one-time prekeys, capped at the target', async () => {
      const actor = await newActor();
      const { device } = await enrollFirstDevice(actor, 2);
      const certificateDigest = (await deviceRosters.getDeviceRoster({ actorId: actor.actorId }))
        .certificates[0]?.certificateDigest as unknown as Uint8Array;
      const now = new Date(Date.now() + 1000);
      const bundle = signedPrekeyBundle(actor, device, certificateDigest, 2n, now);
      const response = await prekeys.uploadPrekeys(actor.actorId, {
        deviceId: device.deviceId,
        signedPrekey: bundle.signedPrekey,
        oneTimePrekeys: oneTimePrekeys(200, 100),
        prekeyBundleBytes: bundle.prekeyBundleBytes,
        prekeyBundleSignature: bundle.prekeyBundleSignature,
      });
      expect(response.signedPrekey?.keyId).toBe('2');
      // 2 initial + 200 offered, capped at the 100 target.
      expect(response.oneTimePrekeyCount).toBe(100);
    });

    it('reports exhaustion in the fallback bundle once one-time prekeys run out', async () => {
      const claimant = await newActor();
      const target = await newActor();
      const { device } = await enrollFirstDevice(target, 1);

      const first = await prekeys.claimPrekeyBundles(claimant.actorId, {
        conversationId: '',
        actorIds: [target.actorId],
        deviceIds: [],
      });
      expect(first.bundles).toHaveLength(1);
      expect(first.bundles[0]?.deviceId).toBe(device.deviceId);
      expect(first.bundles[0]?.oneTimePrekeyExhausted).toBe(false);
      expect(first.bundles[0]?.oneTimePrekey).toBeDefined();
      expect(first.bundles[0]?.oneTimePrekey?.keyId).toBe('1');

      const second = await prekeys.claimPrekeyBundles(claimant.actorId, {
        conversationId: '',
        actorIds: [target.actorId],
        deviceIds: [],
      });
      expect(second.bundles[0]?.oneTimePrekeyExhausted).toBe(true);
      expect(second.bundles[0]?.oneTimePrekey).toBeUndefined();
    });

    it('never hands the same one-time prekey to two concurrent claimants (atomic claim)', async () => {
      const claimantA = await newActor();
      const claimantB = await newActor();
      const target = await newActor();
      await enrollFirstDevice(target, 1);

      const [resultA, resultB] = await Promise.all([
        prekeys.claimPrekeyBundles(claimantA.actorId, {
          conversationId: '',
          actorIds: [target.actorId],
          deviceIds: [],
        }),
        prekeys.claimPrekeyBundles(claimantB.actorId, {
          conversationId: '',
          actorIds: [target.actorId],
          deviceIds: [],
        }),
      ]);

      const exhaustedFlags = [
        resultA.bundles[0]?.oneTimePrekeyExhausted,
        resultB.bundles[0]?.oneTimePrekeyExhausted,
      ];
      // Exactly one of the two concurrent claimants got the single available one-time prekey.
      expect(exhaustedFlags.filter((exhausted) => exhausted === false)).toHaveLength(1);
      expect(exhaustedFlags.filter((exhausted) => exhausted === true)).toHaveLength(1);
    });
  },
);
