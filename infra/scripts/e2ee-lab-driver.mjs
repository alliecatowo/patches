#!/usr/bin/env node
//
// B-108 E2EE interop walk — the Node half of `infra/scripts/e2ee-lab.sh`.
//
// Drives the FULL node-side E2EE_V1 contract over the real Connect HTTP edge (ADR 0016)
// with plain JSON fetch calls — the same wire form `curl` uses for registration:
//
//   GetE2eeCapability → PublishIdentityRoot ×2 → EnrollDevice ×2 (root-signed certificate,
//   chained roster, device-signed prekey bundle) → mutual FollowActor →
//   CreateE2eeConversation (first logical message, franking tag) →
//   GetE2eeConversationState → SendEnvelopes (bob replies) → ListMailboxEnvelopes →
//   byte-identical ciphertext receipt + franking tag → AcknowledgeEnvelopes → drain check.
//
// Transcript construction mirrors `apps/server/test/e2ee.integration.test.ts`'s helpers —
// the canonical encoders the signer and the node share (`@patches/domain` +
// `apps/server/src/modules/e2ee/e2ee.codec.ts`), imported from the built `dist/` output so
// this file never reimplements them. Signatures are real Ed25519 from `@patches/crypto`.
//
// Honesty note (what this lab does NOT prove): envelope plaintext here is opaque random
// bytes — exactly what ADR 2020 §8 says the node ever sees — not real Double Ratchet output.
// A full client-side seal/open round-trip requires X3DH peer-bundle claiming, which the only
// complete client (the TUI) currently fails closed on pending the encoder hoist documented in
// `apps/tui/src/app/e2ee-transports.ts`. Client-side ratchet correctness is covered by the
// TUI/unit suites; this lab proves the deployed node's protocol contract end to end.
//
// Input (env): LAB_ROOT, LAB_HTTP_ORIGIN, LAB_ALICE, LAB_BOB —
// each of LAB_ALICE/LAB_BOB is JSON: {"token":"...","actorId":"..."}.
// Exits 0 only if every step passes; prints one `ok [step]` line per step.

import { randomBytes, randomUUID } from 'node:crypto';

const ROOT = requiredEnv('LAB_ROOT');
const ORIGIN = requiredEnv('LAB_HTTP_ORIGIN');
const ALICE = JSON.parse(requiredEnv('LAB_ALICE'));
const BOB = JSON.parse(requiredEnv('LAB_BOB'));

// Imported by file URL (not bare specifier) so this script can live outside the workspace
// packages while the imported modules still resolve their own dependencies normally.
const crypto = await import(`${ROOT}/packages/crypto/dist/index.js`);
const domain = await import(`${ROOT}/packages/domain/dist/index.js`);
const codec = await import(`${ROOT}/apps/server/dist/modules/e2ee/e2ee.codec.js`);

const PROTOCOL = 'patches-e2ee-v1';

function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    console.error(`FAIL [setup] missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

function ok(step, detail) {
  console.log(`ok   [${step}] ${detail}`);
}

function fail(step, detail) {
  console.error(`FAIL [${step}] ${detail}`);
  process.exit(1);
}

function assert(step, condition, detail) {
  if (!condition) fail(step, detail);
  return true;
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

async function rpc(step, service, method, body, token) {
  const response = await fetch(`${ORIGIN}/patches.v1.${service}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    fail(step, `${service}/${method} -> HTTP ${String(response.status)}: ${text.slice(0, 400)}`);
  }
  return text.length === 0 ? {} : JSON.parse(text);
}

/** Mirrors `e2ee.integration.test.ts`'s `signedIdentityRoot`/`signedCertificate`/
 * `signedRoster`/`signedPrekeyBundle`/`oneTimePrekeys` — one enrolled device per actor. */
