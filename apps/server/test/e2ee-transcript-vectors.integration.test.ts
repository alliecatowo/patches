import { randomUUID } from 'node:crypto';

import {
  fromHex,
  generateKeyAgreementKeyPair,
  identityTranscriptDigest,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  toHex,
} from '@patches/crypto';
import identityVector from '@patches/crypto/vectors/identity-transcripts.json';
import { createTestUser } from '@patches/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';

import { E2eeDeviceRosterService } from '../src/modules/e2ee/device-roster.service.js';
import {
  decodeCertificateTranscript,
  decodePrekeyBundleTranscript,
  decodeRosterTranscript,
  encodeCertificateTranscript,
  encodePrekeyBundleTranscript,
  encodeRosterTranscript,
} from '../src/modules/e2ee/e2ee.codec.js';
import { E2eeIdentityRootService } from '../src/modules/e2ee/identity-root.service.js';
import { E2eeRateLimitService } from '../src/modules/e2ee/e2ee-rate-limit.service.js';
import { E2eeDeviceStatus } from '@patches/proto/nest';
import { createServerTestDataSource } from './support/database.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL_SERVER ?? process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping e2ee transcript-vectors integration test: TEST_DATABASE_URL is not ' +
      'set (start Postgres with `mise run compose -- up -d`).',
  );
}

const [PROTOCOL] = identityVector.deviceCertificate.fields.supportedProtocolVersions;
if (PROTOCOL === undefined) {
  throw new Error('identity-transcripts.json vector has no supportedProtocolVersions entries');
}

function ts(ms: number): { seconds: string; nanos: number } {
  const seconds = Math.floor(ms / 1000);
  return { seconds: String(seconds), nanos: (ms - seconds * 1000) * 1_000_000 };
}

/**
 * ADR 0033 §6: the server's own proto/`Date` adapters (`apps/server/src/modules/e2ee/
 * e2ee.codec.ts`) must reproduce `@patches/crypto`'s checked-in transcript vector byte-for-byte
 * — `packages/crypto/src/vectors.test.ts` already replays the vector through the shared codec
 * directly, but nothing previously checked that *this node's* millisecond/`Date` and
 * `bigint`/`number` adaptation layer round-trips the same bytes. This was skipped when
 * `apps/server` first adopted the ADR 0033 API (commit fb3311fb) over a JSON subpath-import
 * friction that no longer reproduces (see the "no test files found" / "No projects matched"
 * false starts in the PR that added this file — the fix was simply naming this
 * `*.integration.test.ts` so the project that resolves `@patches/crypto`'s `./vectors/*`
 * export subpath picks it up, not a codec or resolver change).
 */
describe('ADR 0033 §6: server adapters reproduce the canonical identity transcript vector', () => {
  it('encodeCertificateTranscript reproduces the recorded device-certificate bytes', () => {
    const fields = identityVector.deviceCertificate.fields;
    const encoded = encodeCertificateTranscript({
      actorId: fields.actorId,
      deviceId: fields.deviceId,
      rootGeneration: fields.rootGeneration,
      rootPublicKey: fromHex(fields.rootPublicKeyHex),
      certificateVersion: fields.certificateVersion,
      signingPublicKey: fromHex(fields.signingPublicKeyHex),
      agreementPublicKey: fromHex(fields.agreementPublicKeyHex),
      supportedProtocolVersions: fields.supportedProtocolVersions,
      createdAt: new Date(fields.createdAtMs),
      expiresAt: new Date(fields.expiresAtMs),
    });
    expect(toHex(encoded)).toBe(identityVector.deviceCertificate.transcriptHex);
    expect(toHex(identityTranscriptDigest(encoded))).toBe(
      identityVector.deviceCertificate.digestHex,
    );

    const decoded = decodeCertificateTranscript(
      fromHex(identityVector.deviceCertificate.transcriptHex),
    );
    expect(decoded.actorId).toBe(fields.actorId);
    expect(decoded.deviceId).toBe(fields.deviceId);
    expect(decoded.createdAt.getTime()).toBe(fields.createdAtMs);
    expect(decoded.expiresAt.getTime()).toBe(fields.expiresAtMs);
  });

  it('encodeRosterTranscript reproduces the recorded device-roster bytes, including a revoked entry', () => {
    const fields = identityVector.deviceRoster.fields;
    const encoded = encodeRosterTranscript({
      actorId: fields.actorId,
      sequence: BigInt(fields.sequence),
      rootGeneration: fields.rootGeneration,
      rootPublicKey: fromHex(fields.rootPublicKeyHex),
      previousDigest: fromHex(fields.previousDigestHex),
      createdAt: new Date(fields.createdAtMs),
      entries: fields.entries.map((entry) => ({
        deviceId: entry.deviceId,
        certificateDigest: fromHex(entry.certificateDigestHex),
        active: entry.active,
        addedAt: new Date(entry.addedAtMs),
        revokedAt: entry.revokedAtMs === null ? undefined : new Date(entry.revokedAtMs),
      })),
    });
    expect(toHex(encoded)).toBe(identityVector.deviceRoster.transcriptHex);
    expect(toHex(identityTranscriptDigest(encoded))).toBe(identityVector.deviceRoster.digestHex);

    const decoded = decodeRosterTranscript(fromHex(identityVector.deviceRoster.transcriptHex));
    expect(decoded.sequence).toBe(BigInt(fields.sequence));
    expect(decoded.entries).toHaveLength(fields.entries.length);
    expect(decoded.entries[1]?.revokedAt?.getTime()).toBe(
      fields.entries[1]?.revokedAtMs ?? undefined,
    );
  });

  it('encodePrekeyBundleTranscript reproduces the recorded prekey-bundle bytes', () => {
    const fields = identityVector.preKeyBundle.fields;
    const encoded = encodePrekeyBundleTranscript({
      certificateDigest: fromHex(fields.certificateDigestHex),
      actorId: fields.actorId,
      deviceId: fields.deviceId,
      signedPrekeyId: BigInt(fields.signedPrekeyId),
      signedPrekeyPublicKey: fromHex(fields.signedPrekeyPublicKeyHex),
      signedPrekeyCreatedAt: new Date(fields.createdAtMs),
      signedPrekeyExpiresAt: new Date(fields.expiresAtMs),
    });
    expect(toHex(encoded)).toBe(identityVector.preKeyBundle.transcriptHex);

    const decoded = decodePrekeyBundleTranscript(
      fromHex(identityVector.preKeyBundle.transcriptHex),
    );
    expect(decoded.signedPrekeyId).toBe(BigInt(fields.signedPrekeyId));
    expect(decoded.signedPrekeyCreatedAt.getTime()).toBe(fields.createdAtMs);
  });
});

