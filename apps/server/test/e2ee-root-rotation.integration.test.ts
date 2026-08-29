import { randomUUID } from 'node:crypto';

import {
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  sortRosterEntries,
  verifyMessagingRoot,
  verifyRosterSnapshot,
  type DeviceRosterEntryTranscript,
  type KeyPair,
  type VerifiedMessagingRoot,
  type VerifiedRosterSnapshot,
} from '@patches/crypto';
import { E2eeDeviceStatus } from '@patches/proto/nest';
import { createTestUser } from '@patches/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { E2eeDeviceRoster as E2eeDeviceRosterEntity } from '@patches/database';

import { E2eeDeviceRosterService } from '../src/modules/e2ee/device-roster.service.js';
import { E2eeIdentityRootService } from '../src/modules/e2ee/identity-root.service.js';
import { E2eeRateLimitService } from '../src/modules/e2ee/e2ee-rate-limit.service.js';
import { AppError } from '../src/common/errors/app-error.js';
import { createServerTestDataSource } from './support/database.js';

/**
 * Reproduces `apps/web/src/e2ee/device-link.ts`'s `rotateMessagingRoot` (byte-identical in
 * `apps/tui`) against a REAL Nest node (real Postgres via `TEST_DATABASE_URL`, real
 * `E2eeIdentityRootService`/`E2eeDeviceRosterService`, no mocked transport) — the exact scenario
 * a vault-less second browser hits when it chooses "Start a new messaging identity" against an
 * account that already has generation 1 / roster sequence 1 with one enrolled device.
 *
 * `rotateMessagingRoot` makes exactly two RPCs, in order:
 *   1. `PublishIdentityRoot` — self-signed root generation G+1 (no `previousRootSignature`,
 *      this device never held the old root), carrying roster sequence S+1 signed by the NEW
 *      root, with every previously served device entry carried forward `active: false`.
 *   2. `EnrollDevice` — this device's own certificate + roster sequence S+2, the ordinary
 *      enrollment path against the now-active new root.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL_SERVER ?? process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping e2ee root-rotation integration test: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

const PROTOCOL = 'patches-e2ee-v1';

function ts(date: Date): { seconds: string; nanos: number } {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds: String(seconds), nanos: (ms - seconds * 1000) * 1_000_000 };
}

interface TestActor {
  readonly actorId: string;
  readonly rootKeys: KeyPair;
}

interface TestDevice {
  readonly deviceId: string;
  readonly signing: KeyPair;
  readonly agreement: KeyPair;
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'E2EE root rotation from a vault-less client, against a real Nest node',
  () => {
    let dataSource: DataSource;
    let identityRoots: E2eeIdentityRootService;
    let deviceRosters: E2eeDeviceRosterService;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      identityRoots = new E2eeIdentityRootService(
        dataSource,
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
      );
      deviceRosters = new E2eeDeviceRosterService(
        dataSource,
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
      );
    }, 60_000);

    afterAll(async () => {
      await dataSource.destroy();
    });

    async function newActor(): Promise<TestActor> {
      const { actor } = await createTestUser(dataSource.manager);
      return { actorId: actor.id, rootKeys: generateSigningKeyPair() };
    }

    /** `GetIdentityRoot` -> `verifyMessagingRoot`, the transport call `rotateMessagingRoot`
     * makes first. Returns `undefined` on `E2EE_IDENTITY_ROOT_NOT_FOUND`, matching the real
     * `EnrollmentTransport`'s NOT_FOUND-maps-to-absence contract. */
    async function getVerifiedRoot(
      actorId: string,
      nowMs: number,
    ): Promise<{ rootPublicKey: Uint8Array; verified: VerifiedMessagingRoot } | undefined> {
      let response;
      try {
        response = await identityRoots.getIdentityRoot({ actorId });
      } catch (error) {
        if (error instanceof AppError && error.code === 'E2EE_IDENTITY_ROOT_NOT_FOUND') {
          return undefined;
        }
        throw error;
      }
      const root = response.identityRoot;
      if (root === undefined || root === null) return undefined;
      const verified = verifyMessagingRoot({
        rootBytes: root.rootBytes,
        selfSignature: root.selfSignature,
        nowMs,
      });
      return { rootPublicKey: root.publicKey, verified };
    }

    /** `GetDeviceRoster` -> `verifyRosterSnapshot`, the second half of the transport call.
     * Returns `undefined` on `E2EE_ROSTER_NOT_FOUND` — the "no roster yet" case #289 fixed. */
    async function getVerifiedRoster(
      actorId: string,
      root: VerifiedMessagingRoot,
      nowMs: number,
    ): Promise<VerifiedRosterSnapshot | undefined> {
      let response;
      try {
        response = await deviceRosters.getDeviceRoster({ actorId });
      } catch (error) {
        if (error instanceof AppError && error.code === 'E2EE_ROSTER_NOT_FOUND') return undefined;
        throw error;
      }
      const roster = response.roster;
      if (roster === undefined || roster === null) return undefined;
      return verifyRosterSnapshot({
        rosterBytes: roster.rosterBytes,
        rootSignature: roster.rootSignature,
        root,
        certificates: response.certificates.map((certificate) => ({
          certificateBytes: certificate.certificateBytes,
          rootSignature: certificate.rootSignature,
        })),
        nowMs,
      });
    }

    /** Step 1: actor bootstraps generation 1 + `EnrollDevice`s device `D1` — the account
     * state a real production account with one enrolled device is in before rotation. */
    async function bootstrapActorWithOneDevice(actor: TestActor, now: Date): Promise<TestDevice> {
      const signedRoot = signMessagingRoot(actor.rootKeys.privateKey, {
        actorId: actor.actorId,
        generation: 1,
        publicKey: actor.rootKeys.publicKey,
        createdAtMs: now.getTime(),
      });
      await identityRoots.publishIdentityRoot(actor.actorId, {
        identityRoot: {
          actorId: actor.actorId,
          generation: 1,
          publicKey: Buffer.from(actor.rootKeys.publicKey),
          rootBytes: Buffer.from(signedRoot.rootBytes),
          selfSignature: Buffer.from(signedRoot.selfSignature),
          previousRootSignature: Buffer.alloc(0),
          createdAt: ts(now),
          rotatedAt: undefined,
        },
        roster: undefined,
      });

      const device: TestDevice = {
        deviceId: randomUUID(),
        signing: generateSigningKeyPair(),
        agreement: generateKeyAgreementKeyPair(),
      };
      const certificateExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const signedCertificate = signDeviceCertificate(actor.rootKeys.privateKey, {
        actorId: actor.actorId,
        deviceId: device.deviceId,
        rootGeneration: 1,
        rootPublicKey: actor.rootKeys.publicKey,
        certificateVersion: 1,
        signingPublicKey: device.signing.publicKey,
        agreementPublicKey: device.agreement.publicKey,
        supportedProtocolVersions: [PROTOCOL],
        createdAtMs: now.getTime(),
        expiresAtMs: certificateExpiresAt.getTime(),
      });
      const signedRoster = signDeviceRoster(actor.rootKeys.privateKey, {
        actorId: actor.actorId,
        rootGeneration: 1,
        rootPublicKey: actor.rootKeys.publicKey,
        sequence: 1,
        previousDigest: new Uint8Array(32),
        createdAtMs: now.getTime(),
        entries: [
          {
            deviceId: device.deviceId,
            certificateDigest: signedCertificate.certificateDigest,
            active: true,
            addedAtMs: now.getTime(),
          },
        ],
      });
      const signedPrekeyExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const signedPrekeyKeyPair = generateKeyAgreementKeyPair();
      const signedPrekey = signPreKeyBundle(device.signing.privateKey, {
        actorId: actor.actorId,
        deviceId: device.deviceId,
        certificateDigest: signedCertificate.certificateDigest,
        signedPrekeyId: 1,
        signedPrekeyPublicKey: signedPrekeyKeyPair.publicKey,
        createdAtMs: now.getTime(),
        expiresAtMs: signedPrekeyExpiresAt.getTime(),
      });

      await deviceRosters.enrollDevice(actor.actorId, {
        certificate: {
          actorId: actor.actorId,
          deviceId: device.deviceId,
          rootGeneration: 1,
          certificateVersion: 1,
          signingPublicKey: Buffer.from(device.signing.publicKey),
          agreementPublicKey: Buffer.from(device.agreement.publicKey),
          supportedProtocolVersions: [PROTOCOL],
          createdAt: ts(now),
          expiresAt: ts(certificateExpiresAt),
          certificateBytes: Buffer.from(signedCertificate.certificateBytes),
          rootSignature: Buffer.from(signedCertificate.rootSignature),
          certificateDigest: Buffer.from(signedCertificate.certificateDigest),
          status: E2eeDeviceStatus.E2EE_DEVICE_STATUS_ACTIVE,
          revokedAt: undefined,
        },
        roster: {
          actorId: actor.actorId,
          sequence: '1',
          rootGeneration: 1,
          previousDigest: Buffer.from(new Uint8Array(32)),
          digest: Buffer.from(signedRoster.rosterDigest),
          rosterBytes: Buffer.from(signedRoster.rosterBytes),
          rootSignature: Buffer.from(signedRoster.rootSignature),
          entries: [
            {
              deviceId: device.deviceId,
              certificateDigest: Buffer.from(signedCertificate.certificateDigest),
              active: true,
              addedAt: ts(now),
              revokedAt: undefined,
            },
          ],
          createdAt: ts(now),
        },
        signedPrekey: {
          keyId: '1',
          publicKey: Buffer.from(signedPrekeyKeyPair.publicKey),
          signature: Buffer.from(signedPrekey.deviceSignature),
          createdAt: ts(now),
          expiresAt: ts(signedPrekeyExpiresAt),
        },
        oneTimePrekeys: [],
        prekeyBundleBytes: Buffer.from(signedPrekey.bundleBytes),
        prekeyBundleSignature: Buffer.from(signedPrekey.deviceSignature),
      });

      return device;
    }

    /** The full client-side `rotateMessagingRoot` sequence, run with the SAME
     * `@patches/crypto` calls `apps/web/src/e2ee/device-link.ts` makes, against the real
     * services instead of a Connect transport. No `previousRoot` is supplied — this mirrors
     * the vault-less-browser case exactly: no locally-held prior root private key. */
    async function rotateAsVaultlessClient(
      actor: TestActor,
      nowMs: number,
    ): Promise<{ newRootKeys: KeyPair; newDevice: TestDevice; enrollRosterSequence: bigint }> {
      const now = new Date(nowMs);
      const served = await getVerifiedRoot(actor.actorId, nowMs);
      if (served === undefined) throw new Error('no-remote-root');
      const servedRoot = served.verified;
      const servedRoster = await getVerifiedRoster(actor.actorId, servedRoot, nowMs);

      const newRootKeys = generateSigningKeyPair();
      const newGeneration = servedRoot.generation + 1;
      const signedRoot = signMessagingRoot(newRootKeys.privateKey, {
        actorId: actor.actorId,
        generation: newGeneration,
        publicKey: newRootKeys.publicKey,
        createdAtMs: nowMs,
      });
      // Vault-less: no `previousRootSignature` — an UNVERIFIED_RESET, not a planned rotation.
      const verifiedNewRoot = verifyMessagingRoot({
        rootBytes: signedRoot.rootBytes,
        selfSignature: signedRoot.selfSignature,
        nowMs,
      });

      const carriedEntries: DeviceRosterEntryTranscript[] = (servedRoster?.entries ?? []).map(
        (entry) => ({
          deviceId: entry.deviceId,
          certificateDigest: entry.certificateDigest,
          active: false,
          addedAtMs: entry.addedAtMs,
          revokedAtMs: entry.revokedAtMs ?? nowMs,
        }),
      );
      const rotationSequence = servedRoster === undefined ? 1 : servedRoster.sequence + 1;
      const signedRotationRoster = signDeviceRoster(newRootKeys.privateKey, {
        actorId: actor.actorId,
        rootGeneration: newGeneration,
        rootPublicKey: newRootKeys.publicKey,
        sequence: rotationSequence,
        previousDigest: servedRoster === undefined ? new Uint8Array(32) : servedRoster.rosterDigest,
        createdAtMs: nowMs,
        entries: sortRosterEntries(carriedEntries),
      });
      const verifiedRotationRoster = verifyRosterSnapshot({
        rosterBytes: signedRotationRoster.rosterBytes,
        rootSignature: signedRotationRoster.rootSignature,
        root: verifiedNewRoot,
        certificates: [],
        nowMs,
      });

      // RPC 1: PublishIdentityRoot (generation G+1, self-signed, carrying roster S+1).
      await identityRoots.publishIdentityRoot(actor.actorId, {
        identityRoot: {
          actorId: actor.actorId,
          generation: newGeneration,
          publicKey: Buffer.from(newRootKeys.publicKey),
          rootBytes: Buffer.from(signedRoot.rootBytes),
          selfSignature: Buffer.from(signedRoot.selfSignature),
          previousRootSignature: Buffer.alloc(0),
          createdAt: ts(now),
          rotatedAt: undefined,
        },
        roster: {
          actorId: actor.actorId,
          sequence: String(verifiedRotationRoster.sequence),
          rootGeneration: newGeneration,
          previousDigest: Buffer.from(verifiedRotationRoster.previousDigest),
          digest: Buffer.from(verifiedRotationRoster.rosterDigest),
          rosterBytes: Buffer.from(verifiedRotationRoster.rosterBytes),
          rootSignature: Buffer.from(verifiedRotationRoster.rootSignature),
          entries: verifiedRotationRoster.entries.map((entry) => ({
            deviceId: entry.deviceId,
            certificateDigest: Buffer.from(entry.certificateDigest),
            active: entry.active,
            addedAt: ts(new Date(entry.addedAtMs)),
            revokedAt:
              entry.revokedAtMs === undefined ? undefined : ts(new Date(entry.revokedAtMs)),
          })),
          createdAt: ts(now),
        },
      });

      // RPC 2: EnrollDevice — this device (D2) becomes the sole active entry of sequence
      // rotationSequence + 1, chaining onto the rotation roster just published.
      const newDevice: TestDevice = {
        deviceId: randomUUID(),
        signing: generateSigningKeyPair(),
        agreement: generateKeyAgreementKeyPair(),
      };
      const certificateExpiresAt = new Date(nowMs + 30 * 24 * 60 * 60 * 1000);
      const signedCertificate = signDeviceCertificate(newRootKeys.privateKey, {
        actorId: actor.actorId,
        deviceId: newDevice.deviceId,
        rootGeneration: newGeneration,
        rootPublicKey: newRootKeys.publicKey,
        certificateVersion: 1,
        signingPublicKey: newDevice.signing.publicKey,
        agreementPublicKey: newDevice.agreement.publicKey,
        supportedProtocolVersions: [PROTOCOL],
        createdAtMs: nowMs,
        expiresAtMs: certificateExpiresAt.getTime(),
      });
      const enrollSequence = verifiedRotationRoster.sequence + 1;
      const enrollEntries: DeviceRosterEntryTranscript[] = [
        ...verifiedRotationRoster.entries.map((entry) => ({
          deviceId: entry.deviceId,
          certificateDigest: entry.certificateDigest,
          active: entry.active,
          addedAtMs: entry.addedAtMs,
          ...(entry.revokedAtMs === undefined ? {} : { revokedAtMs: entry.revokedAtMs }),
        })),
        {
          deviceId: newDevice.deviceId,
          certificateDigest: signedCertificate.certificateDigest,
          active: true,
          addedAtMs: nowMs,
        },
      ];
      const signedEnrollRoster = signDeviceRoster(newRootKeys.privateKey, {
        actorId: actor.actorId,
        rootGeneration: newGeneration,
        rootPublicKey: newRootKeys.publicKey,
        sequence: enrollSequence,
        previousDigest: verifiedRotationRoster.rosterDigest,
        createdAtMs: nowMs,
        entries: sortRosterEntries(enrollEntries),
      });
      const signedPrekeyExpiresAt = new Date(nowMs + 7 * 24 * 60 * 60 * 1000);
      const signedPrekeyKeyPair = generateKeyAgreementKeyPair();
      const signedPrekey = signPreKeyBundle(newDevice.signing.privateKey, {
        actorId: actor.actorId,
        deviceId: newDevice.deviceId,
        certificateDigest: signedCertificate.certificateDigest,
        signedPrekeyId: 1,
        signedPrekeyPublicKey: signedPrekeyKeyPair.publicKey,
        createdAtMs: nowMs,
        expiresAtMs: signedPrekeyExpiresAt.getTime(),
      });

      const enrolled = await deviceRosters.enrollDevice(actor.actorId, {
        certificate: {
          actorId: actor.actorId,
          deviceId: newDevice.deviceId,
          rootGeneration: newGeneration,
          certificateVersion: 1,
          signingPublicKey: Buffer.from(newDevice.signing.publicKey),
          agreementPublicKey: Buffer.from(newDevice.agreement.publicKey),
          supportedProtocolVersions: [PROTOCOL],
          createdAt: ts(now),
          expiresAt: ts(certificateExpiresAt),
          certificateBytes: Buffer.from(signedCertificate.certificateBytes),
          rootSignature: Buffer.from(signedCertificate.rootSignature),
          certificateDigest: Buffer.from(signedCertificate.certificateDigest),
          status: E2eeDeviceStatus.E2EE_DEVICE_STATUS_ACTIVE,
          revokedAt: undefined,
        },
        roster: {
          actorId: actor.actorId,
          sequence: String(enrollSequence),
          rootGeneration: newGeneration,
          previousDigest: Buffer.from(verifiedRotationRoster.rosterDigest),
          digest: Buffer.from(signedEnrollRoster.rosterDigest),
          rosterBytes: Buffer.from(signedEnrollRoster.rosterBytes),
          rootSignature: Buffer.from(signedEnrollRoster.rootSignature),
          entries: sortRosterEntries(enrollEntries).map((entry) => ({
            deviceId: entry.deviceId,
            certificateDigest: Buffer.from(entry.certificateDigest),
            active: entry.active,
            addedAt: ts(new Date(entry.addedAtMs)),
            revokedAt:
              entry.revokedAtMs === undefined ? undefined : ts(new Date(entry.revokedAtMs)),
          })),
          createdAt: ts(now),
        },
        signedPrekey: {
          keyId: '1',
          publicKey: Buffer.from(signedPrekeyKeyPair.publicKey),
          signature: Buffer.from(signedPrekey.deviceSignature),
          createdAt: ts(now),
          expiresAt: ts(signedPrekeyExpiresAt),
        },
        oneTimePrekeys: [],
        prekeyBundleBytes: Buffer.from(signedPrekey.bundleBytes),
        prekeyBundleSignature: Buffer.from(signedPrekey.deviceSignature),
      });

      return {
        newRootKeys,
        newDevice,
        enrollRosterSequence: BigInt(enrolled.roster?.sequence ?? '0'),
      };
    }

    it('rotates cleanly from generation 1 / roster sequence 1 with one enrolled device', async () => {
      const now = new Date();
      const actor = await newActor();
      const originalDevice = await bootstrapActorWithOneDevice(actor, now);

      const nowMs = Date.now();
      const { newRootKeys, newDevice, enrollRosterSequence } = await rotateAsVaultlessClient(
        actor,
        nowMs,
      );

      expect(enrollRosterSequence).toBe(3n);

      const rootResponse = await identityRoots.getIdentityRoot({ actorId: actor.actorId });
      expect(rootResponse.identityRoot?.generation).toBe(2);
      expect(
        Buffer.from(rootResponse.identityRoot?.publicKey ?? Buffer.alloc(0)).equals(
          Buffer.from(newRootKeys.publicKey),
        ),
      ).toBe(true);

      const rosterResponse = await deviceRosters.getDeviceRoster({ actorId: actor.actorId });
      expect(rosterResponse.roster?.sequence).toBe('3');
      const entries = rosterResponse.roster?.entries ?? [];
      const originalEntry = entries.find((entry) => entry.deviceId === originalDevice.deviceId);
      const newEntry = entries.find((entry) => entry.deviceId === newDevice.deviceId);
      expect(originalEntry?.active).toBe(false);
      expect(newEntry?.active).toBe(true);
    }, 30_000);

    it('also rotates cleanly when the roster row was deleted after the root was published', async () => {
      const now = new Date();
      const actor = await newActor();
      await bootstrapActorWithOneDevice(actor, now);
      await dataSource.getRepository(E2eeDeviceRosterEntity).delete({ actorId: actor.actorId });

      const nowMs = Date.now();
      const { enrollRosterSequence } = await rotateAsVaultlessClient(actor, nowMs);

      // No served roster (`servedRoster === undefined`) -> rotation starts at genesis
      // sequence 1, EnrollDevice's own roster is sequence 2 (issue #266 / commit a3bde15e).
      expect(enrollRosterSequence).toBe(2n);

      const rosterResponse = await deviceRosters.getDeviceRoster({ actorId: actor.actorId });
      expect(rosterResponse.roster?.sequence).toBe('2');
    }, 30_000);
  },
);