async function enrollActor(name, session) {
  const root = crypto.generateSigningKeyPair();
  const deviceSigning = crypto.generateSigningKeyPair();
  const deviceAgreement = crypto.generateSigningKeyPair();
  const deviceId = randomUUID();
  const createdAt = new Date();
  const certExpiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const prekeyExpiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const rootBytes = new TextEncoder().encode(`root:${session.actorId}:1`);
  await rpc(
    `root:${name}`,
    'E2eeService',
    'PublishIdentityRoot',
    {
      identityRoot: {
        actorId: session.actorId,
        generation: 1,
        publicKey: b64(root.publicKey),
        rootBytes: b64(rootBytes),
        selfSignature: b64(crypto.sign(root.privateKey, rootBytes)),
        createdAt: createdAt.toISOString(),
      },
    },
    session.token,
  );
  ok(`root:${name}`, `identity root generation 1 published for ${name}`);

  const certificateBytes = codec.encodeCertificateTranscript({
    actorId: session.actorId,
    deviceId,
    rootGeneration: 1,
    certificateVersion: 1,
    signingPublicKey: deviceSigning.publicKey,
    agreementPublicKey: deviceAgreement.publicKey,
    supportedProtocolVersions: [PROTOCOL],
    createdAt,
    expiresAt: certExpiresAt,
  });
  const certificateDigest = crypto.sha256Hash(certificateBytes);
  const rosterBytes = codec.encodeRosterTranscript({
    actorId: session.actorId,
    sequence: 1n,
    rootGeneration: 1,
    previousDigest: new Uint8Array(32),
    entries: [
      {
        deviceId,
        certificateDigest,
        active: true,
        addedAt: createdAt,
        revokedAt: undefined,
      },
    ],
  });
  const prekeyPublicKey = crypto.generateSigningKeyPair().publicKey;
  const bundleBytes = codec.encodePrekeyBundleTranscript({
    certificateDigest,
    agreementPublicKey: deviceAgreement.publicKey,
    protocolVersion: '',
    actorId: session.actorId,
    deviceId,
    signedPrekeyId: 1n,
    signedPrekeyPublicKey: prekeyPublicKey,
    signedPrekeyCreatedAt: createdAt,
    signedPrekeyExpiresAt: prekeyExpiresAt,
  });
  const bundleSignature = crypto.sign(deviceSigning.privateKey, bundleBytes);
  const oneTimePrekeys = [1, 2, 3, 4].map((i) => ({
    keyId: String(i),
    publicKey: b64(crypto.generateSigningKeyPair().publicKey),
  }));

  const enrolled = await rpc(
    `enroll:${name}`,
    'E2eeService',
    'EnrollDevice',
    {
      certificate: {
        actorId: session.actorId,
        deviceId,
        rootGeneration: 1,
        certificateVersion: 1,
        signingPublicKey: b64(deviceSigning.publicKey),
        agreementPublicKey: b64(deviceAgreement.publicKey),
        supportedProtocolVersions: [PROTOCOL],
        createdAt: createdAt.toISOString(),
        expiresAt: certExpiresAt.toISOString(),
        certificateBytes: b64(certificateBytes),
        rootSignature: b64(crypto.sign(root.privateKey, certificateBytes)),
        certificateDigest: b64(certificateDigest),
      },
      roster: {
        actorId: session.actorId,
        sequence: '1',
        rootGeneration: 1,
        previousDigest: b64(new Uint8Array(32)),
        digest: b64(crypto.sha256Hash(rosterBytes)),
        rosterBytes: b64(rosterBytes),
        rootSignature: b64(crypto.sign(root.privateKey, rosterBytes)),
        entries: [
          {
            deviceId,
            certificateDigest: b64(certificateDigest),
            active: true,
            addedAt: createdAt.toISOString(),
          },
        ],
      },
      signedPrekey: {
        keyId: '1',
        publicKey: b64(prekeyPublicKey),
        signature: b64(bundleSignature),
        createdAt: createdAt.toISOString(),
        expiresAt: prekeyExpiresAt.toISOString(),
      },
      oneTimePrekeys,
      prekeyBundleBytes: b64(bundleBytes),
      prekeyBundleSignature: b64(bundleSignature),
    },
    session.token,
  );
  assert(
    `enroll:${name}`,
    enrolled.certificate?.deviceId === deviceId && enrolled.roster?.sequence === '1',
    'node did not echo the enrolled certificate/roster',
  );
  ok(
    `enroll:${name}`,
    `device ${deviceId.slice(0, 8)}… certified, roster seq 1, 4 one-time prekeys`,
  );
  return { deviceId };
}

/** Mirrors `buildEnvelope`/`buildLogicalMessage`: opaque-but-valid ciphertext + a real
 * `fanout_digest` over the canonical transcript (the field the node actually verifies). */
