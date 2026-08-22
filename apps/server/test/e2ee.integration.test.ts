import { randomBytes, randomUUID } from 'node:crypto';

import { generateSigningKeyPair, sha256Hash, sign } from '@patches/crypto';
import {
  Conversation as ConversationEntity,
  ConversationMember as ConversationMemberEntity,
} from '@patches/database';
import { canonicalFanoutTranscript, E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import { createTestUser } from '@patches/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';

import { E2eeConversationService } from '../src/modules/e2ee/e2ee-conversation.service.js';
import { E2eeDeviceRosterService } from '../src/modules/e2ee/device-roster.service.js';
import {
  encodeCertificateTranscript,
  encodePrekeyBundleTranscript,
  encodeRosterTranscript,
} from '../src/modules/e2ee/e2ee.codec.js';
import { E2eeIdentityRootService } from '../src/modules/e2ee/identity-root.service.js';
import { E2eePrekeyService } from '../src/modules/e2ee/prekey.service.js';
import { E2eeRuntimeApprovalPolicy } from '../src/modules/e2ee/e2ee-runtime-approval-policy.js';
import { type NodeFrankingKeyRing } from '../src/modules/e2ee/report-evidence.js';
import { createServerTestDataSource } from './support/database.js';

/** A fixed test-only franking key so `SendEnvelopes`/`CreateE2eeConversation` can actually issue
 * an acceptance tag. Distinct from the production `DatabaseNodeFrankingKeyRing` (P13-015),
 * backed by `e2ee_node_franking_keys` — these services are constructed directly here (not
 * through Nest DI), so this fake is passed positionally instead. */
const TEST_FRANKING_ERA = 1;
const TEST_FRANKING_KEY = new Uint8Array(32).fill(9);
const testFrankingKeyRing: NodeFrankingKeyRing = {
  keyForEra: (era) => (era === TEST_FRANKING_ERA ? TEST_FRANKING_KEY : undefined),
  knownEras: () => [TEST_FRANKING_ERA],
  currentEra: () => TEST_FRANKING_ERA,
};

/** ADR 0027 test seam: this does not change the frozen production approval list. */
const unreviewedTestPolicy = new E2eeRuntimeApprovalPolicy(true);

interface TestEnvelope {
  recipientActorId: string;
  recipientDeviceId: string;
  encryptedHeader: Buffer;
  ciphertext: Buffer;
  openingCiphertext: Buffer;
  ciphertextDigest: Buffer;
}

/** Builds one opaque per-device envelope. Every `bytes` field is opaque to the node (ADR 0020
 * §8) — random bytes are indistinguishable from real Double Ratchet output for everything this
 * test suite checks. `openingCiphertext` is empty because ADR 0025 §3 moved the franking opening
 * into the inner authenticated plaintext; a v1 envelope that fills it is rejected. */
function buildEnvelope(recipientActorId: string, recipientDeviceId: string): TestEnvelope {
  const ciphertext = randomBytes(64);
  return {
    recipientActorId,
    recipientDeviceId,
    encryptedHeader: randomBytes(32),
    ciphertext,
    openingCiphertext: Buffer.alloc(0),
    ciphertextDigest: Buffer.from(sha256Hash(ciphertext)),
  };
}

/**
 * Builds a correctly-shaped `E2eeLogicalMessage` proto covering exactly `envelopes` — real
 * `fanoutDigest`, valid franking profile/commitment length, current membership epoch.
 *
 * The node cannot verify a franking commitment: it has no plaintext and never will (ADR 0025,
 * "What the node can and cannot conclude"). What it *can* check, and what this helper therefore
 * has to get right, is that the declared `fanout_digest` covers the profile and commitment the
 * same send declares. `commitmentOverride` lets a test declare one commitment while the digest
 * covers another, which is the adversarial case below.
 */
function buildLogicalMessage(
  envelopes: readonly TestEnvelope[],
  options: { commitment?: Buffer; commitmentOverride?: Buffer } = {},
) {
  const commitment = options.commitment ?? Buffer.from(sha256Hash(randomBytes(16)));
  const view = envelopes.map((envelope) => ({
    recipientActorId: envelope.recipientActorId,
    recipientDeviceId: envelope.recipientDeviceId,
    encryptedHeader: new Uint8Array(0),
    ciphertext: new Uint8Array(0),
    openingCiphertext: new Uint8Array(envelope.openingCiphertext),
    ciphertextDigest: new Uint8Array(envelope.ciphertextDigest),
  }));
  const fanoutDigest = sha256Hash(
    canonicalFanoutTranscript({
      frankingProfile: E2EE_FRANKING_PROFILE_V1,
      frankingCommitment: new Uint8Array(commitment),
      deviceEnvelopes: view,
    }),
  );
  return {
    membershipEpoch: '1',
    frankingCommitment: options.commitmentOverride ?? commitment,
    frankingProfile: E2EE_FRANKING_PROFILE_V1,
    fanoutDigest: Buffer.from(fanoutDigest),
    deviceEnvelopes: [...envelopes],
  };
}

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
    let conversations: E2eeConversationService;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      identityRoots = new E2eeIdentityRootService(dataSource);
      deviceRosters = new E2eeDeviceRosterService(dataSource);
      prekeys = new E2eePrekeyService(dataSource);
      conversations = new E2eeConversationService(
        dataSource,
        testFrankingKeyRing,
        unreviewedTestPolicy,
      );
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

    /** Enrolls a second active device for `actor` by publishing the next roster with the new
     * device appended and active — factored out of the "stale roster" fanout test below so the
     * multi-device fanout test can reuse it without repeating the roster bookkeeping. */
    async function enrollAdditionalDevice(actor: TestActorKeys): Promise<DeviceKeys> {
      const device = newDevice();
      const now = new Date();
      const currentRoster = await deviceRosters.getDeviceRoster({ actorId: actor.actorId });
      const certificate = signedCertificate(actor, device, now);
      const entries = [
        ...(currentRoster.roster?.entries ?? []).map((entry) => ({
          deviceId: entry.deviceId,
          certificateDigest: entry.certificateDigest,
          active: entry.active,
        })),
        {
          deviceId: device.deviceId,
          certificateDigest: certificate.certificateDigest,
          active: true,
        },
      ];
      const roster = signedRoster(
        actor,
        BigInt(currentRoster.roster?.sequence ?? '0') + 1n,
        currentRoster.roster?.digest as Buffer,
        entries,
        now,
      );
      const bundle = signedPrekeyBundle(actor, device, certificate.certificateDigest, 1n, now);
      await deviceRosters.enrollDevice(actor.actorId, {
        certificate,
        roster,
        signedPrekey: bundle.signedPrekey,
        oneTimePrekeys: [],
        prekeyBundleBytes: bundle.prekeyBundleBytes,
        prekeyBundleSignature: bundle.prekeyBundleSignature,
      } as never);
      return device;
    }

    /** Revokes `device` by publishing the next roster with it marked inactive — mirrors the
     * "revokes a device" test above, factored out so the fanout tests below can revoke
     * mid-scenario without repeating the roster bookkeeping. */
    async function revokeEnrolledDevice(actor: TestActorKeys, device: DeviceKeys): Promise<void> {
      const currentRoster = await deviceRosters.getDeviceRoster({ actorId: actor.actorId });
      const nextSequence = BigInt(currentRoster.roster?.sequence ?? '0') + 1n;
      const entries = (currentRoster.roster?.entries ?? []).map((entry) => ({
        deviceId: entry.deviceId,
        certificateDigest: entry.certificateDigest,
        active: entry.deviceId === device.deviceId ? false : entry.active,
      }));
      const roster = signedRoster(
        actor,
        nextSequence,
        currentRoster.roster?.digest as Buffer,
        entries,
        new Date(),
      );
      await deviceRosters.revokeDevice(actor.actorId, { deviceId: device.deviceId, roster });
    }

    describe('SendEnvelopes/CreateE2eeConversation fanout (ADR 0020 §7, P13-007)', () => {
      it('keeps the default runtime policy fail-closed before persisting an E2EE conversation', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);
        const defaultPolicyConversations = new E2eeConversationService(
          dataSource,
          testFrankingKeyRing,
          new E2eeRuntimeApprovalPolicy(false),
        );
        const conversationCountBefore = await dataSource
          .getRepository(ConversationEntity)
          .countBy({ createdByActorId: sender.actorId });
        const membershipCountBefore = await dataSource
          .getRepository(ConversationMemberEntity)
          .countBy({ actorId: sender.actorId });

        await expect(
          defaultPolicyConversations.createE2eeConversation(sender.actorId, {
            clientRequestId: randomUUID(),
            recipientActorIds: [recipient.actorId],
            senderDeviceId: senderDevice.deviceId,
            message: buildLogicalMessage([
              buildEnvelope(recipient.actorId, recipientDevice.deviceId),
            ]),
          }),
        ).rejects.toThrow('independent review');

        await expect(
          dataSource
            .getRepository(ConversationEntity)
            .countBy({ createdByActorId: sender.actorId }),
        ).resolves.toBe(conversationCountBefore);
        await expect(
          dataSource.getRepository(ConversationMemberEntity).countBy({ actorId: sender.actorId }),
        ).resolves.toBe(membershipCountBefore);

        const mailbox = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: recipientDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(mailbox.envelopes).toHaveLength(0);
      });

      it('creates an E2EE conversation, delivering to the recipient device but never to the sender’s own sending device', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);

        const envelope = buildEnvelope(recipient.actorId, recipientDevice.deviceId);
        const response = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([envelope]),
        });

        expect(response.conversationId.length).toBeGreaterThan(0);
        expect(response.frankingTag?.tag.length).toBe(32);

        const mailbox = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: recipientDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(mailbox.envelopes).toHaveLength(1);
        expect(mailbox.envelopes[0]?.logicalMessageId).toBe(response.logicalMessageId);

        // The sender's own device never receives a copy of a conversation it has no other
        // devices in — nothing to converge to yet.
        const senderMailbox = await conversations.listMailboxEnvelopes(sender.actorId, {
          deviceId: senderDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(senderMailbox.envelopes).toHaveLength(0);
      });

      it('SendEnvelopes retried with the same client_request_id replays the original acceptance instead of duplicating delivery (dedup)', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);

        const clientRequestId = randomUUID();
        const message = buildLogicalMessage([
          buildEnvelope(recipient.actorId, recipientDevice.deviceId),
        ]);
        const created = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId,
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
          message,
        });

        // A resend: same conversation, same client_request_id, same message — exactly what a
        // client retrying after a dropped response would send.
        const retried = await conversations.sendEnvelopes(sender.actorId, {
          conversationId: created.conversationId,
          clientRequestId,
          senderDeviceId: senderDevice.deviceId,
          message,
        });

        expect(retried.logicalMessageId).toBe(created.logicalMessageId);
        expect(retried.frankingTag?.tag).toEqual(created.frankingTag?.tag);

        const mailbox = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: recipientDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        // Not two envelopes: the retry did not create a second session/delivery.
        expect(mailbox.envelopes).toHaveLength(1);
      });

      /**
       * ADR 0024 B-045/B-046, ADR 0025 §5. The node cannot verify a franking commitment — it has
       * no plaintext — but it can refuse a send that is internally inconsistent about which
       * commitment it is making. Before ADR 0025 the commitment was outside every transcript in
       * the system, so this send was accepted and franked; the *existing* happy path of this
       * suite used to declare a commitment unrelated to anything and succeed.
       */
      it('rejects a send whose fanout digest does not cover the franking commitment it declares', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);

        const envelope = buildEnvelope(recipient.actorId, recipientDevice.deviceId);
        await expect(
          conversations.createE2eeConversation(sender.actorId, {
            clientRequestId: randomUUID(),
            recipientActorIds: [recipient.actorId],
            senderDeviceId: senderDevice.deviceId,
            // The digest covers one commitment; the send declares another. A sender that wants a
            // free-floating commitment it never has to honour has to produce this shape.
            message: buildLogicalMessage([envelope], {
              commitmentOverride: Buffer.from(sha256Hash(randomBytes(16))),
            }),
          }),
        ).rejects.toThrow(/fanout|digest/i);
      });

      /**
       * ADR 0025 §3: under `patches-franking-v1` the franking opening travels inside the inner
       * authenticated plaintext, where the body AEAD tag covers it. An envelope that also ships a
       * separate sealed opening is rejected rather than quietly stored — an opening the node can
       * separate from the ciphertext it opens is one the node can drop.
       */
      it('rejects a v1 envelope that carries a separate sealed franking opening', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);

        const envelope = {
          ...buildEnvelope(recipient.actorId, recipientDevice.deviceId),
          openingCiphertext: randomBytes(32),
        };
        await expect(
          conversations.createE2eeConversation(sender.actorId, {
            clientRequestId: randomUUID(),
            recipientActorIds: [recipient.actorId],
            senderDeviceId: senderDevice.deviceId,
            message: buildLogicalMessage([envelope]),
          }),
        ).rejects.toThrow(/franking opening travels inside the ciphertext/);
      });

      it('rejects a fanout that omits a device enrolled after the sender last read the roster, rather than silently excluding it', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: firstDevice } = await enrollFirstDevice(recipient, 0);

        const created = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([buildEnvelope(recipient.actorId, firstDevice.deviceId)]),
        });

        // A second device becomes active for the recipient — enrolled *after* a hypothetical
        // sender read the roster used above.
        const secondDevice = await enrollAdditionalDevice(recipient);

        // Composed against the *old* device set — still addressed only to `firstDevice`.
        const staleMessage = buildLogicalMessage([
          buildEnvelope(recipient.actorId, firstDevice.deviceId),
        ]);
        await expect(
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: created.conversationId,
            clientRequestId: randomUUID(),
            senderDeviceId: senderDevice.deviceId,
            message: staleMessage,
          }),
        ).rejects.toMatchObject({ code: 'E2EE_FANOUT_REJECTED' });

        // The whole send was rejected — not partially delivered to `firstDevice` while silently
        // skipping `secondDevice`.
        const firstMailbox = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: firstDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(
          firstMailbox.envelopes.filter((e) => e.logicalMessageId !== created.logicalMessageId),
        ).toHaveLength(0);
        const secondMailbox = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: secondDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(secondMailbox.envelopes).toHaveLength(0);
      });

      it('delivers to every active device of the recipient and every other active device of the sender (Sesame per-device fanout, ADR 0020 §7)', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice1 } = await enrollFirstDevice(sender, 0);
        const senderDevice2 = await enrollAdditionalDevice(sender);
        const { device: recipientDevice1 } = await enrollFirstDevice(recipient, 0);
        const recipientDevice2 = await enrollAdditionalDevice(recipient);

        const created = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice1.deviceId,
          message: buildLogicalMessage([
            buildEnvelope(recipient.actorId, recipientDevice1.deviceId),
            buildEnvelope(recipient.actorId, recipientDevice2.deviceId),
            buildEnvelope(sender.actorId, senderDevice2.deviceId),
          ]),
        });

        // Both of the recipient's active devices get their own session's copy.
        for (const deviceId of [recipientDevice1.deviceId, recipientDevice2.deviceId]) {
          const mailbox = await conversations.listMailboxEnvelopes(recipient.actorId, {
            deviceId,
            cursor: '',
            limit: 0,
          });
          expect(mailbox.envelopes.map((e) => e.logicalMessageId)).toEqual([
            created.logicalMessageId,
          ]);
        }

        // The sender's *other* device converges too (sent history, ADR 0020 §7) — but never the
        // literal sending device itself.
        const senderDevice2Mailbox = await conversations.listMailboxEnvelopes(sender.actorId, {
          deviceId: senderDevice2.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(senderDevice2Mailbox.envelopes.map((e) => e.logicalMessageId)).toEqual([
          created.logicalMessageId,
        ]);
        const senderDevice1Mailbox = await conversations.listMailboxEnvelopes(sender.actorId, {
          deviceId: senderDevice1.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(senderDevice1Mailbox.envelopes).toHaveLength(0);
      });

      it('revocation race, direction 1: a device revoked before the send commits never receives the envelope', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);

        const created = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([
            buildEnvelope(recipient.actorId, recipientDevice.deviceId),
          ]),
        });

        // Revoke commits fully before the next send starts — no overlap, so this is the
        // deterministic half of the race (the concurrent half is exercised below).
        await revokeEnrolledDevice(recipient, recipientDevice);

        await expect(
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: created.conversationId,
            clientRequestId: randomUUID(),
            senderDeviceId: senderDevice.deviceId,
            message: buildLogicalMessage([
              buildEnvelope(recipient.actorId, recipientDevice.deviceId),
            ]),
          }),
        ).rejects.toMatchObject({ code: 'E2EE_FANOUT_REJECTED' });
      });

      it('revocation race, direction 2: SendEnvelopes and RevokeDevice racing concurrently never deliver to a device that was actually revoked first, and never lose a message to a device that was actually still active', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);

        const created = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([
            buildEnvelope(recipient.actorId, recipientDevice.deviceId),
          ]),
        });

        const sendClientRequestId = randomUUID();
        const [sendOutcome, revokeOutcome] = await Promise.allSettled([
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: created.conversationId,
            clientRequestId: sendClientRequestId,
            senderDeviceId: senderDevice.deviceId,
            message: buildLogicalMessage([
              buildEnvelope(recipient.actorId, recipientDevice.deviceId),
            ]),
          }),
          revokeEnrolledDevice(recipient, recipientDevice),
        ]);

        // `RevokeDevice`'s roster-append always succeeds regardless of ordering — it is the
        // *device row's* `revoked_at` that the fanout's `SELECT ... FOR SHARE` lock serializes
        // against, not the roster append itself.
        expect(revokeOutcome.status).toBe('fulfilled');

        const mailbox = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: recipientDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        const delivered = mailbox.envelopes.some(
          (envelope) => envelope.logicalMessageId !== created.logicalMessageId,
        );

        if (sendOutcome.status === 'fulfilled') {
          // The send's `FOR SHARE` lock won the race: the device was still active when it was
          // read, so it legitimately receives this envelope.
          expect(delivered).toBe(true);
        } else {
          // The revoke committed first: the send must fail closed with the fanout-rejected code,
          // never hang, never silently "succeed" while dropping the recipient.
          expect(delivered).toBe(false);
          expect((sendOutcome.reason as { code?: string }).code).toBe('E2EE_FANOUT_REJECTED');
        }

        // Whichever order won, the device is revoked now: a further send addressed to it must
        // always be rejected, regardless of which branch above ran.
        await expect(
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: created.conversationId,
            clientRequestId: randomUUID(),
            senderDeviceId: senderDevice.deviceId,
            message: buildLogicalMessage([
              buildEnvelope(recipient.actorId, recipientDevice.deviceId),
            ]),
          }),
        ).rejects.toMatchObject({ code: 'E2EE_FANOUT_REJECTED' });
      });
    });

    describe('ListMailboxEnvelopes/AcknowledgeEnvelopes convergence (ADR 0020 §7, P13-007)', () => {
      it('an offline device catches up on everything that accumulated, then drains its mailbox by acknowledging', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);

        const created = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([
            buildEnvelope(recipient.actorId, recipientDevice.deviceId),
          ]),
        });
        const second = await conversations.sendEnvelopes(sender.actorId, {
          conversationId: created.conversationId,
          clientRequestId: randomUUID(),
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([
            buildEnvelope(recipient.actorId, recipientDevice.deviceId),
          ]),
        });

        // The recipient device was "offline" for both sends; it now logs in and lists its
        // mailbox for the first time — both messages must be there, oldest first.
        const firstPage = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: recipientDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(firstPage.envelopes.map((envelope) => envelope.logicalMessageId)).toEqual([
          created.logicalMessageId,
          second.logicalMessageId,
        ]);

        await conversations.acknowledgeEnvelopes(recipient.actorId, {
          deviceId: recipientDevice.deviceId,
          envelopeIds: firstPage.envelopes.map((envelope) => envelope.envelopeId),
        });

        const drained = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: recipientDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(drained.envelopes).toHaveLength(0);
      });
    });
  },
);
