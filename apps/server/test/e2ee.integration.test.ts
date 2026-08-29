import { randomBytes, randomUUID } from 'node:crypto';

import {
  generateSigningKeyPair,
  sha256Hash,
  sign,
  signMessagingRoot,
  verifyMessagingRoot,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
} from '@patches/crypto';
import {
  Conversation as ConversationEntity,
  ConversationMember as ConversationMemberEntity,
  Notification as NotificationEntity,
} from '@patches/database';
import {
  canonicalFanoutTranscript,
  canonicalGroupControlTranscript,
  E2EE_FRANKING_PROFILE_V1,
  verifyIdentityRoot,
} from '@patches/domain';
import { createTestFollow, createTestUser } from '@patches/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';

import { E2eeConversationService } from '../src/modules/e2ee/e2ee-conversation.service.js';
import { E2eeDeviceRosterService } from '../src/modules/e2ee/device-roster.service.js';
import { e2eeSignatureVerifier } from '../src/modules/e2ee/e2ee-crypto.adapter.js';
import { E2eeRateLimitService } from '../src/modules/e2ee/e2ee-rate-limit.service.js';
import { NotificationsService } from '../src/modules/notifications/notification.service.js';
import { MessagesService } from '../src/modules/messages/messages.service.js';
import {
  encodeCertificateTranscript,
  encodePrekeyBundleTranscript,
  encodeRosterTranscript,
} from '../src/modules/e2ee/e2ee.codec.js';
import { E2eeGroupService } from '../src/modules/e2ee/group-control.service.js';
import { E2eeIdentityRootService } from '../src/modules/e2ee/identity-root.service.js';
import { E2eePrekeyService } from '../src/modules/e2ee/prekey.service.js';
import { type NodeFrankingKeyRing } from '../src/modules/e2ee/report-evidence.js';
import { createServerTestDataSource } from './support/database.js';
import { E2eeGroupChangeKind } from '@patches/proto/nest';

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
  options: {
    commitment?: Buffer;
    commitmentOverride?: Buffer;
    epoch?: bigint;
    profile?: string;
  } = {},
) {
  const commitment = options.commitment ?? Buffer.from(sha256Hash(randomBytes(16)));
  const profile = options.profile ?? E2EE_FRANKING_PROFILE_V1;
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
    membershipEpoch: (options.epoch ?? 1n).toString(),
    frankingCommitment: options.commitmentOverride ?? commitment,
    frankingProfile: profile,
    fanoutDigest: Buffer.from(fanoutDigest),
    deviceEnvelopes: [...envelopes],
  };
}

/**
 * ADR 0035: `CreateE2eeConversation` reserves a conversation (no message); the first message is
 * an ordinary `SendEnvelopes` into the id it returns. Every former one-shot
 * `createE2eeConversation({ ..., message })` call site becomes this two-step sequence — the
 * merged result still carries `conversationId` plus every `SendEnvelopesResponse` field
 * (`logicalMessageId`, `frankingTag`, `acceptedAt`, `fanoutDigest`,
 * `acceptedRecipientDeviceIds`), so existing assertions against a `created.<field>` shape keep
 * working unchanged.
 */
async function reserveAndSend(
  conversations: E2eeConversationService,
  senderActorId: string,
  recipientActorIds: readonly string[],
  senderDeviceId: string,
  message: ReturnType<typeof buildLogicalMessage>,
  clientRequestId: string = randomUUID(),
) {
  const reserved = await conversations.createE2eeConversation(senderActorId, {
    clientRequestId: randomUUID(),
    recipientActorIds: [...recipientActorIds],
    senderDeviceId,
  });
  const sent = await conversations.sendEnvelopes(senderActorId, {
    conversationId: reserved.conversationId,
    clientRequestId,
    senderDeviceId,
    message,
  });
  return { ...sent, conversationId: reserved.conversationId };
}

/** Builds a correctly-signed `E2eeGroupControlEvent` proto: canonical transcript from
 * `@patches/domain` (the one encoder the signer and the node share, ADR 0020 §14.1), digest
 * over it, Ed25519 by the signer device's signing key. `change` takes the generated
 * ts-proto enum's string values — this schema generates string enums. */
function signedGroupControlEvent(input: {
  conversationId: string;
  epoch: bigint;
  change: E2eeGroupChangeKind;
  subjectActorId: string;
  signer: TestActorKeys;
  signerDevice: DeviceKeys;
  previousDigest: Buffer;
}) {
  const eventBytes = Buffer.from(
    canonicalGroupControlTranscript({
      conversationId: input.conversationId,
      epoch: input.epoch,
      change:
        input.change === E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED ? 'ADDED' : 'REMOVED',
      subjectActorId: input.subjectActorId,
      signerActorId: input.signer.actorId,
      signerDeviceId: input.signerDevice.deviceId,
      previousDigest: new Uint8Array(input.previousDigest),
    }),
  );
  return {
    conversationId: input.conversationId,
    epoch: input.epoch.toString(),
    change: input.change,
    subjectActorId: input.subjectActorId,
    signerActorId: input.signer.actorId,
    signerDeviceId: input.signerDevice.deviceId,
    previousDigest: input.previousDigest,
    digest: Buffer.from(sha256Hash(new Uint8Array(eventBytes))),
    eventBytes,
    deviceSignature: Buffer.from(sign(input.signerDevice.signingPrivateKey, eventBytes)),
    createdAt: undefined,
  };
}