function buildLogicalMessage(step, envelopes, epoch) {
  const commitment = crypto.sha256Hash(randomBytes(16));
  const fanoutDigest = crypto.sha256Hash(
    domain.canonicalFanoutTranscript({
      frankingProfile: domain.E2EE_FRANKING_PROFILE_V1,
      frankingCommitment: commitment,
      deviceEnvelopes: envelopes.map((envelope) => ({
        recipientActorId: envelope.recipientActorId,
        recipientDeviceId: envelope.recipientDeviceId,
        encryptedHeader: new Uint8Array(0),
        ciphertext: new Uint8Array(0),
        openingCiphertext: new Uint8Array(0),
        ciphertextDigest: envelope.ciphertextDigestBytes,
      })),
    }),
  );
  return {
    logicalMessage: {
      membershipEpoch: String(epoch),
      frankingCommitment: b64(commitment),
      frankingProfile: domain.E2EE_FRANKING_PROFILE_V1,
      fanoutDigest: b64(fanoutDigest),
      deviceEnvelopes: envelopes.map((envelope) => ({
        recipientActorId: envelope.recipientActorId,
        recipientDeviceId: envelope.recipientDeviceId,
        encryptedHeader: b64(randomBytes(32)),
        ciphertext: b64(envelope.ciphertextBytes),
        // ADR 0025 §3: the franking opening lives in the inner plaintext; v1 sends it empty.
        openingCiphertext: '',
        ciphertextDigest: b64(envelope.ciphertextDigestBytes),
      })),
      logicalMessageId: randomUUID(),
    },
    fanoutDigestB64: b64(fanoutDigest),
  };
}

function buildEnvelope(recipientActorId, recipientDeviceId) {
  const ciphertextBytes = randomBytes(64);
  return {
    recipientActorId,
    recipientDeviceId,
    ciphertextBytes,
    ciphertextDigestBytes: crypto.sha256Hash(ciphertextBytes),
    ciphertextB64: b64(ciphertextBytes),
  };
}

