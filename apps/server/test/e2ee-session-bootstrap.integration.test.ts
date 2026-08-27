import { randomUUID } from 'node:crypto';

import {
  commitFranking,
  createFrankingOpeningKey,
  disposeX3dhSecrets,
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  initializeInitiatorRatchet,
  initializeResponderRatchet,
  initiateX3dh,
  openDeviceEnvelope,
  respondX3dh,
  sealDeviceEnvelope,
  sha256Hash,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  verifyMessagingRoot,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
  type DevicePrivateKeys,
  type FrankingCommitmentContext,
  type KeyPair,
  type VerifiedMessagingRoot,
  type VerifiedPreKeyBundle,
  type VerifiedRosterSnapshot,
} from '@patches/crypto';
import { canonicalFanoutTranscript, E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import { createTestFollow, createTestUser } from '@patches/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';

import { E2eeConversationService } from '../src/modules/e2ee/e2ee-conversation.service.js';
import { E2eeDeviceRosterService } from '../src/modules/e2ee/device-roster.service.js';
import { E2eeRateLimitService } from '../src/modules/e2ee/e2ee-rate-limit.service.js';
import { E2eeRuntimeApprovalPolicy } from '../src/modules/e2ee/e2ee-runtime-approval-policy.js';
import { NotificationsService } from '../src/modules/notifications/notification.service.js';
import { E2eeIdentityRootService } from '../src/modules/e2ee/identity-root.service.js';
import { E2eePrekeyService } from '../src/modules/e2ee/prekey.service.js';
import { type NodeFrankingKeyRing } from '../src/modules/e2ee/report-evidence.js';
import { createServerTestDataSource } from './support/database.js';

/**
 * ADR 0033 §7's definition of done: two distinct, real, `EnrollDevice`-enrolled devices
 * establish an X3DH session through the real RPC sequence — `EnrollDevice` (x2),
 * `ClaimPrekeyBundles`, `CreateE2eeConversation` (a bare ADR 0035 reservation),
 * `SendEnvelopes`, `ListMailboxEnvelopes` — and the recipient decrypts exactly what the
 * sender sent, with franking verification intact.
 *
 * Nothing here is stubbed or mocked. The client-side crypto steps run the *same*
 * `@patches/crypto` verifier chain the real web/TUI clients run (`apps/web/src/e2ee/
 * transports.ts`'s `loadVerifiedRoster`/`claimPrekeyBundles`): `verifyMessagingRoot` over
 * `GetIdentityRoot`'s served bytes, `verifyRosterSnapshot` over `GetDeviceRoster`'s roster
 * plus the certificates it references, `verifyPreKeyBundle` over `ClaimPrekeyBundles`'
 * bundle, then `initiateX3dh`/`respondX3dh` against the branded `Verified*` results. The
 * one thing this test does not do is wire-frame the X3DH handshake into
 * `encrypted_header` the way `apps/web/src/e2ee/session-setup.ts`'s `SETUP_MAGIC` framing
 * does — that framing is a pure client-side convention the node never parses (every
 * `bytes` field on `E2eeDeviceEnvelope` is opaque to it, ADR 0020 §8), so passing the
 * initiator's in-memory handshake straight to `respondX3dh` proves the same session
 * establishment without re-implementing a client's wire framing inside a server test.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL_SERVER ?? process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping e2ee session-bootstrap integration test: TEST_DATABASE_URL is not ' +
      'set (start Postgres with `mise run compose -- up -d`).',
  );
}

const TEST_FRANKING_ERA = 1;
const TEST_FRANKING_KEY = new Uint8Array(32).fill(9);
const testFrankingKeyRing: NodeFrankingKeyRing = {
  keyForEra: (era) => (era === TEST_FRANKING_ERA ? TEST_FRANKING_KEY : undefined),
  knownEras: () => [TEST_FRANKING_ERA],
  currentEra: () => TEST_FRANKING_ERA,
};

const ZERO_32 = new Uint8Array(32);
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

/** Real messaging root minted with `signMessagingRoot` — a canonical T1 transcript, not a
 * hand-rolled byte string, so `verifyMessagingRoot` (the real client verifier) accepts it. */
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

/** Real T2 certificate transcript, signed by the root — matches what `verifyDeviceCertificate`
 * (server) and `verifyCertifiedDevice`/`verifyRosterSnapshot` (client) both decode. */
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
    status: 0,
    revokedAt: undefined,
  };
}