const ZERO_DIGEST = Buffer.alloc(32);

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
      rootPublicKey: actor.rootPublicKey,
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
      rootPublicKey: actor.rootPublicKey,
      previousDigest,
      createdAt: now,
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
    createdAt: ts(now),
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
    let groups: E2eeGroupService;

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
      prekeys = new E2eePrekeyService(
        dataSource,
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
      );
      conversations = new E2eeConversationService(
        dataSource,
        testFrankingKeyRing,
        // No-op budgets: this suite exercises fanout/protocol behavior, not §188 windows
        // (covered by e2ee-rate-limit.service.test.ts), and would blow through them.
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
        new NotificationsService(dataSource),
      );
      groups = new E2eeGroupService(
        dataSource,
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
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

    /**
     * E2EE conversations enforce the same §183.2 first-contact eligibility as legacy DMs
     * (mutual follow), so conversation-level tests must establish the social edge first.
     */
    async function allowDirectMessaging(fromActorId: string, toActorId: string): Promise<void> {
      await createTestFollow(dataSource.manager, {
        followerActorId: fromActorId,
        followeeActorId: toActorId,
      });
      await createTestFollow(dataSource.manager, {
        followerActorId: toActorId,
        followeeActorId: fromActorId,
      });
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

    it('GetIdentityRoot serves the exact published root_bytes/self_signature a peer can verify (issue #251)', async () => {
      const actor = await newActor();
      const published = signedIdentityRoot(actor);
      await identityRoots.publishIdentityRoot(actor.actorId, {
        identityRoot: published,
        roster: undefined,
      });

      const { identityRoot } = await identityRoots.getIdentityRoot({ actorId: actor.actorId });
      expect(identityRoot).toBeDefined();
      expect(identityRoot?.rootBytes.length).toBeGreaterThan(0);
      expect(identityRoot?.selfSignature.length).toBeGreaterThan(0);
      // The peer-facing RPC must round-trip the exact bytes that were published, not a
      // node-side re-derivation — that's what a peer client's own verification is against.
      expect(Buffer.from(identityRoot?.rootBytes ?? [])).toEqual(published.rootBytes);
      expect(Buffer.from(identityRoot?.selfSignature ?? [])).toEqual(published.selfSignature);

      // And a peer, with only the served proto in hand, can actually run the verification
      // `e2ee.proto`'s doc comment on `root_bytes` promises is possible.
      expect(() =>
        verifyIdentityRoot(
          {
            actorId: identityRoot?.actorId ?? '',
            generation: identityRoot?.generation ?? 0,
            publicKey: new Uint8Array(identityRoot?.publicKey ?? []),
            rootBytes: new Uint8Array(identityRoot?.rootBytes ?? []),
            selfSignature: new Uint8Array(identityRoot?.selfSignature ?? []),
          },
          { verifier: e2eeSignatureVerifier },
        ),
      ).not.toThrow();
    });

    it('a second actor can verify the served root → roster → prekey-bundle chain end to end (issue #251)', async () => {
      // The peer whose chain we verify, and the second actor playing the verifying client.
      // The claimant only ever sees the bytes the peer-facing RPCs (`GetIdentityRoot`,
      // `GetDeviceRoster`, `ClaimPrekeyBundles`) hand back — the canonical proof that the
      // identity-root transcript is the root of the chain (ADR 0033 §3).
      const peer = await newActor();
      const claimant = await newActor();

      // Publish the peer's messaging root with a *canonical* encoded transcript (what a real
      // client, not a convenient ad-hoc byte string, signs over) so the peer's
      // `verifyMessagingRoot` — unlike the node's opaque `verifyIdentityRoot` — can decode it.
      // The transcript's `createdAtMs` is a moment in the past so it is already valid when the
      // (later) roster and prekey bundle it anchors are verified.
      const rootCreatedAtMs = Date.now() - 1_000;
      const signedRoot = signMessagingRoot(peer.rootPrivateKey, {
        actorId: peer.actorId,
        generation: 1,
        publicKey: peer.rootPublicKey,
        createdAtMs: rootCreatedAtMs,
      });
      await identityRoots.publishIdentityRoot(peer.actorId, {
        identityRoot: {
          ...signedIdentityRoot(peer),
          rootBytes: Buffer.from(signedRoot.rootBytes),
          selfSignature: Buffer.from(signedRoot.selfSignature),
        },
        roster: undefined,
      });

      // Enroll the peer's first device (certificate + roster + signed prekey + one-time
      // prekeys, one atomic publish) — yields the chain the claimant will verify.
      const device = newDevice();
      const now = new Date();
      const enrolledCertificate = signedCertificate(peer, device, now);
      const enrolledRoster = signedRoster(
        peer,
        1n,
        ZERO_32,
        [
          {
            deviceId: device.deviceId,
            certificateDigest: enrolledCertificate.certificateDigest,
            active: true,
          },
        ],
        now,
      );
      const enrolledBundle = signedPrekeyBundle(
        peer,
        device,
        enrolledCertificate.certificateDigest,
        1n,
        now,
      );
      await deviceRosters.enrollDevice(peer.actorId, {
        certificate: enrolledCertificate,
        roster: enrolledRoster,
        signedPrekey: enrolledBundle.signedPrekey,
        oneTimePrekeys: oneTimePrekeys(1, 1),
        prekeyBundleBytes: enrolledBundle.prekeyBundleBytes,
        prekeyBundleSignature: enrolledBundle.prekeyBundleSignature,
      } as never);

      // Verification time — later than every artifact's creation time above, so the whole
      // chain is already in its validity window when the second actor checks it.
      const nowMs = Date.now();

      const { identityRoot } = await identityRoots.getIdentityRoot({ actorId: peer.actorId });
      expect(identityRoot).toBeDefined();
      const root = verifyMessagingRoot({
        rootBytes: new Uint8Array(identityRoot?.rootBytes ?? []),
        selfSignature: new Uint8Array(identityRoot?.selfSignature ?? []),
        nowMs,
      });
      // Fail-closed: the branded root is the only way into the chain, so tampered served bytes
      // must throw (ADR 0033 §3; the verifier never accepts unchecked material).
      const tampered = Buffer.from(identityRoot?.rootBytes ?? []);
      const lastByte = tampered[tampered.length - 1] ?? 0;
      tampered[tampered.length - 1] = lastByte ^ 0xff;
      expect(() =>
        verifyMessagingRoot({
          rootBytes: new Uint8Array(tampered),
          selfSignature: new Uint8Array(identityRoot?.selfSignature ?? []),
          nowMs,
        }),
      ).toThrow();

      // 2. Roster: served roster bytes + the served device certificate, the certificate bound
      // to the very root verified above.
      const { roster, certificates } = await deviceRosters.getDeviceRoster({
        actorId: peer.actorId,
      });
      expect(roster).toBeDefined();
      expect(certificates).toHaveLength(1);
      const verifiedRoster = verifyRosterSnapshot({
        rosterBytes: new Uint8Array(roster?.rosterBytes ?? []),
        rootSignature: new Uint8Array(roster?.rootSignature ?? []),
        root,
        certificates: certificates.map((c) => ({
          certificateBytes: new Uint8Array(c.certificateBytes),
          rootSignature: new Uint8Array(c.rootSignature),
        })),
        nowMs,
      });

      // 3. Prekey bundle: claimed by the *second* actor straight off the wire and verified
      // against the roster and the certificate carried inside the bundle itself.
      const { bundles } = await prekeys.claimPrekeyBundles(claimant.actorId, {
        conversationId: '',
        actorIds: [peer.actorId],
        deviceIds: [],
      });
      expect(bundles).toHaveLength(1);
      const bundle = bundles[0];
      const certificate = bundle?.deviceCertificate;
      expect(certificate).toBeDefined();
      expect(bundle?.signedPrekey).toBeDefined();
      const verifiedBundle = verifyPreKeyBundle({
        bundleBytes: new Uint8Array(bundle?.bundleBytes ?? []),
        deviceSignature: new Uint8Array(bundle?.deviceSignature ?? []),
        certificateBytes: new Uint8Array(certificate?.certificateBytes ?? []),
        certificateRootSignature: new Uint8Array(certificate?.rootSignature ?? []),
        oneTimePreKey:
          bundle?.oneTimePrekey === undefined || bundle.oneTimePrekeyExhausted
            ? undefined
            : {
                id: Number(bundle.oneTimePrekey.keyId),
                publicKey: new Uint8Array(bundle.oneTimePrekey.publicKey),
              },
        roster: verifiedRoster,
        nowMs,
      });
      // The claimed bundle binds to the peer's verified device, not a convenience id the node
      // happened to echo back.
      expect(verifiedBundle.deviceId).toBe(device.deviceId);
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
      const [rows] = await dataSource.query<Array<{ public_prekeys: string; issued_ids: string }>>(
        `SELECT
           (SELECT count(*) FROM e2ee_one_time_prekeys WHERE device_identity_id = d.id) AS public_prekeys,
           (SELECT count(*) FROM e2ee_one_time_prekey_key_ids WHERE device_identity_id = d.id) AS issued_ids
         FROM e2ee_device_identities d WHERE d.actor_id = $1 AND d.device_id = $2`,
        [actor.actorId, device.deviceId],
      );
      // Revocation removes public unused material, but not the immutable issued-ID namespace.
      expect(rows).toEqual({ public_prekeys: '0', issued_ids: '3' });
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

    it('uploads a rotated signed prekey and rejects one-time top-ups past the inventory target', async () => {
      const actor = await newActor();
      const { device } = await enrollFirstDevice(actor, 2);
      const certificateDigest = (await deviceRosters.getDeviceRoster({ actorId: actor.actorId }))
        .certificates[0]?.certificateDigest as unknown as Uint8Array;
      const now = Date.now() + 1000;
      // Over-capacity is an explicit error, never silent truncation (audit P2 fix).
      const overBundle = signedPrekeyBundle(actor, device, certificateDigest, 2n, new Date(now));
      await expect(
        prekeys.uploadPrekeys(actor.actorId, {
          deviceId: device.deviceId,
          signedPrekey: overBundle.signedPrekey,
          oneTimePrekeys: oneTimePrekeys(200, 100),
          prekeyBundleBytes: overBundle.prekeyBundleBytes,
          prekeyBundleSignature: overBundle.prekeyBundleSignature,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      // Room for exactly 98 more under the 100-per-device target.
      const fitBundle = signedPrekeyBundle(actor, device, certificateDigest, 3n, new Date(now + 1));
      const fit = await prekeys.uploadPrekeys(actor.actorId, {
        deviceId: device.deviceId,
        signedPrekey: fitBundle.signedPrekey,
        oneTimePrekeys: oneTimePrekeys(98, 200),
        prekeyBundleBytes: fitBundle.prekeyBundleBytes,
        prekeyBundleSignature: fitBundle.prekeyBundleSignature,
      });
      expect(fit.signedPrekey?.keyId).toBe('3');
      expect(fit.oneTimePrekeyCount).toBe(100);
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

    it('keeps a claimed-and-public-row-deleted key id permanently rejected by the issued ledger', async () => {
      const claimant = await newActor();
      const target = await newActor();
      const { device } = await enrollFirstDevice(target, 1);

      const claimed = await prekeys.claimPrekeyBundles(claimant.actorId, {
        conversationId: '',
        actorIds: [target.actorId],
        deviceIds: [],
      });
      expect(claimed.bundles[0]?.oneTimePrekey?.keyId).toBe('1');

      await dataSource.query(
        `DELETE FROM e2ee_one_time_prekeys
         WHERE device_identity_id = (SELECT id FROM e2ee_device_identities WHERE actor_id = $1 AND device_id = $2) AND key_id = 1`,
        [target.actorId, device.deviceId],
      );
      const [publicRows] = await dataSource.query<Array<{ count: string }>>(
        `SELECT count(*) FROM e2ee_one_time_prekeys
         WHERE device_identity_id = (SELECT id FROM e2ee_device_identities WHERE actor_id = $1 AND device_id = $2) AND key_id = 1`,
        [target.actorId, device.deviceId],
      );
      expect(Number(publicRows?.count)).toBe(0);

      await expect(
        prekeys.uploadPrekeys(target.actorId, {
          deviceId: device.deviceId,
          signedPrekey: undefined,
          oneTimePrekeys: oneTimePrekeys(1, 1),
          prekeyBundleBytes: Buffer.alloc(0),
          prekeyBundleSignature: Buffer.alloc(0),
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      const [ledger] = await dataSource.query<Array<{ count: string }>>(
        `SELECT count(*) FROM e2ee_one_time_prekey_key_ids
         WHERE device_identity_id = (SELECT id FROM e2ee_device_identities WHERE actor_id = $1 AND device_id = $2) AND key_id = 1`,
        [target.actorId, device.deviceId],
      );
      expect(Number(ledger?.count)).toBe(1);
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
        // The new device is appended, not inserted in order — the ADR 0033 §2 roster
        // transcript requires entries strictly ascending by `deviceId` UTF-8 bytes (JS's
        // default string sort matches, since device ids are ASCII UUIDs), so a real client
        // sorts before signing and this test fixture must too.
      ].sort((left, right) =>
        left.deviceId < right.deviceId ? -1 : left.deviceId > right.deviceId ? 1 : 0,
      );
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
      it('rejects an unknown franking profile fail-closed before accepting an E2EE message', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);
        await allowDirectMessaging(sender.actorId, recipient.actorId);
        // The profile is a fixed construction (ADR 0036 Amendment 2) — no operator override
        // exists, so the accept path's only failure mode is a client naming anything else.
        // ADR 0035: reservation carries no message, so it is unaffected — the profile gate is
        // inside `acceptE2eeLogicalMessage`, which only runs on `SendEnvelopes`.
        const reserved = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
        });
        const membershipCountBefore = await dataSource
          .getRepository(ConversationMemberEntity)
          .countBy({ actorId: sender.actorId });

        await expect(
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: reserved.conversationId,
            clientRequestId: randomUUID(),
            senderDeviceId: senderDevice.deviceId,
            message: buildLogicalMessage(
              [buildEnvelope(recipient.actorId, recipientDevice.deviceId)],
              { profile: 'some-other-profile' },
            ),
          }),
        ).rejects.toThrow('Unknown franking profile');

        // The rejected send left no trace: membership is unchanged (the reservation's own
        // members, no more), and the conversation stays unmessaged/invisible (ADR 0035 §5).
        await expect(
          dataSource.getRepository(ConversationMemberEntity).countBy({ actorId: sender.actorId }),
        ).resolves.toBe(membershipCountBefore);
        const stillReserved = await dataSource
          .getRepository(ConversationEntity)
          .findOneByOrFail({ id: reserved.conversationId });
        expect(stillReserved.lastMessageAt).toBeNull();

        const mailbox = await conversations.listMailboxEnvelopes(recipient.actorId, {
          deviceId: recipientDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(mailbox.envelopes).toHaveLength(0);
      });

      it('a bare reservation writes no notification and stays invisible to every member, including its creator (ADR 0035 §3.5, §5)', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        await enrollFirstDevice(recipient, 0);
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const reserved = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
        });

        // Silence is structural: `#notifyRecipients` runs only from `sendEnvelopes`, which a
        // bare reservation never calls. Asserting zero rows here pins that a future refactor
        // cannot reintroduce notify-on-create without failing a test.
        expect(
          await dataSource.getRepository(NotificationEntity).count({
            where: { conversationId: reserved.conversationId },
          }),
        ).toBe(0);

        const messages = new MessagesService(dataSource);
        // Invisible to the recipient...
        await expect(
          messages.getConversation(recipient.actorId, reserved.conversationId),
        ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
        // ...and, per ADR 0035 §5, invisible to its own creator too — a reservation appearing
        // in the creator's own list before it holds a message would be a coarse typing
        // indicator (spec §183.3).
        await expect(
          messages.getConversation(sender.actorId, reserved.conversationId),
        ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });

        const recipientList = await messages.listConversations(recipient.actorId, '', 20);
        expect(recipientList.items.some((item) => item.id === reserved.conversationId)).toBe(false);
        const senderList = await messages.listConversations(sender.actorId, '', 20);
        expect(senderList.items.some((item) => item.id === reserved.conversationId)).toBe(false);
      });

      it('creates an E2EE conversation, delivering to the recipient device but never to the sender’s own sending device', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const envelope = buildEnvelope(recipient.actorId, recipientDevice.deviceId);
        const response = await reserveAndSend(
          conversations,
          sender.actorId,
          [recipient.actorId],
          senderDevice.deviceId,
          buildLogicalMessage([envelope]),
        );

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
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const clientRequestId = randomUUID();
        const message = buildLogicalMessage([
          buildEnvelope(recipient.actorId, recipientDevice.deviceId),
        ]);
        const created = await reserveAndSend(
          conversations,
          sender.actorId,
          [recipient.actorId],
          senderDevice.deviceId,
          message,
          clientRequestId,
        );

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

      it('an E2EE arrival writes exactly one content-free MESSAGE notification and bumps the recipient unread count (B-098, §187/§194)', async () => {
        const sender = await newActor();
        const recipient = await newActor();
        const { device: senderDevice } = await enrollFirstDevice(sender, 0);
        const { device: recipientDevice } = await enrollFirstDevice(recipient, 0);
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const clientRequestId = randomUUID();
        const created = await reserveAndSend(
          conversations,
          sender.actorId,
          [recipient.actorId],
          senderDevice.deviceId,
          buildLogicalMessage([buildEnvelope(recipient.actorId, recipientDevice.deviceId)]),
          clientRequestId,
        );

        // Shape (§187): sender actor id + conversation id ONLY — never a body, preview,
        // or any envelope metadata. There is nothing else on the row to check because
        // the schema has no body column; postId/communityId must stay null.
        const rows = await dataSource.getRepository(NotificationEntity).find({
          where: { conversationId: created.conversationId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          type: 'MESSAGE',
          recipientActorId: recipient.actorId,
          actorId: sender.actorId,
          postId: null,
          communityId: null,
        });

        // No self-notify: the sender's own notification list stays empty for this
        // conversation even though their device is a fanout member.
        const selfRows = await dataSource.getRepository(NotificationEntity).find({
          where: { recipientActorId: sender.actorId, conversationId: created.conversationId },
        });
        expect(selfRows).toHaveLength(0);

        // Unread integration: the arrival reflects in the recipient's per-viewer unread
        // count (query over E2eeLogicalMessage vs lastReadMessageId — nothing to bump,
        // the row itself is the signal).
        const messages = new MessagesService(dataSource);
        expect(
          (await messages.getConversation(recipient.actorId, created.conversationId)).unreadCount,
        ).toBe(1);

        // A dedup replay of the same logical message never notifies twice.
        await conversations.sendEnvelopes(sender.actorId, {
          conversationId: created.conversationId,
          clientRequestId,
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([
            buildEnvelope(recipient.actorId, recipientDevice.deviceId),
          ]),
        });
        expect(
          await dataSource.getRepository(NotificationEntity).count({
            where: { conversationId: created.conversationId },
          }),
        ).toBe(1);

        // The rate limit: the recipient reads (re-arming the unread-collapse dedupe),
        // then a genuinely new message arrives inside the one-minute window — the
        // message is delivered and unread goes back up, but no second notification row.
        await messages.markConversationRead(recipient.actorId, created.conversationId, '');
        const second = await conversations.sendEnvelopes(sender.actorId, {
          conversationId: created.conversationId,
          clientRequestId: randomUUID(),
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([
            buildEnvelope(recipient.actorId, recipientDevice.deviceId),
          ]),
        });
        expect(second.logicalMessageId).not.toBe(created.logicalMessageId);
        expect(
          (await messages.getConversation(recipient.actorId, created.conversationId)).unreadCount,
        ).toBe(1);
        expect(
          await dataSource.getRepository(NotificationEntity).count({
            where: { conversationId: created.conversationId },
          }),
        ).toBe(1);
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
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const envelope = buildEnvelope(recipient.actorId, recipientDevice.deviceId);
        const reserved = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
        });
        await expect(
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: reserved.conversationId,
            clientRequestId: randomUUID(),
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
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const envelope = {
          ...buildEnvelope(recipient.actorId, recipientDevice.deviceId),
          openingCiphertext: randomBytes(32),
        };
        const reserved = await conversations.createE2eeConversation(sender.actorId, {
          clientRequestId: randomUUID(),
          recipientActorIds: [recipient.actorId],
          senderDeviceId: senderDevice.deviceId,
        });
        await expect(
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: reserved.conversationId,
            clientRequestId: randomUUID(),
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
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const created = await reserveAndSend(
          conversations,
          sender.actorId,
          [recipient.actorId],
          senderDevice.deviceId,
          buildLogicalMessage([buildEnvelope(recipient.actorId, firstDevice.deviceId)]),
        );

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
        await allowDirectMessaging(sender.actorId, recipient.actorId);
        const recipientDevice2 = await enrollAdditionalDevice(recipient);

        const created = await reserveAndSend(
          conversations,
          sender.actorId,
          [recipient.actorId],
          senderDevice1.deviceId,
          buildLogicalMessage([
            buildEnvelope(recipient.actorId, recipientDevice1.deviceId),
            buildEnvelope(recipient.actorId, recipientDevice2.deviceId),
            buildEnvelope(sender.actorId, senderDevice2.deviceId),
          ]),
        );

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
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const created = await reserveAndSend(
          conversations,
          sender.actorId,
          [recipient.actorId],
          senderDevice.deviceId,
          buildLogicalMessage([buildEnvelope(recipient.actorId, recipientDevice.deviceId)]),
        );

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
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const created = await reserveAndSend(
          conversations,
          sender.actorId,
          [recipient.actorId],
          senderDevice.deviceId,
          buildLogicalMessage([buildEnvelope(recipient.actorId, recipientDevice.deviceId)]),
        );

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
        await allowDirectMessaging(sender.actorId, recipient.actorId);

        const created = await reserveAndSend(
          conversations,
          sender.actorId,
          [recipient.actorId],
          senderDevice.deviceId,
          buildLogicalMessage([buildEnvelope(recipient.actorId, recipientDevice.deviceId)]),
        );
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

    describe('small-group pairwise fanout and roster transitions (ADR 0020 §7, P13-008)', () => {
      /** Creates a group conversation with one enrolled device per actor, sender included,
       * and returns everything the tests need to compose and verify fanouts. */
      async function createGroup(memberCount: number) {
        const actors: TestActorKeys[] = [];
        const devices: DeviceKeys[] = [];
        for (let i = 0; i < memberCount; i += 1) {
          const actor = await newActor();
          const { device } = await enrollFirstDevice(actor, 0);
          if (i > 0) {
            await allowDirectMessaging(actors[0]!.actorId, actor.actorId);
          }
          actors.push(actor);
          devices.push(device);
        }
        const [sender, ...recipients] = actors;
        const senderDevice = devices[0] as DeviceKeys;
        const created = await reserveAndSend(
          conversations,
          sender!.actorId,
          recipients.map((actor) => actor.actorId),
          senderDevice.deviceId,
          buildLogicalMessage(
            devices
              .slice(1)
              .map((device, index) => buildEnvelope(recipients[index]!.actorId, device.deviceId)),
          ),
        );
        return { actors, devices, sender: sender!, senderDevice, recipients, created };
      }

      it('delivers a group message to every member device pairwise — no sender key, no MLS, one envelope per device', async () => {
        const { actors, devices, sender, senderDevice, created } = await createGroup(3);
        // A second sender device joins the roster: Sesame self-fanout must reach it too.
        const senderDevice2 = await enrollAdditionalDevice(sender);

        const second = await conversations.sendEnvelopes(sender.actorId, {
          conversationId: created.conversationId,
          clientRequestId: randomUUID(),
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage(
            [
              ...devices
                .slice(1)
                .map((device, index) => buildEnvelope(actors[index + 1]!.actorId, device.deviceId)),
              buildEnvelope(sender.actorId, senderDevice2.deviceId),
            ],
            { epoch: 1n },
          ),
        });

        for (const [index, device] of devices.slice(1).entries()) {
          const mailbox = await conversations.listMailboxEnvelopes(actors[index + 1]!.actorId, {
            deviceId: device.deviceId,
            cursor: '',
            limit: 0,
          });
          expect(mailbox.envelopes.map((e) => e.logicalMessageId)).toContain(
            second.logicalMessageId,
          );
        }
        const selfMailbox = await conversations.listMailboxEnvelopes(sender.actorId, {
          deviceId: senderDevice2.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(selfMailbox.envelopes.map((e) => e.logicalMessageId)).toContain(
          second.logicalMessageId,
        );
        const sendingMailbox = await conversations.listMailboxEnvelopes(sender.actorId, {
          deviceId: senderDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(sendingMailbox.envelopes).toHaveLength(0);
      });

      it('enforces the eight-member bound at creation and on AddE2eeMember', async () => {
        const eight = await createGroup(8);
        expect(eight.created.conversationId.length).toBeGreaterThan(0);

        // Creation beyond the bound: same constant, same copy (`E2EE_GROUP_MAX_MEMBERS`).
        // Distinct nonexistent ids so the *bound* is what rejects this, not the duplicate check.
        await expect(
          conversations.createE2eeConversation(eight.sender.actorId, {
            clientRequestId: randomUUID(),
            recipientActorIds: Array.from(
              { length: 8 },
              (_, index) => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
            ),
            senderDeviceId: eight.senderDevice.deviceId,
          }),
        ).rejects.toThrow(/at most 8 members/);

        const ninth = await newActor();
        await enrollFirstDevice(ninth, 0);
        await allowDirectMessaging(eight.sender.actorId, ninth.actorId);
        const state = await conversations.getE2eeConversationState(eight.sender.actorId, {
          conversationId: eight.created.conversationId,
        });
        await expect(
          groups.addE2eeMember(eight.sender.actorId, {
            conversationId: eight.created.conversationId,
            actorId: ninth.actorId,
            signerDeviceId: eight.senderDevice.deviceId,
            event: signedGroupControlEvent({
              conversationId: eight.created.conversationId,
              epoch: 2n,
              change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
              subjectActorId: ninth.actorId,
              signer: eight.sender,
              signerDevice: eight.senderDevice,
              previousDigest: Buffer.from(state.groupControlDigest),
            }),
          }),
        ).rejects.toMatchObject({ code: 'E2EE_GROUP_CONTROL_CONFLICT' });
      });

      it('AddE2eeMember bumps the epoch; a stale-epoch send is rejected and the new member gets future messages only', async () => {
        const { actors, devices, sender, senderDevice, created } = await createGroup(3);
        const member = actors[1]!;
        const memberDevice = devices[1]!;

        const newcomer = await newActor();
        const { device: newcomerDevice } = await enrollFirstDevice(newcomer, 0);
        await allowDirectMessaging(sender.actorId, newcomer.actorId);

        const added = await groups.addE2eeMember(sender.actorId, {
          conversationId: created.conversationId,
          actorId: newcomer.actorId,
          signerDeviceId: senderDevice.deviceId,
          event: signedGroupControlEvent({
            conversationId: created.conversationId,
            epoch: 2n,
            change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
            subjectActorId: newcomer.actorId,
            signer: sender,
            signerDevice: senderDevice,
            previousDigest: ZERO_DIGEST,
          }),
        });
        expect(added.membershipEpoch).toBe('2');

        const state = await conversations.getE2eeConversationState(sender.actorId, {
          conversationId: created.conversationId,
        });
        expect(state.membershipEpoch).toBe('2');
        expect(state.groupControlDigest).toEqual(added.event?.digest);
        expect(state.members.map((m) => m.actorId).sort()).toEqual(
          [sender.actorId, member.actorId, actors[2]!.actorId, newcomer.actorId].sort(),
        );

        // Composed under epoch 1 while the conversation is at 2: rejected whole.
        await expect(
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: created.conversationId,
            clientRequestId: randomUUID(),
            senderDeviceId: senderDevice.deviceId,
            message: buildLogicalMessage([
              buildEnvelope(member.actorId, memberDevice.deviceId),
              buildEnvelope(actors[2]!.actorId, devices[2]!.deviceId),
              buildEnvelope(newcomer.actorId, newcomerDevice.deviceId),
            ]),
          }),
        ).rejects.toMatchObject({ code: 'E2EE_FANOUT_REJECTED' });

        // Recomposed under epoch 2: accepted, delivered to every current member device.
        const after = await conversations.sendEnvelopes(sender.actorId, {
          conversationId: created.conversationId,
          clientRequestId: randomUUID(),
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage(
            [
              buildEnvelope(member.actorId, memberDevice.deviceId),
              buildEnvelope(actors[2]!.actorId, devices[2]!.deviceId),
              buildEnvelope(newcomer.actorId, newcomerDevice.deviceId),
            ],
            { epoch: 2n },
          ),
        });

        const newcomerMailbox = await conversations.listMailboxEnvelopes(newcomer.actorId, {
          deviceId: newcomerDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        // Future messages only: exactly the epoch-2 message, never the epoch-1 creation message.
        expect(newcomerMailbox.envelopes.map((e) => e.logicalMessageId)).toEqual([
          after.logicalMessageId,
        ]);
        expect(
          newcomerMailbox.envelopes.every((envelope) => envelope.membershipEpoch === '2'),
        ).toBe(true);
      });

      it('RemoveE2eeMember excludes the removed member from every later fanout and blocks their sends', async () => {
        const { actors, devices, sender, senderDevice, created } = await createGroup(3);
        const removed = actors[2]!;
        const removedDevice = devices[2]!;
        const keeper = actors[1]!;
        const keeperDevice = devices[1]!;

        const removedBefore = await conversations.listMailboxEnvelopes(removed.actorId, {
          deviceId: removedDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(removedBefore.envelopes).toHaveLength(1);

        const removal = await groups.removeE2eeMember(sender.actorId, {
          conversationId: created.conversationId,
          actorId: removed.actorId,
          signerDeviceId: senderDevice.deviceId,
          event: signedGroupControlEvent({
            conversationId: created.conversationId,
            epoch: 2n,
            change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_REMOVED,
            subjectActorId: removed.actorId,
            signer: sender,
            signerDevice: senderDevice,
            previousDigest: ZERO_DIGEST,
          }),
        });
        expect(removal.membershipEpoch).toBe('2');

        // The removed member cannot send.
        await expect(
          conversations.sendEnvelopes(removed.actorId, {
            conversationId: created.conversationId,
            clientRequestId: randomUUID(),
            senderDeviceId: removedDevice.deviceId,
            message: buildLogicalMessage(
              [
                buildEnvelope(sender.actorId, senderDevice.deviceId),
                buildEnvelope(keeper.actorId, keeperDevice.deviceId),
              ],
              { epoch: 2n },
            ),
          }),
        ).rejects.toMatchObject({ code: 'E2EE_CONVERSATION_NOT_FOUND' });

        // A send still addressing the removed member's device is rejected as an unexpected
        // target — their existing devices cannot claim future envelopes.
        await expect(
          conversations.sendEnvelopes(sender.actorId, {
            conversationId: created.conversationId,
            clientRequestId: randomUUID(),
            senderDeviceId: senderDevice.deviceId,
            message: buildLogicalMessage(
              [
                buildEnvelope(keeper.actorId, keeperDevice.deviceId),
                buildEnvelope(removed.actorId, removedDevice.deviceId),
              ],
              { epoch: 2n },
            ),
          }),
        ).rejects.toMatchObject({ code: 'E2EE_FANOUT_REJECTED' });

        // Recomposed without them: accepted; they receive nothing new but keep what already
        // arrived (removal stops future payloads, it is not a remote wipe).
        const after = await conversations.sendEnvelopes(sender.actorId, {
          conversationId: created.conversationId,
          clientRequestId: randomUUID(),
          senderDeviceId: senderDevice.deviceId,
          message: buildLogicalMessage([buildEnvelope(keeper.actorId, keeperDevice.deviceId)], {
            epoch: 2n,
          }),
        });
        expect(after.logicalMessageId.length).toBeGreaterThan(0);

        const removedAfter = await conversations.listMailboxEnvelopes(removed.actorId, {
          deviceId: removedDevice.deviceId,
          cursor: '',
          limit: 0,
        });
        expect(removedAfter.envelopes.map((e) => e.logicalMessageId)).toEqual([
          created.logicalMessageId,
        ]);

        const state = await conversations.getE2eeConversationState(keeper.actorId, {
          conversationId: created.conversationId,
        });
        expect(state.membershipEpoch).toBe('2');
        expect(state.members.map((m) => m.actorId)).not.toContain(removed.actorId);
      });

      it('a member can remove themselves (leave), and a removed member can be re-added at the next epoch', async () => {
        const { actors, devices, sender, senderDevice, created } = await createGroup(3);
        const member = actors[1]!;
        const memberDevice = devices[1]!;

        const leave = await groups.removeE2eeMember(member.actorId, {
          conversationId: created.conversationId,
          actorId: member.actorId,
          signerDeviceId: memberDevice.deviceId,
          event: signedGroupControlEvent({
            conversationId: created.conversationId,
            epoch: 2n,
            change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_REMOVED,
            subjectActorId: member.actorId,
            signer: member,
            signerDevice: memberDevice,
            previousDigest: ZERO_DIGEST,
          }),
        });
        expect(leave.membershipEpoch).toBe('2');

        const readd = await groups.addE2eeMember(sender.actorId, {
          conversationId: created.conversationId,
          actorId: member.actorId,
          signerDeviceId: senderDevice.deviceId,
          event: signedGroupControlEvent({
            conversationId: created.conversationId,
            epoch: 3n,
            change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
            subjectActorId: member.actorId,
            signer: sender,
            signerDevice: senderDevice,
            previousDigest: Buffer.from(leave.event?.digest as Buffer),
          }),
        });
        expect(readd.membershipEpoch).toBe('3');

        const state = await conversations.getE2eeConversationState(sender.actorId, {
          conversationId: created.conversationId,
        });
        expect(state.membershipEpoch).toBe('3');
        expect(state.members.map((m) => m.actorId)).toContain(member.actorId);
      });

      it('verifies the signed transcript: decoded-field tampering, wrong signer key, and chain breaks are rejected', async () => {
        const { actors, sender, senderDevice, created } = await createGroup(3);
        const newcomer = await newActor();
        await enrollFirstDevice(newcomer, 0);
        await allowDirectMessaging(sender.actorId, newcomer.actorId);

        // Tampered decoded view: the convenience fields no longer match the signed bytes.
        // (Tampering `signerDeviceId` would be caught even earlier, by the request-vs-event
        // agreement check; `epoch` isolates the transcript-match rule itself.)
        const tampered = signedGroupControlEvent({
          conversationId: created.conversationId,
          epoch: 2n,
          change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
          subjectActorId: newcomer.actorId,
          signer: sender,
          signerDevice: senderDevice,
          previousDigest: ZERO_DIGEST,
        });
        tampered.epoch = '5';
        await expect(
          groups.addE2eeMember(sender.actorId, {
            conversationId: created.conversationId,
            actorId: newcomer.actorId,
            signerDeviceId: senderDevice.deviceId,
            event: tampered,
          }),
        ).rejects.toMatchObject({ code: 'E2EE_GROUP_CONTROL_INVALID' });

        // Signed by the wrong device key entirely.
        const strangerKeys = generateSigningKeyPair();
        const forged = signedGroupControlEvent({
          conversationId: created.conversationId,
          epoch: 2n,
          change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
          subjectActorId: newcomer.actorId,
          signer: sender,
          signerDevice: {
            deviceId: senderDevice.deviceId,
            signingPrivateKey: strangerKeys.privateKey,
            signingPublicKey: strangerKeys.publicKey,
            agreementPublicKey: senderDevice.agreementPublicKey,
          },
          previousDigest: ZERO_DIGEST,
        });
        await expect(
          groups.addE2eeMember(sender.actorId, {
            conversationId: created.conversationId,
            actorId: newcomer.actorId,
            signerDeviceId: senderDevice.deviceId,
            event: forged,
          }),
        ).rejects.toMatchObject({ code: 'E2EE_GROUP_CONTROL_INVALID' });

        // Valid signature, but the epoch skips: a chain break, not a signature problem.
        const gapped = signedGroupControlEvent({
          conversationId: created.conversationId,
          epoch: 3n,
          change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
          subjectActorId: newcomer.actorId,
          signer: sender,
          signerDevice: senderDevice,
          previousDigest: ZERO_DIGEST,
        });
        await expect(
          groups.addE2eeMember(sender.actorId, {
            conversationId: created.conversationId,
            actorId: newcomer.actorId,
            signerDeviceId: senderDevice.deviceId,
            event: gapped,
          }),
        ).rejects.toMatchObject({ code: 'E2EE_GROUP_CONTROL_CONFLICT' });

        // A non-member's correctly-signed event: the membership check fires first.
        const outsider = await newActor();
        const { device: outsiderDevice } = await enrollFirstDevice(outsider, 0);
        await expect(
          groups.addE2eeMember(outsider.actorId, {
            conversationId: created.conversationId,
            actorId: newcomer.actorId,
            signerDeviceId: outsiderDevice.deviceId,
            event: signedGroupControlEvent({
              conversationId: created.conversationId,
              epoch: 2n,
              change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
              subjectActorId: newcomer.actorId,
              signer: outsider,
              signerDevice: outsiderDevice,
              previousDigest: ZERO_DIGEST,
            }),
          }),
        ).rejects.toMatchObject({ code: 'E2EE_CONVERSATION_NOT_FOUND' });

        // Nothing above mutated membership or the transcript.
        const state = await conversations.getE2eeConversationState(sender.actorId, {
          conversationId: created.conversationId,
        });
        expect(state.membershipEpoch).toBe('1');
        expect(state.members.map((m) => m.actorId).sort()).toEqual(
          [sender.actorId, actors[1]!.actorId, actors[2]!.actorId].sort(),
        );
      });

      it('ListE2eeGroupControlEvents returns the verified chain forward and keyset-paginates', async () => {
        const { actors, devices, sender, senderDevice, created } = await createGroup(3);
        const member = actors[1]!;
        const memberDevice = devices[1]!;
        const newcomer = await newActor();
        await enrollFirstDevice(newcomer, 0);
        await allowDirectMessaging(sender.actorId, newcomer.actorId);

        const added = await groups.addE2eeMember(sender.actorId, {
          conversationId: created.conversationId,
          actorId: newcomer.actorId,
          signerDeviceId: senderDevice.deviceId,
          event: signedGroupControlEvent({
            conversationId: created.conversationId,
            epoch: 2n,
            change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
            subjectActorId: newcomer.actorId,
            signer: sender,
            signerDevice: senderDevice,
            previousDigest: ZERO_DIGEST,
          }),
        });
        const removed = await groups.removeE2eeMember(member.actorId, {
          conversationId: created.conversationId,
          actorId: newcomer.actorId,
          signerDeviceId: memberDevice.deviceId,
          event: signedGroupControlEvent({
            conversationId: created.conversationId,
            epoch: 3n,
            change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_REMOVED,
            subjectActorId: newcomer.actorId,
            signer: member,
            signerDevice: memberDevice,
            previousDigest: Buffer.from(added.event?.digest as Buffer),
          }),
        });

        const firstPage = await groups.listGroupControlEvents(sender.actorId, {
          conversationId: created.conversationId,
          afterEpoch: '0',
          cursor: '',
          limit: 1,
        });
        expect(firstPage.events).toHaveLength(1);
        expect(firstPage.events[0]?.epoch).toBe('2');
        expect(firstPage.page?.hasMore).toBe(true);

        const rest = await groups.listGroupControlEvents(sender.actorId, {
          conversationId: created.conversationId,
          afterEpoch: '0',
          cursor: firstPage.page?.nextCursor ?? '',
          limit: 10,
        });
        expect(rest.events.map((event) => event.epoch)).toEqual(['3']);
        expect(rest.events[0]?.digest).toEqual(removed.event?.digest);

        // Forward-only replay: nothing at or before the highest verified epoch.
        const none = await groups.listGroupControlEvents(sender.actorId, {
          conversationId: created.conversationId,
          afterEpoch: '3',
          cursor: '',
          limit: 10,
        });
        expect(none.events).toHaveLength(0);
        expect(none.page?.hasMore).toBe(false);

        // A removed member may read the transcript up to and including their own removal
        // event (audit P2 fix); a never-member still gets the uniform not-found.
        const outsider = await newActor();
        await enrollFirstDevice(outsider, 0);
        await expect(
          groups.listGroupControlEvents(outsider.actorId, {
            conversationId: created.conversationId,
            afterEpoch: '0',
            cursor: '',
            limit: 10,
          }),
        ).rejects.toMatchObject({ code: 'E2EE_CONVERSATION_NOT_FOUND' });

        const removedMemberView = await groups.listGroupControlEvents(newcomer.actorId, {
          conversationId: created.conversationId,
          afterEpoch: '0',
          cursor: '',
          limit: 10,
        });
        expect(removedMemberView.events.map((event) => event.epoch)).toEqual(['2', '3']);
      });
    });
  },
);