async function main() {
  // Session-scoped like every other E2eeService RPC (the controller's class AuthGuard).
  const capability = await rpc('capability', 'E2eeService', 'GetE2eeCapability', {}, ALICE.token);
  assert(
    'capability',
    capability.capability?.state === 'E2EE_CAPABILITY_STATE_ENABLED',
    `expected E2EE_CAPABILITY_STATE_ENABLED, got ${String(capability.capability?.state)}`,
  );
  assert(
    'capability',
    capability.capability?.frankingProfile === domain.E2EE_FRANKING_PROFILE_V1,
    'unexpected franking profile',
  );
  ok(
    'capability',
    `state=ENABLED profile=${capability.capability.frankingProfile} protocols=${capability.capability.supportedProtocolVersions.join(',')}`,
  );

  const alice = await enrollActor('alice', ALICE);
  const bob = await enrollActor('bob', BOB);

  // §183.2 first-contact eligibility: mutual follow before a conversation may be created.
  await rpc('follow', 'SocialGraphService', 'FollowActor', { actorId: BOB.actorId }, ALICE.token);
  await rpc('follow', 'SocialGraphService', 'FollowActor', { actorId: ALICE.actorId }, BOB.token);
  ok('follow', 'alice and bob mutually follow (local follows auto-accept)');

  const forBob = buildEnvelope(BOB.actorId, bob.deviceId);
  const first = buildLogicalMessage('create', [forBob], 1);
  const created = await rpc(
    'create',
    'E2eeService',
    'CreateE2eeConversation',
    {
      clientRequestId: randomUUID(),
      recipientActorIds: [BOB.actorId],
      senderDeviceId: alice.deviceId,
      message: first.logicalMessage,
    },
    ALICE.token,
  );
  assert(
    'create',
    created.securityMode === 'CONVERSATION_SECURITY_MODE_E2EE_V1',
    `expected E2EE_V1 mode, got ${String(created.securityMode)}`,
  );
  assert(
    'create',
    typeof created.frankingTag?.tag === 'string' && created.frankingTag.tag.length > 0,
    'no franking tag issued on create',
  );
  ok(
    'create',
    `conversation ${created.conversationId.slice(0, 8)}… E2EE_V1, franking tag era ${String(created.frankingTag.keyEra)}`,
  );

  const state = await rpc(
    'state',
    'E2eeService',
    'GetE2eeConversationState',
    {
      conversationId: created.conversationId,
    },
    ALICE.token,
  );
  assert('state', state.membershipEpoch === '1', `unexpected epoch ${state.membershipEpoch}`);
  ok('state', `epoch 1, ${String(state.members?.length ?? 2)} members (sender + recipient)`);

  const forAlice = buildEnvelope(ALICE.actorId, alice.deviceId);
  const reply = buildLogicalMessage('send', [forAlice], state.membershipEpoch);
  const sent = await rpc(
    'send',
    'E2eeService',
    'SendEnvelopes',
    {
      conversationId: created.conversationId,
      clientRequestId: randomUUID(),
      senderDeviceId: bob.deviceId,
      message: reply.logicalMessage,
    },
    BOB.token,
  );
  assert(
    'send',
    sent.fanoutDigest === reply.fanoutDigestB64,
    'node did not echo the fanout digest the client computed',
  );
  assert(
    'send',
    (sent.acceptedRecipientDeviceIds ?? []).includes(alice.deviceId),
    'alice device not in accepted recipients',
  );
  assert(
    'send',
    sent.logicalMessageId === reply.logicalMessage.logicalMessageId,
    'node did not store the client-minted logical message id (ADR 0025)',
  );
  ok(
    'send',
    `bob's reply accepted for [${(sent.acceptedRecipientDeviceIds ?? []).map((id) => id.slice(0, 8)).join(', ')}]…`,
  );

  const mailbox = await rpc(
    'mailbox',
    'E2eeService',
    'ListMailboxEnvelopes',
    {
      deviceId: alice.deviceId,
      limit: 10,
    },
    ALICE.token,
  );
  const received = (mailbox.envelopes ?? []).find(
    (envelope) =>
      envelope.logicalMessageId === sent.logicalMessageId && envelope.senderActorId === BOB.actorId,
  );
  assert(
    'mailbox',
    received !== undefined,
    'alice mailbox does not contain the sent logical message',
  );
  assert(
    'mailbox',
    received.ciphertext === forAlice.ciphertextB64,
    'received ciphertext is not byte-identical to what was sealed (base64 mismatch)',
  );
  assert(
    'mailbox',
    received.ciphertextDigest === b64(forAlice.ciphertextDigestBytes),
    'ciphertext digest mismatch',
  );
  assert(
    'mailbox',
    typeof received.frankingTag?.tag === 'string' && received.frankingTag.tag.length > 0,
    'delivered envelope carries no franking tag',
  );
  assert('mailbox', received.conversationId === created.conversationId, 'wrong conversation');
  ok('mailbox', `byte-identical envelope + franking tag received by alice's device`);

  const acked = await rpc(
    'ack',
    'E2eeService',
    'AcknowledgeEnvelopes',
    {
      deviceId: alice.deviceId,
      envelopeIds: [received.envelopeId],
    },
    ALICE.token,
  );
  assert(
    'ack',
    acked.acknowledgedCount === 1,
    `acknowledged ${String(acked.acknowledgedCount)} envelopes, expected 1`,
  );
  const afterAck = await rpc(
    'ack',
    'E2eeService',
    'ListMailboxEnvelopes',
    {
      deviceId: alice.deviceId,
      limit: 10,
    },
    ALICE.token,
  );
  assert(
    'ack',
    !(afterAck.envelopes ?? []).some((envelope) => envelope.envelopeId === received.envelopeId),
    'acknowledged envelope still in mailbox',
  );
  ok('ack', 'envelope acknowledged and drained from the mailbox');

  const bobMailbox = await rpc(
    'mailbox-bob',
    'E2eeService',
    'ListMailboxEnvelopes',
    {
      deviceId: bob.deviceId,
      limit: 10,
    },
    BOB.token,
  );
  const initialDelivery = (bobMailbox.envelopes ?? []).find(
    (envelope) => envelope.logicalMessageId === created.logicalMessageId,
  );
  assert(
    'mailbox-bob',
    initialDelivery !== undefined && initialDelivery.ciphertext === forBob.ciphertextB64,
    'bob did not receive the creation message byte-identically',
  );
  await rpc(
    'mailbox-bob',
    'E2eeService',
    'AcknowledgeEnvelopes',
    {
      deviceId: bob.deviceId,
      envelopeIds: [initialDelivery.envelopeId],
    },
    BOB.token,
  );
  ok('mailbox-bob', 'bob received the creation message byte-identically and acknowledged it');

  console.log(
    'E2EE interop walk PASSED: capability=ENABLED, enroll ×2, create, send, receive, franking tag, ack, drain.',
  );
}

main().catch((error) => {
  fail('unexpected', error instanceof Error ? (error.stack ?? error.message) : String(error));
});