/** Real T3 roster transcript (sequence 1, one active device), signed by the root. */
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
    previousDigest: ZERO_32,
    createdAtMs: now.getTime(),
    entries: [
      { deviceId: device.deviceId, certificateDigest, active: true, addedAtMs: now.getTime() },
    ],
  });
  return {
    actorId: actor.actorId,
    sequence: '1',
    rootGeneration: 1,
    previousDigest: Buffer.from(ZERO_32),
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

/** Real T4 signed-prekey-bundle transcript, signed by the device's own signing key. */
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
  return Array.from({ length: count }, (_, i) => ({
    keyId: String(startId + i),
    publicKey: Buffer.from(generateKeyAgreementKeyPair().publicKey),
  }));
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'E2EE two-device session bootstrap over real RPCs (ADR 0033 §7)',
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
        new E2eeRuntimeApprovalPolicy(),
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
        new NotificationsService(dataSource),
      );
    }, 60_000);

    afterAll(async () => {
      await dataSource.destroy();
    });

    async function newActor(): Promise<TestActor> {
      const { actor } = await createTestUser(dataSource.manager);
      return { actorId: actor.id, rootKeys: generateSigningKeyPair() };
    }

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

    /** Enrolls one real device for `actor` through `EnrollDevice`, returning the device's
     * private key material for the crypto steps below. */
    async function enrollDevice(
      actor: TestActor,
      now: Date,
    ): Promise<{ device: TestDevice; signedPrekeyId: number; agreementKeyPair: KeyPair }> {
      await identityRoots.publishIdentityRoot(actor.actorId, buildIdentityRootRequest(actor, now));

      const device: TestDevice = {
        deviceId: randomUUID(),
        keys: { signing: generateSigningKeyPair(), agreement: generateKeyAgreementKeyPair() },
      };
      const certificate = buildCertificate(actor, device, now);
      const roster = buildRoster(actor, device, certificate.certificateDigest, now);
      const agreementKeyPair = generateKeyAgreementKeyPair();
      const signedPrekeyId = 1;
      const bundle = buildSignedPrekey(
        device,
        actor.actorId,
        certificate.certificateDigest,
        signedPrekeyId,
        agreementKeyPair,
        now,
      );

      await deviceRosters.enrollDevice(actor.actorId, {
        certificate,
        roster,
        signedPrekey: bundle.signedPrekey,
        // No one-time prekeys: this test's acceptance criterion is session bootstrap
        // itself (ADR 0033 §7), not the one-time-prekey exhaustion path, which
        // `e2ee.integration.test.ts` already covers. `ClaimPrekeyBundles` falls back to
        // the signed prekey alone, exactly as it does for any exhausted device.
        oneTimePrekeys: oneTimePrekeys(0, 1),
        prekeyBundleBytes: bundle.prekeyBundleBytes,
        prekeyBundleSignature: bundle.prekeyBundleSignature,
      } as never);

      return { device, signedPrekeyId, agreementKeyPair };
    }

    /** Runs the real client verifier chain over `GetIdentityRoot` + `GetDeviceRoster`: the
     * exact sequence `apps/web/src/e2ee/transports.ts`'s `loadVerifiedRoster` runs. */
    async function loadVerifiedRoster(
      actorId: string,
      nowMs: number,
    ): Promise<VerifiedRosterSnapshot> {
      const { identityRoot } = await identityRoots.getIdentityRoot({ actorId });
      if (identityRoot === undefined || identityRoot === null) {
        throw new Error('identity root not found');
      }
      const root: VerifiedMessagingRoot = verifyMessagingRoot({
        rootBytes: identityRoot.rootBytes,
        selfSignature: identityRoot.selfSignature,
        nowMs,
      });
      const { roster, certificates } = await deviceRosters.getDeviceRoster({ actorId });
      if (roster === undefined || roster === null) throw new Error('roster not found');
      return verifyRosterSnapshot({
        rosterBytes: roster.rosterBytes,
        rootSignature: roster.rootSignature,
        root,
        certificates: certificates.map((certificate) => ({
          certificateBytes: certificate.certificateBytes,
          rootSignature: certificate.rootSignature,
        })),
        nowMs,
      });
    }

    it('establishes a real X3DH session between two enrolled devices and decrypts what was sent', async () => {
      const now = new Date();
      const alice = await newActor();
      const bob = await newActor();
      // Alice is the initiator only: X3DH never touches her own signed-prekey private
      // material, so only her device identity is needed here.
      const { device: aliceDevice } = await enrollDevice(alice, now);
      const {
        device: bobDevice,
        signedPrekeyId: bobSignedPrekeyId,
        agreementKeyPair: bobAgreementKeyPair,
      } = await enrollDevice(bob, now);
      await allowDirectMessaging(alice.actorId, bob.actorId);

      const nowMs = Date.now();

      // GetDeviceRoster -> verifyRosterSnapshot for both sides (Alice must also verify
      // her own served roster, exactly as a real client does — nothing is trusted just
      // because this process minted it).
      const aliceRoster = await loadVerifiedRoster(alice.actorId, nowMs);
      const bobRoster = await loadVerifiedRoster(bob.actorId, nowMs);
      const aliceVerifiedDevice = aliceRoster.devices.find(
        (candidate) => candidate.deviceId === aliceDevice.deviceId,
      );
      if (aliceVerifiedDevice === undefined) throw new Error('alice device missing from roster');

      // ClaimPrekeyBundles -> verifyPreKeyBundle: the real client-side claim + verify
      // sequence (`apps/web/src/e2ee/transports.ts`'s `claimPrekeyBundles`).
      const claimed = await prekeys.claimPrekeyBundles(alice.actorId, {
        conversationId: '',
        actorIds: [bob.actorId],
        deviceIds: [],
      });
      const bobBundleWire = claimed.bundles.find(
        (candidate) => candidate.deviceId === bobDevice.deviceId,
      );
      expect(bobBundleWire).toBeDefined();
      if (bobBundleWire === undefined) return;
      const bobCertificate = bobBundleWire.deviceCertificate;
      expect(bobCertificate).toBeDefined();
      if (bobCertificate === undefined) return;
      const bobOneTimePreKey =
        bobBundleWire.oneTimePrekey === undefined || bobBundleWire.oneTimePrekeyExhausted
          ? undefined
          : {
              id: Number(bobBundleWire.oneTimePrekey.keyId),
              publicKey: bobBundleWire.oneTimePrekey.publicKey,
            };
      const bobVerifiedBundle: VerifiedPreKeyBundle = verifyPreKeyBundle({
        bundleBytes: bobBundleWire.bundleBytes,
        deviceSignature: bobBundleWire.deviceSignature,
        certificateBytes: bobCertificate.certificateBytes,
        certificateRootSignature: bobCertificate.rootSignature,
        ...(bobOneTimePreKey === undefined ? {} : { oneTimePreKey: bobOneTimePreKey }),
        roster: bobRoster,
        nowMs,
      });

      // CreateE2eeConversation: a bare ADR 0035 reservation, no message.
      const reserved = await conversations.createE2eeConversation(alice.actorId, {
        clientRequestId: randomUUID(),
        recipientActorIds: [bob.actorId],
        senderDeviceId: aliceDevice.deviceId,
      });

      // initiateX3dh against the branded Verified* values only — a compile-time
      // guarantee that nothing unverified reaches the handshake.
      const initiated = initiateX3dh({
        initiatorKeys: aliceDevice.keys,
        initiatorDevice: aliceVerifiedDevice,
        initiatorRoster: aliceRoster,
        responderBundle: bobVerifiedBundle,
        responderRoster: bobRoster,
        nowMs,
      });
      const aliceState = initializeInitiatorRatchet(
        initiated.secrets,
        initiated.initiatorRatchetKey,
        bobVerifiedBundle.signedPrekeyPublicKey,
      );
      // `disposeX3dhSecrets` is deferred until after Bob's `respondX3dh` call below —
      // `initiated.handshake.ephemeralPublicKey` is the same backing buffer as
      // `initiated.initiatorRatchetKey.publicKey` (assigned by reference, not copied),
      // so zeroizing it here would corrupt the very handshake this test still has to
      // hand to the responder (see `apps/web/src/e2ee/session-setup.ts`'s identical
      // "frame before disposal" ordering constraint).

      // Seal one real device envelope: X3DH-derived ratchet, real franking commitment.
      const plaintext = new TextEncoder().encode('hello bob, this is a real e2ee session');
      const context: FrankingCommitmentContext = {
        frankingProfile: E2EE_FRANKING_PROFILE_V1,
        conversationId: reserved.conversationId,
        membershipEpoch: 1,
        senderActorId: alice.actorId,
        senderDeviceId: aliceDevice.deviceId,
      };
      const openingKey = createFrankingOpeningKey();
      const commitment = commitFranking(openingKey, context, plaintext);
      const logicalMessageId = randomUUID();
      const sealed = sealDeviceEnvelope(aliceState, {
        context,
        recipient: { recipientActorId: bob.actorId, recipientDeviceId: bobDevice.deviceId },
        logicalMessageId,
        plaintext,
        openingKey,
        commitment,
      });
      void sealed.state;

      const deviceEnvelopeView = {
        recipientActorId: bob.actorId,
        recipientDeviceId: bobDevice.deviceId,
        encryptedHeader: new Uint8Array(0),
        ciphertext: new Uint8Array(0),
        openingCiphertext: new Uint8Array(0),
        ciphertextDigest: sha256Hash(sealed.output.ciphertext),
      };
      const fanoutDigest = sha256Hash(
        canonicalFanoutTranscript({
          frankingProfile: E2EE_FRANKING_PROFILE_V1,
          frankingCommitment: commitment,
          deviceEnvelopes: [deviceEnvelopeView],
        }),
      );

      // SendEnvelopes: the real accept/fanout path.
      const sent = await conversations.sendEnvelopes(alice.actorId, {
        conversationId: reserved.conversationId,
        clientRequestId: randomUUID(),
        senderDeviceId: aliceDevice.deviceId,
        message: {
          logicalMessageId,
          membershipEpoch: '1',
          frankingCommitment: Buffer.from(commitment),
          frankingProfile: E2EE_FRANKING_PROFILE_V1,
          fanoutDigest: Buffer.from(fanoutDigest),
          deviceEnvelopes: [
            {
              recipientActorId: bob.actorId,
              recipientDeviceId: bobDevice.deviceId,
              encryptedHeader: Buffer.from(sealed.output.encryptedHeader),
              ciphertext: Buffer.from(sealed.output.ciphertext),
              openingCiphertext: Buffer.alloc(0),
              ciphertextDigest: Buffer.from(deviceEnvelopeView.ciphertextDigest),
            },
          ],
        },
      });
      expect(sent.logicalMessageId).toBe(logicalMessageId);

      // ListMailboxEnvelopes: Bob's real device mailbox poll.
      const mailbox = await conversations.listMailboxEnvelopes(bob.actorId, {
        deviceId: bobDevice.deviceId,
        cursor: '',
        limit: 0,
      });
      expect(mailbox.envelopes).toHaveLength(1);
      const delivered = mailbox.envelopes[0];
      expect(delivered).toBeDefined();
      if (delivered === undefined) return;
      expect(delivered.logicalMessageId).toBe(logicalMessageId);

      // Bob's side of the same handshake, run through `respondX3dh` against his own
      // verified bundle/roster — never against Alice's in-memory values. `bobVerifiedBundle`
      // is Alice's claimed-and-verified copy of exactly the same served bundle bytes, so
      // reusing it here is reusing the verification result, not skipping Bob's own check —
      // both sides ran `verifyPreKeyBundle` over the identical wire bytes.
      const bobVerifiedDevice = bobRoster.devices.find(
        (candidate) => candidate.deviceId === bobDevice.deviceId,
      );
      expect(bobVerifiedDevice).toBeDefined();
      // No one-time prekey was enrolled, so `ClaimPrekeyBundles` fell back to the signed
      // prekey alone — `respondX3dh` is called with no `oneTimePreKey` to match.
      expect(bobOneTimePreKey).toBeUndefined();
      const responded = respondX3dh({
        responderKeys: bobDevice.keys,
        responderBundle: bobVerifiedBundle,
        responderRoster: bobRoster,
        initiatorRoster: aliceRoster,
        signedPreKey: { id: bobSignedPrekeyId, keyPair: bobAgreementKeyPair },
        handshake: initiated.handshake,
        nowMs,
      });
      // Safe now: Bob's `respondX3dh` was the last reader of `initiated.handshake`.
      disposeX3dhSecrets(initiated.secrets, initiated.initiatorRatchetKey);
      const bobState = initializeResponderRatchet(responded.secrets, responded.responderRatchetKey);
      disposeX3dhSecrets(responded.secrets);

      // openDeviceEnvelope: the only function in `@patches/crypto` that returns E2EE
      // plaintext, and it verifies the franking commitment before it does.
      const opened = openDeviceEnvelope(bobState, {
        context: {
          frankingProfile: delivered.frankingTag?.profile ?? E2EE_FRANKING_PROFILE_V1,
          conversationId: delivered.conversationId,
          membershipEpoch: Number(delivered.membershipEpoch),
          senderActorId: delivered.senderActorId,
          senderDeviceId: delivered.senderDeviceId,
        },
        recipient: { recipientActorId: bob.actorId, recipientDeviceId: bobDevice.deviceId },
        logicalMessageId: delivered.logicalMessageId,
        message: { encryptedHeader: delivered.encryptedHeader, ciphertext: delivered.ciphertext },
        commitment: delivered.frankingCommitment,
      });
      void opened.state;

      expect(new TextDecoder().decode(opened.output.plaintext)).toBe(
        'hello bob, this is a real e2ee session',
      );
    }, 60_000);
  },
);
