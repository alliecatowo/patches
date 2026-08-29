import { randomUUID } from 'node:crypto';

import {
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  type DevicePrivateKeys,
  type KeyPair,
} from '@patches/crypto';
import { E2eeDeviceIdentity, E2eeOneTimePrekey, E2eeOneTimePrekeyKeyId } from '@patches/database';
import { E2eeDeviceStatus } from '@patches/proto/nest';
import { createTestUser } from '@patches/testkit';
import { IsNull, type DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DbRateLimitStore } from '../src/modules/auth/db-rate-limit-store.service.js';
import { E2eeDeviceRosterService } from '../src/modules/e2ee/device-roster.service.js';
import { E2eeRateLimitService } from '../src/modules/e2ee/e2ee-rate-limit.service.js';
import { E2eeIdentityRootService } from '../src/modules/e2ee/identity-root.service.js';
import { E2eePrekeyService } from '../src/modules/e2ee/prekey.service.js';
import { createServerTestDataSource } from './support/database.js';

/**
 * Issue #273(c): a genuinely-concurrent `ClaimPrekeyBundles` race against one real device,
 * driving the `FOR UPDATE SKIP LOCKED` claim path (`apps/server/src/modules/e2ee/
 * prekey.service.ts`'s `claimOneOneTimePrekey`) with `Promise.all`, not sequential awaits —
 * the failure mode this exists to catch (two callers reading the same "available" row and
 * both consuming it) only appears under real interleaving.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL_SERVER ?? process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping e2ee prekey claim-race integration test: TEST_DATABASE_URL is not ' +
      'set (start Postgres with `mise run compose -- up -d`).',
  );
}

// Mirrors `prekey.service.ts`'s private PREKEY_CLAIM_RATE_LIMIT — not exported, so this is a
// literal copy of the drain-budget bound the second scenario below exercises, not an import.
const PREKEY_CLAIM_RATE_LIMIT = 30;

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
  readonly keys: DevicePrivateKeys;
}

function buildIdentityRootRequest(actor: TestActor, createdAt: Date) {
  const signed = signMessagingRoot(actor.rootKeys.privateKey, {
    actorId: actor.actorId,
    generation: 1,
    publicKey: actor.rootKeys.publicKey,
    createdAtMs: createdAt.getTime(),
  });
  return {
    identityRoot: {
      actorId: actor.actorId,
      generation: 1,
      publicKey: Buffer.from(actor.rootKeys.publicKey),
      rootBytes: Buffer.from(signed.rootBytes),
      selfSignature: Buffer.from(signed.selfSignature),
      previousRootSignature: Buffer.alloc(0),
      createdAt: ts(createdAt),
      rotatedAt: undefined,
    },
    roster: undefined,
  };
}

function buildCertificate(actor: TestActor, device: TestDevice, now: Date) {
  const createdAt = now;
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const signed = signDeviceCertificate(actor.rootKeys.privateKey, {
    actorId: actor.actorId,
    deviceId: device.deviceId,
    rootGeneration: 1,
    rootPublicKey: actor.rootKeys.publicKey,
    certificateVersion: 1,
    signingPublicKey: device.keys.signing.publicKey,
    agreementPublicKey: device.keys.agreement.publicKey,
    supportedProtocolVersions: [PROTOCOL],
    createdAtMs: createdAt.getTime(),
    expiresAtMs: expiresAt.getTime(),
  });
  return {
    actorId: actor.actorId,
    deviceId: device.deviceId,
    rootGeneration: 1,
    certificateVersion: 1,
    signingPublicKey: Buffer.from(device.keys.signing.publicKey),
    agreementPublicKey: Buffer.from(device.keys.agreement.publicKey),
    supportedProtocolVersions: [PROTOCOL],
    createdAt: ts(createdAt),
    expiresAt: ts(expiresAt),
    certificateBytes: Buffer.from(signed.certificateBytes),
    rootSignature: Buffer.from(signed.rootSignature),
    certificateDigest: Buffer.from(signed.certificateDigest),
    status: E2eeDeviceStatus.E2EE_DEVICE_STATUS_ACTIVE,
    revokedAt: undefined,
  };
}

function buildRoster(
  actor: TestActor,
  device: TestDevice,
  certificateDigest: Uint8Array,
  now: Date,
) {
  const signed = signDeviceRoster(actor.rootKeys.privateKey, {
    actorId: actor.actorId,
    rootGeneration: 1,
    rootPublicKey: actor.rootKeys.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(32),
    createdAtMs: now.getTime(),
    entries: [
      { deviceId: device.deviceId, certificateDigest, active: true, addedAtMs: now.getTime() },
    ],
  });
  return {
    actorId: actor.actorId,
    sequence: '1',
    rootGeneration: 1,
    previousDigest: Buffer.from(new Uint8Array(32)),
    digest: Buffer.from(signed.rosterDigest),
    rosterBytes: Buffer.from(signed.rosterBytes),
    rootSignature: Buffer.from(signed.rootSignature),
    entries: [
      {
        deviceId: device.deviceId,
        certificateDigest: Buffer.from(certificateDigest),
        active: true,
        addedAt: ts(now),
        revokedAt: undefined,
      },
    ],
    createdAt: ts(now),
  };
}

function buildSignedPrekey(
  device: TestDevice,
  actorId: string,
  certificateDigest: Uint8Array,
  keyId: number,
  agreementKeyPair: KeyPair,
  now: Date,
) {
  const createdAt = now;
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const signed = signPreKeyBundle(device.keys.signing.privateKey, {
    actorId,
    deviceId: device.deviceId,
    certificateDigest,
    signedPrekeyId: keyId,
    signedPrekeyPublicKey: agreementKeyPair.publicKey,
    createdAtMs: createdAt.getTime(),
    expiresAtMs: expiresAt.getTime(),
  });
  return {
    signedPrekey: {
      keyId: String(keyId),
      publicKey: Buffer.from(agreementKeyPair.publicKey),
      signature: Buffer.from(signed.deviceSignature),
      createdAt: ts(createdAt),
      expiresAt: ts(expiresAt),
    },
    prekeyBundleBytes: Buffer.from(signed.bundleBytes),
    prekeyBundleSignature: Buffer.from(signed.deviceSignature),
  };
}

function oneTimePrekeys(count: number, startId: number): { keyId: string; publicKey: Buffer }[] {
  return Array.from({ length: count }, (_, i) => {
    const keyPair = generateKeyAgreementKeyPair();
    return { keyId: String(startId + i), publicKey: Buffer.from(keyPair.publicKey) };
  });
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'E2EE ClaimPrekeyBundles concurrency (issue #273c)',
  () => {
    let dataSource: DataSource;
    let identityRoots: E2eeIdentityRootService;
    let deviceRosters: E2eeDeviceRosterService;
    let prekeys: E2eePrekeyService;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      const noopRateLimitStore = {
        increment: () => Promise.resolve(0),
      } as unknown as DbRateLimitStore;
      identityRoots = new E2eeIdentityRootService(
        dataSource,
        new E2eeRateLimitService(noopRateLimitStore),
      );
      deviceRosters = new E2eeDeviceRosterService(
        dataSource,
        new E2eeRateLimitService(noopRateLimitStore),
      );
      prekeys = new E2eePrekeyService(dataSource, new E2eeRateLimitService(noopRateLimitStore));
    }, 60_000);

    afterAll(async () => {
      await dataSource.destroy();
    });

    async function newActor(): Promise<TestActor> {
      const { actor } = await createTestUser(dataSource.manager);
      return { actorId: actor.id, rootKeys: generateSigningKeyPair() };
    }

    /** Enrolls one real device with `oneTimePrekeyCount` one-time prekeys, returning its
     * internal `E2eeDeviceIdentity` row id for ledger/pool assertions against the DB. */
    async function enrollTargetDevice(
      actor: TestActor,
      now: Date,
      oneTimePrekeyCount: number,
    ): Promise<{ deviceId: string; deviceIdentityId: string }> {
      await identityRoots.publishIdentityRoot(actor.actorId, buildIdentityRootRequest(actor, now));

      const device: TestDevice = {
        deviceId: randomUUID(),
        keys: { signing: generateSigningKeyPair(), agreement: generateKeyAgreementKeyPair() },
      };
      const certificate = buildCertificate(actor, device, now);
      const roster = buildRoster(actor, device, certificate.certificateDigest, now);
      const agreementKeyPair = generateKeyAgreementKeyPair();
      const bundle = buildSignedPrekey(
        device,
        actor.actorId,
        certificate.certificateDigest,
        1,
        agreementKeyPair,
        now,
      );

      await deviceRosters.enrollDevice(actor.actorId, {
        certificate,
        roster,
        signedPrekey: bundle.signedPrekey,
        oneTimePrekeys: oneTimePrekeys(oneTimePrekeyCount, 1),
        prekeyBundleBytes: bundle.prekeyBundleBytes,
        prekeyBundleSignature: bundle.prekeyBundleSignature,
      });

      const row = await dataSource.getRepository(E2eeDeviceIdentity).findOneOrFail({
        where: { actorId: actor.actorId, deviceId: device.deviceId, revokedAt: IsNull() },
      });
      return { deviceId: device.deviceId, deviceIdentityId: row.id };
    }

    it('40 concurrent claimants racing 20 one-time prekeys each get a unique key or an honest fallback', async () => {
      const now = new Date();
      const target = await newActor();
      const { deviceId, deviceIdentityId } = await enrollTargetDevice(target, now, 20);

      const claimantCount = 40;
      const claimants = await Promise.all(Array.from({ length: claimantCount }, () => newActor()));

      const responses = await Promise.all(
        claimants.map((claimant) =>
          prekeys.claimPrekeyBundles(claimant.actorId, {
            conversationId: '',
            actorIds: [target.actorId],
            deviceIds: [],
          }),
        ),
      );

      const bundlesForDevice = responses.map((response) => {
        const bundle = response.bundles.find((candidate) => candidate.deviceId === deviceId);
        expect(bundle).toBeDefined();
        return bundle;
      });

      const handedOutIds = bundlesForDevice
        .map((bundle) => bundle?.oneTimePrekey?.keyId)
        .filter((keyId): keyId is string => keyId !== undefined);
      const fallbacks = bundlesForDevice.filter(
        (bundle) => bundle?.oneTimePrekeyExhausted === true,
      );

      // (1) every handed-out id is unique across all 40 responses.
      expect(new Set(handedOutIds).size).toBe(handedOutIds.length);

      // (2) exactly min(20, successful claims) one-time prekeys were handed out; the rest
      // fell back to the no-one-time-prekey bundle with the fallback flag set honestly.
      expect(handedOutIds).toHaveLength(20);
      expect(fallbacks).toHaveLength(claimantCount - 20);
      for (const bundle of bundlesForDevice) {
        if (bundle?.oneTimePrekeyExhausted === true) {
          expect(bundle.oneTimePrekey).toBeUndefined();
        } else {
          expect(bundle?.oneTimePrekey).toBeDefined();
        }
      }

      // (3) the ledger shows each handed-out id consumed exactly once.
      const ledgerRows = await dataSource.getRepository(E2eeOneTimePrekeyKeyId).find({
        where: { deviceIdentityId },
      });
      expect(ledgerRows).toHaveLength(20);
      for (const keyId of handedOutIds) {
        const matching = ledgerRows.filter((row) => row.keyId === keyId);
        expect(matching).toHaveLength(1);
        expect(matching[0]?.consumedAt).not.toBeNull();
      }

      // The public pool table agrees: exactly the handed-out ids are consumed, nothing else.
      const consumedPoolRows = await dataSource.getRepository(E2eeOneTimePrekey).find({
        where: { deviceIdentityId },
      });
      const consumedIds = consumedPoolRows
        .filter((row) => row.consumedAt !== null)
        .map((row) => row.keyId)
        .sort();
      expect(consumedIds).toEqual([...handedOutIds].sort());
    }, 60_000);

    it('the per-device drain budget rejects claims beyond its window bound even with prekeys still available', async () => {
      const now = new Date();
      const target = await newActor();
      const poolSize = PREKEY_CLAIM_RATE_LIMIT + 5;
      const { deviceId, deviceIdentityId } = await enrollTargetDevice(target, now, poolSize);
      const claimant = await newActor();

      // Sequential, not concurrent: this scenario tests the accumulated drain-budget count,
      // which only accumulates correctly against *committed* prior claims — a Promise.all
      // here would race the count check itself (each transaction reads the count before any
      // of its siblings commit) and wouldn't isolate the rate limit from that unrelated race.
      const results: boolean[] = [];
      for (let i = 0; i < poolSize; i += 1) {
        const response = await prekeys.claimPrekeyBundles(claimant.actorId, {
          conversationId: '',
          actorIds: [target.actorId],
          deviceIds: [],
        });
        const bundle = response.bundles.find((candidate) => candidate.deviceId === deviceId);
        expect(bundle).toBeDefined();
        results.push(bundle?.oneTimePrekeyExhausted !== true);
      }

      const grantedCount = results.filter(Boolean).length;
      expect(grantedCount).toBe(PREKEY_CLAIM_RATE_LIMIT);
      expect(results.slice(0, PREKEY_CLAIM_RATE_LIMIT)).toEqual(
        Array.from({ length: PREKEY_CLAIM_RATE_LIMIT }, () => true),
      );
      expect(results.slice(PREKEY_CLAIM_RATE_LIMIT)).toEqual(
        Array.from({ length: poolSize - PREKEY_CLAIM_RATE_LIMIT }, () => false),
      );

      // The rejections are the drain budget, not pool exhaustion: unconsumed prekeys remain.
      const remaining = await dataSource.getRepository(E2eeOneTimePrekey).count({
        where: { deviceIdentityId, consumedAt: IsNull() },
      });
      expect(remaining).toBe(poolSize - PREKEY_CLAIM_RATE_LIMIT);
    }, 60_000);
  },
);