/**
 * The second half of ADR 0033 §6: `EnrollDevice` must accept a certificate/roster/prekey-bundle
 * signed with the vector's exact key material, and `GetIdentityRoot`/`GetDeviceRoster` must
 * serve back exactly what was published (issue #251's regression target — the node used to
 * discard `root_bytes`/`self_signature` and serve 32 zero bytes instead).
 *
 * The vector's own `actorId` field ("actor-vector") cannot be used as-is: `e2ee_identity_roots`/
 * `e2ee_device_identities`.`actor_id` is a `uuid` column with a real FK to `actors.id`
 * (spec §20-21), so no string literal satisfies it. This test therefore re-signs the vector's
 * root/certificate/roster/prekey-bundle fields for a real test actor's UUID using the SAME
 * private keys and the SAME field shapes (protocol string, certificate version, generation,
 * sequence) the vector pins — i.e. "a request built from that vector" in the sense of using its
 * exact cryptographic material, not a byte-identical replay of `actor-vector`'s own transcripts
 * (those are covered byte-for-byte, with no DB involved, by the describe block above).
 */
describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'ADR 0033 §6 / issue #251: EnrollDevice accepts vector key material; GetIdentityRoot serves back exact bytes',
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

    it('publishes, enrolls, and serves back the vector-derived transcripts unchanged', async () => {
      const { actor } = await createTestUser(dataSource.manager);
      const rootPrivateKey = fromHex(identityVector.keys.rootPrivateKeyHex);
      const rootPublicKey = fromHex(identityVector.keys.rootPublicKeyHex);
      // The vector's own `createdAtMs`/`expiresAtMs` (frozen at generation time, 2023) are long
      // expired by the time this test runs; verification is time-sensitive
      // (`verifyDeviceCertificate`'s `now`), so timestamps are re-derived from the current clock
      // while every other field shape (protocol string, versions, generations) still comes from
      // the vector.
      const now = Date.now();

      const signedRoot = signMessagingRoot(rootPrivateKey, {
        actorId: actor.id,
        generation: identityVector.messagingRoot.fields.generation,
        publicKey: rootPublicKey,
        createdAtMs: now,
      });

      const published = await identityRoots.publishIdentityRoot(actor.id, {
        identityRoot: {
          actorId: actor.id,
          generation: identityVector.messagingRoot.fields.generation,
          publicKey: Buffer.from(rootPublicKey),
          rootBytes: Buffer.from(signedRoot.rootBytes),
          selfSignature: Buffer.from(signedRoot.selfSignature),
          previousRootSignature: Buffer.alloc(0),
          createdAt: ts(now),
          rotatedAt: undefined,
        },
        roster: undefined,
      });

      // issue #251: GetIdentityRoot must return the exact bytes just published, not
      // `Buffer.alloc(0)`.
      const fetchedRoot = await identityRoots.getIdentityRoot({ actorId: actor.id });
      expect(
        Buffer.from(fetchedRoot.identityRoot?.rootBytes ?? []).equals(
          Buffer.from(signedRoot.rootBytes),
        ),
      ).toBe(true);
      expect(
        Buffer.from(fetchedRoot.identityRoot?.selfSignature ?? []).equals(
          Buffer.from(signedRoot.selfSignature),
        ),
      ).toBe(true);
      expect(fetchedRoot.identityRoot?.rootBytes.length).toBeGreaterThan(0);
      expect(published.identityRoot?.generation).toBe(1);

      const devicePrivateKey = fromHex(identityVector.keys.deviceSigningPrivateKeyHex);
      const deviceSigningPublicKey = fromHex(identityVector.keys.deviceSigningPublicKeyHex);
      const deviceAgreementPublicKey = fromHex(identityVector.keys.deviceAgreementPublicKeyHex);
      // `EnrollDevice` requires a UUID-shaped device id (`DEVICE_ID_PATTERN`,
      // `device-roster.service.ts`); the vector's own "device-vector-a" is a human-readable
      // fixture label, not a real device id, so this device (like the actor) gets a fresh UUID.
      const deviceId = randomUUID();
      const certificateExpiresAt = now + 30 * 24 * 60 * 60 * 1000;
      const prekeyExpiresAt = now + 7 * 24 * 60 * 60 * 1000;

      const signedCertificate = signDeviceCertificate(rootPrivateKey, {
        actorId: actor.id,
        deviceId,
        rootGeneration: identityVector.deviceCertificate.fields.rootGeneration,
        rootPublicKey,
        certificateVersion: identityVector.deviceCertificate.fields.certificateVersion,
        signingPublicKey: deviceSigningPublicKey,
        agreementPublicKey: deviceAgreementPublicKey,
        supportedProtocolVersions:
          identityVector.deviceCertificate.fields.supportedProtocolVersions,
        createdAtMs: now,
        expiresAtMs: certificateExpiresAt,
      });

      const signedRoster = signDeviceRoster(rootPrivateKey, {
        actorId: actor.id,
        rootGeneration: identityVector.deviceRoster.fields.rootGeneration,
        rootPublicKey,
        sequence: 1,
        previousDigest: new Uint8Array(32),
        createdAtMs: now,
        entries: [
          {
            deviceId,
            certificateDigest: signedCertificate.certificateDigest,
            active: true,
            addedAtMs: now,
          },
        ],
      });

      const signedPrekeyKeyPair = generateKeyAgreementKeyPair();
      const signedPrekey = signPreKeyBundle(devicePrivateKey, {
        actorId: actor.id,
        deviceId,
        certificateDigest: signedCertificate.certificateDigest,
        signedPrekeyId: identityVector.preKeyBundle.fields.signedPrekeyId,
        signedPrekeyPublicKey: signedPrekeyKeyPair.publicKey,
        createdAtMs: now,
        expiresAtMs: prekeyExpiresAt,
      });

      const enrolled = await deviceRosters.enrollDevice(actor.id, {
        certificate: {
          actorId: actor.id,
          deviceId,
          rootGeneration: identityVector.deviceCertificate.fields.rootGeneration,
          certificateVersion: identityVector.deviceCertificate.fields.certificateVersion,
          signingPublicKey: Buffer.from(deviceSigningPublicKey),
          agreementPublicKey: Buffer.from(deviceAgreementPublicKey),
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
          actorId: actor.id,
          sequence: '1',
          rootGeneration: identityVector.deviceRoster.fields.rootGeneration,
          previousDigest: Buffer.from(new Uint8Array(32)),
          digest: Buffer.from(signedRoster.rosterDigest),
          rosterBytes: Buffer.from(signedRoster.rosterBytes),
          rootSignature: Buffer.from(signedRoster.rootSignature),
          entries: [
            {
              deviceId,
              certificateDigest: Buffer.from(signedCertificate.certificateDigest),
              active: true,
              addedAt: ts(now),
              revokedAt: undefined,
            },
          ],
          createdAt: ts(now),
        },
        signedPrekey: {
          keyId: String(identityVector.preKeyBundle.fields.signedPrekeyId),
          publicKey: Buffer.from(signedPrekeyKeyPair.publicKey),
          signature: Buffer.from(signedPrekey.deviceSignature),
          createdAt: ts(now),
          expiresAt: ts(prekeyExpiresAt),
        },
        oneTimePrekeys: [],
        prekeyBundleBytes: Buffer.from(signedPrekey.bundleBytes),
        prekeyBundleSignature: Buffer.from(signedPrekey.deviceSignature),
      });

      expect(enrolled.roster?.sequence).toBe('1');
      expect(
        Buffer.from(enrolled.certificate?.certificateBytes ?? []).equals(
          Buffer.from(signedCertificate.certificateBytes),
        ),
      ).toBe(true);

      const roster = await deviceRosters.getDeviceRoster({ actorId: actor.id });
      expect(roster.roster?.entries).toHaveLength(1);
      expect(roster.roster?.entries[0]?.deviceId).toBe(deviceId);
      expect(roster.certificates).toHaveLength(1);
    }, 30_000);
  },
);
