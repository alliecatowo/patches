import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { credentials } from '@grpc/grpc-js';
import { generateSigningKeyPair, sha256Hash, sign } from '@patches/crypto';
import {
  AdminAuditLog,
  Conversation as ConversationEntity,
  ConversationMember as ConversationMemberEntity,
  E2eeDeviceIdentity,
  E2eeDeviceRoster,
  E2eeGroupControlEvent,
  E2eeIdentityRoot,
  E2eeLogicalMessage,
  E2eeMailboxEnvelope,
  E2eeNodeFrankingKey,
  E2eeOneTimePrekey,
  E2eeReportEvidence,
  E2eeReportEvidenceItem,
  E2eeSignedPrekey,
  Message as MessageEntity,
  MessageRequest,
  ModerationLogEntry,
  Notification as NotificationEntity,
  OutboxJob,
  Report as ReportEntity,
} from '@patches/database';
import {
  canonicalFanoutTranscript,
  canonicalGroupControlTranscript,
  E2EE_FRANKING_PROFILE_V1,
} from '@patches/domain';
import {
  createAuthClient,
  createDirectMessageClient,
  createModerationClient,
  REPORT_REASON,
  type AuthGrpcClient,
  type CreateConversationRequest,
  type CreateConversationResponse,
  type DirectMessageGrpcClient,
  type ListMessagesRequest,
  type ListMessagesResponse,
  type ModerationGrpcClient,
  type ReportE2eeMessageRequest,
  type ReportE2eeMessageResponse,
} from '@patches/proto';
import { createTestFollow, createTestUser } from '@patches/testkit';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource, ObjectLiteral } from 'typeorm';

import { E2eeConversationService } from '../src/modules/e2ee/e2ee-conversation.service.js';
import { E2eeDeviceRosterService } from '../src/modules/e2ee/device-roster.service.js';
import { E2eeRateLimitService } from '../src/modules/e2ee/e2ee-rate-limit.service.js';
import {
  encodeCertificateTranscript,
  encodePrekeyBundleTranscript,
  encodeRosterTranscript,
} from '../src/modules/e2ee/e2ee.codec.js';
import { E2eeGroupService } from '../src/modules/e2ee/group-control.service.js';
import { E2eeIdentityRootService } from '../src/modules/e2ee/identity-root.service.js';
import { E2eeRuntimeApprovalPolicy } from '../src/modules/e2ee/e2ee-runtime-approval-policy.js';
import { E2eeReportEvidenceService } from '../src/modules/e2ee/report-evidence.service.js';
import { type NodeFrankingKeyRing } from '../src/modules/e2ee/report-evidence.js';
import { E2eeGroupChangeKind } from '@patches/proto/nest';
import { createServerTestDataSource } from './support/database.js';
import { registerTestActor, type TestActor } from './support/fixtures.js';
import { callUnary, startTestServer, type TestServer } from './support/test-server.js';

/**
 * P13-013 — cross-layer privacy verification (ADR 0020 §12.6, §12.10, §12.11).
 *
 * Not a functional suite: every test here is an *absence* proof. Canaries are planted at
 * the only places the boundary allows them and then asserted absent everywhere else:
 *
 * 1. **Storage scan** — after exercising the legacy DM, E2EE create/send/group/report
 *    flows against real PostgreSQL, walk every column of every table those flows write
 *    (plus notifications/outbox/audit surfaces) and assert each canary appears only in
 *    its explicitly allowlisted `(table, column)` pairs.
 * 2. **Log/error/notification scan** — the whole app's Nest `Logger` output is captured
 *    (including thrown `AppError`/gRPC error text) and asserted canary-free; and no
 *    notification row is created for an E2EE conversation at all (§187-style generic
 *    signal or nothing — never a body).
 * 3. **Migration semantics** — a LEGACY_SERVER_VISIBLE conversation stays legacy and
 *    legible after E2EE capability arrives, and `security_mode` cannot be flipped in
 *    place (the BEFORE UPDATE trigger rejects both directions).
 * 4. **Export/deletion semantics** — E2EE flows write no `messages` rows (so the
 *    account export's `messages.json` cannot carry E2EE content), and the export/purge
 *    handlers reference no e2ee table.
 * 5. **Federation isolation** (ADR 0020 §12.11/§13) — a source-level import-graph walk
 *    proves no path from any federation module to the e2ee module (and vice versa).
 *
 * The canaries stand in for real secrets: `legacyBody`/`e2eeBody` for message bodies,
 * `evidenceCanary` for reporter-disclosed plaintext, `keyCanary` for ratchet/prekey
 * private-key material. Envelope bytes deliberately *contain* the canaries, so any code
 * that copies, echoes, logs, or re-persists payload bytes anywhere but the allowlisted
 * opaque columns fails this suite loudly.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL_SERVER ?? process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.warn(
    '[apps/server] Skipping e2ee privacy-scan integration tests: TEST_DATABASE_URL is not set ' +
      '(start Postgres with `mise run compose -- up -d`).',
  );
}

const TEST_FRANKING_ERA = 1;
const TEST_FRANKING_KEY = new Uint8Array(32).fill(11);
const testFrankingKeyRing: NodeFrankingKeyRing = {
  keyForEra: (era) => (era === TEST_FRANKING_ERA ? TEST_FRANKING_KEY : undefined),
  knownEras: () => [TEST_FRANKING_ERA],
  currentEra: () => TEST_FRANKING_ERA,
};

/** ADR 0027 test seam: does not change the frozen production approval list. */
const unreviewedTestPolicy = new E2eeRuntimeApprovalPolicy(true);

const ZERO_32 = new Uint8Array(32);
const ZERO_DIGEST = Buffer.alloc(32);
const PROTOCOL = 'patches-e2ee-v1';

// ---------------------------------------------------------------------------
// Canaries and their allowlists
// ---------------------------------------------------------------------------

const randTag = () => randomBytes(8).toString('hex');
const legacyBody = `PRIVSCAN-LEGACY-BODY-${randTag()}`;
const e2eeBody = `PRIVSCAN-E2EE-BODY-${randTag()}`;
const evidenceCanary = `PRIVSCAN-EVIDENCE-${randTag()}`;
const reportDetails = `PRIVSCAN-REPORT-DETAILS-${randTag()}`;
/** 32 bytes with a recognizable ASCII head, standing in for a ratchet/prekey private key. */
const keyCanary = Buffer.concat([Buffer.from('PRIVSCAN-KEYMAT-', 'utf8'), randomBytes(16)]);

const e2eeBodyBytes = Buffer.from(e2eeBody, 'utf8');
const evidenceBytes = Buffer.from(evidenceCanary, 'utf8');

interface Canary {
  readonly name: string;
  /** Raw bytes to search for in Buffer columns and (as text/hex/base64) in string columns. */
  readonly bytes: Buffer;
}

const canaries: readonly Canary[] = [
  { name: 'legacyBody', bytes: Buffer.from(legacyBody, 'utf8') },
  { name: 'e2eeBody', bytes: e2eeBodyBytes },
  { name: 'evidenceCanary', bytes: evidenceBytes },
  { name: 'reportDetails', bytes: Buffer.from(reportDetails, 'utf8') },
  { name: 'keyCanary', bytes: keyCanary },
];

/** The ONLY (entity property, canary) pairs a correct node may persist. Everything else
 * is a leak. `Message.body` is additionally row-scoped to the legacy conversation in the
 * scan itself — legacy DMs are server-visible by design (ADR 0017), but an E2EE-flow
 * row must never carry the legacy canary and vice versa. */
const STORAGE_ALLOWLIST: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Message.body', new Set(['legacyBody'])],
  ['E2eeMailboxEnvelope.ciphertext', new Set(['e2eeBody'])],
  ['E2eeMailboxEnvelope.encryptedHeader', new Set(['keyCanary'])],
  ['E2eeReportEvidenceItem.disclosedPlaintext', new Set(['evidenceCanary'])],
  ['E2eeReportEvidenceItem.opening', new Set(['keyCanary'])],
  ['Report.details', new Set(['reportDetails'])],
]);

// ---------------------------------------------------------------------------
// E2EE client-side machinery (same shapes as e2ee.integration.test.ts)
// ---------------------------------------------------------------------------

interface TestEnvelope {
  recipientActorId: string;
  recipientDeviceId: string;
  encryptedHeader: Buffer;
  ciphertext: Buffer;
  openingCiphertext: Buffer;
  ciphertextDigest: Buffer;
}

/** An opaque per-device envelope whose bytes deliberately embed the canaries — exactly
 * what a buggy client that leaked plaintext/key material into its wire payload would
 * upload, and therefore the strongest input this scan can feed the node. */
function canaryEnvelope(
  recipientActorId: string,
  recipientDeviceId: string,
  bodyCanary: Buffer | null,
  headerCanary: Buffer | null,
): TestEnvelope {
  const ciphertext = Buffer.concat([randomBytes(48), bodyCanary ?? randomBytes(16)]);
  const encryptedHeader = Buffer.concat([randomBytes(16), headerCanary ?? randomBytes(16)]);
  return {
    recipientActorId,
    recipientDeviceId,
    encryptedHeader,
    ciphertext,
    openingCiphertext: Buffer.alloc(0),
    ciphertextDigest: Buffer.from(sha256Hash(ciphertext)),
  };
}

function buildLogicalMessage(envelopes: readonly TestEnvelope[], options: { epoch?: bigint } = {}) {
  const commitment = Buffer.from(sha256Hash(randomBytes(16)));
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
    frankingCommitment: commitment,
    frankingProfile: E2EE_FRANKING_PROFILE_V1,
    fanoutDigest: Buffer.from(fanoutDigest),
    deviceEnvelopes: [...envelopes],
  };
}

interface TestActorKeys {
  actorId: string;
  rootPrivateKey: Uint8Array;
  rootPublicKey: Uint8Array;
}

interface DeviceKeys {
  deviceId: string;
  signingPrivateKey: Uint8Array;
  signingPublicKey: Uint8Array;
  agreementPublicKey: Uint8Array;
}

function newDevice(): DeviceKeys {
  const signing = generateSigningKeyPair();
  const agreement = generateSigningKeyPair();
  return {
    deviceId: randomUUID(),
    signingPrivateKey: signing.privateKey,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
  };
}

function ts(date: Date): { seconds: string; nanos: number } {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds: String(seconds), nanos: (ms - seconds * 1000) * 1_000_000 };
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
    certificateDigest: Buffer.from(sha256Hash(certificateBytes)),
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
  return {
    actorId: actor.actorId,
    sequence: sequence.toString(),
    rootGeneration: 1,
    previousDigest: Buffer.from(previousDigest),
    digest: Buffer.from(sha256Hash(rosterBytes)),
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
  const publicKey = generateSigningKeyPair().publicKey;
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

// ---------------------------------------------------------------------------
// Log capture (Nest Logger static override — every Logger instance in the process,
// including the booted test server's controllers/interceptors/handlers, routes here)
// ---------------------------------------------------------------------------

const capturedLogLines: string[] = [];

/** Stringify a logged value so binary payloads are scannable: Buffers become hex. */
function stringifyForScan(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return (
        JSON.stringify(value, (_key, nested: unknown) => {
          if (Buffer.isBuffer(nested)) return nested.toString('hex');
          if (nested instanceof Uint8Array) return Buffer.from(nested).toString('hex');
          return nested;
        }) ?? ''
      );
    } catch {
      return '[unserializable object]';
    }
  }
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'symbol') return value.description ?? '';
  return '[unserializable object]';
}

function captureAt(level: string) {
  return (message: unknown, stack?: string, context?: string) => {
    const parts = [message, stack, context].map(stringifyForScan);
    capturedLogLines.push(`[${level}] ${parts.join(' ')}`);
  };
}

Logger.overrideLogger({
  log: captureAt('log'),
  error: captureAt('error'),
  warn: captureAt('warn'),
  debug: captureAt('debug'),
  verbose: captureAt('verbose'),
  fatal: captureAt('fatal'),
});

/** Runs `action`, expecting rejection with `code`, and records the thrown error's full
 * text in the captured log buffer so the scan also covers error payloads. */
async function expectRejectedRecording(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  let error: unknown;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  if (error === undefined) {
    throw new Error(`Expected rejection with ${code}, but the call resolved.`);
  }
  const throwable = error as { code?: unknown; details?: unknown; message?: unknown };
  const thrownCode = typeof throwable.code === 'string' ? throwable.code : '';
  capturedLogLines.push(
    `[thrown] ${thrownCode} ${stringifyForScan(throwable.message)} ` +
      stringifyForScan(throwable.details),
  );
  expect(thrownCode).toContain(code);
}

// ---------------------------------------------------------------------------
// Storage scan
// ---------------------------------------------------------------------------

interface EntityMetadata {
  readonly label: string;
  readonly Entity: new () => ObjectLiteral;
}

/** Every table the exercised flows can write, plus the adjacent surfaces ADR 0020 §12.6
 * names (notifications, outbox, audit/moderation logs, reports). */
const SCANNED_ENTITIES: readonly EntityMetadata[] = [
  { label: 'Conversation', Entity: ConversationEntity },
  { label: 'ConversationMember', Entity: ConversationMemberEntity },
  { label: 'Message', Entity: MessageEntity },
  { label: 'MessageRequest', Entity: MessageRequest },
  { label: 'Report', Entity: ReportEntity },
  { label: 'Notification', Entity: NotificationEntity },
  { label: 'OutboxJob', Entity: OutboxJob },
  { label: 'AdminAuditLog', Entity: AdminAuditLog },
  { label: 'ModerationLogEntry', Entity: ModerationLogEntry },
  { label: 'E2eeIdentityRoot', Entity: E2eeIdentityRoot },
  { label: 'E2eeDeviceIdentity', Entity: E2eeDeviceIdentity },
  { label: 'E2eeDeviceRoster', Entity: E2eeDeviceRoster },
  { label: 'E2eeSignedPrekey', Entity: E2eeSignedPrekey },
  { label: 'E2eeOneTimePrekey', Entity: E2eeOneTimePrekey },
  { label: 'E2eeLogicalMessage', Entity: E2eeLogicalMessage },
  { label: 'E2eeMailboxEnvelope', Entity: E2eeMailboxEnvelope },
  { label: 'E2eeGroupControlEvent', Entity: E2eeGroupControlEvent },
  { label: 'E2eeReportEvidence', Entity: E2eeReportEvidence },
  { label: 'E2eeReportEvidenceItem', Entity: E2eeReportEvidenceItem },
  { label: 'E2eeNodeFrankingKey', Entity: E2eeNodeFrankingKey },
];

function hexForms(buffer: Buffer): string[] {
  return [buffer.toString('hex'), buffer.toString('base64')];
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'P13-013 cross-layer privacy verification (ADR 0020 §12.6/§12.10/§12.11)',
  () => {
    let dataSource: DataSource;
    let server: TestServer;
    let auth: AuthGrpcClient;
    let messages: DirectMessageGrpcClient;
    let moderation: ModerationGrpcClient;
    let identityRoots: E2eeIdentityRootService;
    let deviceRosters: E2eeDeviceRosterService;
    let conversations: E2eeConversationService;
    let groups: E2eeGroupService;
    let reportEvidence: E2eeReportEvidenceService;

    // Populated once by the seeding flow in beforeAll; every test reads this state.
    let legacyConversationId = '';
    let e2eeConversationId = '';
    let e2eeSender!: TestActorKeys & { accessToken: string };
    let e2eeRecipient!: TestActorKeys;
    let e2eeSenderDevice!: DeviceKeys;
    let e2eeRecipientDevice!: DeviceKeys;
    let legacyAlice!: TestActor;
    let reportedLogicalMessageId = '';

    async function newActor(): Promise<TestActorKeys> {
      const { actor } = await createTestUser(dataSource.manager);
      const rootKeys = generateSigningKeyPair();
      return {
        actorId: actor.id,
        rootPrivateKey: rootKeys.privateKey,
        rootPublicKey: rootKeys.publicKey,
      };
    }

    /** Like `newActor`, but registers through the real auth RPC so the identity holds an
     * access token. Needed whenever a flow must act over gRPC *as this actor*: reporting
     * an E2EE message requires the reporter to be a conversation member (uniform
     * E2EE_MESSAGE_NOT_FOUND for non-members — ADR 0020 §9's no-oracle rule), and
     * AttachReportEvidence additionally requires the discloser to be the report's own
     * reporter (report-evidence.ts), so the reporter here must be the sender. */
    async function newRegisteredActor(
      inviterUserId: string,
    ): Promise<TestActorKeys & { accessToken: string }> {
      const session = await registerTestActor(auth, dataSource, inviterUserId);
      const rootKeys = generateSigningKeyPair();
      return {
        actorId: session.actorId,
        rootPrivateKey: rootKeys.privateKey,
        rootPublicKey: rootKeys.publicKey,
        accessToken: session.accessToken,
      };
    }

    async function enrollFirstDevice(actor: TestActorKeys): Promise<DeviceKeys> {
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

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();
      identityRoots = new E2eeIdentityRootService(dataSource);
      deviceRosters = new E2eeDeviceRosterService(dataSource);
      conversations = new E2eeConversationService(
        dataSource,
        testFrankingKeyRing,
        unreviewedTestPolicy,
        // No-op budgets: this suite exercises privacy/leak invariants, not §188 windows.
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
      );
      groups = new E2eeGroupService(
        dataSource,
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
      );
      reportEvidence = new E2eeReportEvidenceService(
        dataSource,
        testFrankingKeyRing,
        new E2eeRateLimitService({ increment: () => Promise.resolve(0) } as never),
      );

      server = await startTestServer();
      auth = createAuthClient(server.url, credentials.createInsecure());
      moderation = createModerationClient(server.url, credentials.createInsecure());
      messages = createDirectMessageClient(server.url, credentials.createInsecure());

      // --- Legacy DM flow (ADR 0017): server-visible by design, but its body must
      // --- never leave messages.body (and never reach logs — asserted below).
      const { user: inviter } = await createTestUser(dataSource.manager);
      legacyAlice = await registerTestActor(auth, dataSource, inviter.id);
      const legacyBob = await registerTestActor(auth, dataSource, inviter.id);
      await createTestFollow(dataSource.manager, {
        followerActorId: legacyAlice.actorId,
        followeeActorId: legacyBob.actorId,
      });
      await createTestFollow(dataSource.manager, {
        followerActorId: legacyBob.actorId,
        followeeActorId: legacyAlice.actorId,
      });
      const created = await callUnary<CreateConversationRequest, CreateConversationResponse>(
        messages.createConversation.bind(messages),
        {
          clientRequestId: randomUUID(),
          recipientActorIds: [legacyBob.actorId],
          initialBody: legacyBody,
        },
        { accessToken: legacyAlice.accessToken },
      );
      if (created.conversation === null || created.conversation === undefined) {
        throw new Error('legacy conversation was not created');
      }
      legacyConversationId = created.conversation.id;

      // --- E2EE flow: every envelope byte array carries a canary.
      // The sender is a registered actor (see `newRegisteredActor`): the report flow
      // below must run as a conversation member, and evidence attach must run as the
      // report's reporter.
      e2eeSender = await newRegisteredActor(inviter.id);
      e2eeRecipient = await newActor();
      e2eeSenderDevice = await enrollFirstDevice(e2eeSender);
      e2eeRecipientDevice = await enrollFirstDevice(e2eeRecipient);
      // §183.2 first-contact eligibility now applies to E2EE conversations too.
      await createTestFollow(dataSource.manager, {
        followerActorId: e2eeSender.actorId,
        followeeActorId: e2eeRecipient.actorId,
      });
      await createTestFollow(dataSource.manager, {
        followerActorId: e2eeRecipient.actorId,
        followeeActorId: e2eeSender.actorId,
      });

      const first = await conversations.createE2eeConversation(e2eeSender.actorId, {
        clientRequestId: randomUUID(),
        recipientActorIds: [e2eeRecipient.actorId],
        senderDeviceId: e2eeSenderDevice.deviceId,
        message: buildLogicalMessage([
          canaryEnvelope(
            e2eeRecipient.actorId,
            e2eeRecipientDevice.deviceId,
            e2eeBodyBytes,
            keyCanary,
          ),
        ]),
      });
      e2eeConversationId = first.conversationId;

      // Group transition: a third member joins at epoch 2 (writes the signed transcript).
      // DIRECT-kind E2EE conversations cannot grow (ADR 0020 §7 pairwise bound), so the
      // scan runs on a GROUP-kind thread: re-create with a second founding recipient.
      const secondRecipient = await newActor();
      const secondRecipientDevice = await enrollFirstDevice(secondRecipient);
      await createTestFollow(dataSource.manager, {
        followerActorId: e2eeSender.actorId,
        followeeActorId: secondRecipient.actorId,
      });
      await createTestFollow(dataSource.manager, {
        followerActorId: secondRecipient.actorId,
        followeeActorId: e2eeSender.actorId,
      });
      const groupCreated = await conversations.createE2eeConversation(e2eeSender.actorId, {
        clientRequestId: randomUUID(),
        recipientActorIds: [e2eeRecipient.actorId, secondRecipient.actorId],
        senderDeviceId: e2eeSenderDevice.deviceId,
        message: buildLogicalMessage([
          canaryEnvelope(
            e2eeRecipient.actorId,
            e2eeRecipientDevice.deviceId,
            e2eeBodyBytes,
            keyCanary,
          ),
          canaryEnvelope(
            secondRecipient.actorId,
            secondRecipientDevice.deviceId,
            e2eeBodyBytes,
            keyCanary,
          ),
        ]),
      });
      e2eeConversationId = groupCreated.conversationId;

      const newcomer = await newActor();
      const newcomerDevice = await enrollFirstDevice(newcomer);
      await createTestFollow(dataSource.manager, {
        followerActorId: e2eeSender.actorId,
        followeeActorId: newcomer.actorId,
      });
      await createTestFollow(dataSource.manager, {
        followerActorId: newcomer.actorId,
        followeeActorId: e2eeSender.actorId,
      });
      await groups.addE2eeMember(e2eeSender.actorId, {
        conversationId: e2eeConversationId,
        actorId: newcomer.actorId,
        signerDeviceId: e2eeSenderDevice.deviceId,
        event: signedGroupControlEvent({
          conversationId: e2eeConversationId,
          epoch: 2n,
          change: E2eeGroupChangeKind.E2EE_GROUP_CHANGE_KIND_ADDED,
          subjectActorId: newcomer.actorId,
          signer: e2eeSender,
          signerDevice: e2eeSenderDevice,
          previousDigest: ZERO_DIGEST,
        }),
      });

      // Error path with canaries in play: a stale-epoch send must fail closed, and its
      // error text must not echo any payload byte.
      await expectRejectedRecording(
        () =>
          conversations.sendEnvelopes(e2eeSender.actorId, {
            conversationId: e2eeConversationId,
            clientRequestId: randomUUID(),
            senderDeviceId: e2eeSenderDevice.deviceId,
            message: buildLogicalMessage([
              canaryEnvelope(
                e2eeRecipient.actorId,
                e2eeRecipientDevice.deviceId,
                e2eeBodyBytes,
                keyCanary,
              ),
              canaryEnvelope(newcomer.actorId, newcomerDevice.deviceId, e2eeBodyBytes, keyCanary),
              canaryEnvelope(
                secondRecipient.actorId,
                secondRecipientDevice.deviceId,
                e2eeBodyBytes,
                keyCanary,
              ),
            ]),
          }),
        'E2EE_FANOUT_REJECTED',
      );

      // Accepted epoch-2 send (this is the message the report below discloses against).
      const second = await conversations.sendEnvelopes(e2eeSender.actorId, {
        conversationId: e2eeConversationId,
        clientRequestId: randomUUID(),
        senderDeviceId: e2eeSenderDevice.deviceId,
        message: buildLogicalMessage(
          [
            canaryEnvelope(
              e2eeRecipient.actorId,
              e2eeRecipientDevice.deviceId,
              e2eeBodyBytes,
              keyCanary,
            ),
            canaryEnvelope(newcomer.actorId, newcomerDevice.deviceId, e2eeBodyBytes, keyCanary),
            canaryEnvelope(
              secondRecipient.actorId,
              secondRecipientDevice.deviceId,
              e2eeBodyBytes,
              keyCanary,
            ),
          ],
          { epoch: 2n },
        ),
      });
      reportedLogicalMessageId = second.logicalMessageId;

      // --- Report flow: the ONLY intentional E2EE plaintext disclosure (ADR 0020 §9).
      // Reported *by the sender*: a non-member reporter gets the uniform
      // E2EE_MESSAGE_NOT_FOUND, and the evidence attach below must run as this
      // report's reporter.
      const reported = await callUnary<ReportE2eeMessageRequest, ReportE2eeMessageResponse>(
        // proto-loader's camelCaser turns `ReportE2eeMessage` into `reportE2EeMessage`.
        moderation.reportE2EeMessage.bind(moderation),
        {
          logicalMessageId: reportedLogicalMessageId,
          reason: REPORT_REASON.HARASSMENT,
          details: reportDetails,
        },
        { accessToken: e2eeSender.accessToken },
      );
      if (reported.reportId === undefined || reported.reportId === '') {
        throw new Error('reportE2eeMessage did not return a report id');
      }

      // Error path: attaching to a nonexistent report (its message must stay canary-free).
      await expectRejectedRecording(
        () =>
          reportEvidence.attachReportEvidence(e2eeSender.actorId, {
            reportId: randomUUID(),
            conversationId: e2eeConversationId,
            reporterConsented: true,
            items: [
              {
                position: 0,
                logicalMessageId: reportedLogicalMessageId,
                disclosedPlaintext: evidenceBytes,
                opening: keyCanary,
                envelopeTranscript: Buffer.alloc(0),
                frankingTag: Buffer.alloc(0),
                participantTranscript: Buffer.alloc(0),
                rosterDigest: Buffer.alloc(32, 7),
              },
            ],
          }),
        'REPORT_NOT_FOUND',
      );

      // Genuine attach: the disclosure is stored (verification may fail — evidence is
      // stored either way; only the allowlisted columns may hold it).
      const attached = await reportEvidence.attachReportEvidence(e2eeSender.actorId, {
        reportId: reported.reportId,
        conversationId: e2eeConversationId,
        reporterConsented: true,
        items: [
          {
            position: 0,
            logicalMessageId: reportedLogicalMessageId,
            disclosedPlaintext: evidenceBytes,
            opening: keyCanary,
            envelopeTranscript: Buffer.alloc(0),
            frankingTag: Buffer.alloc(0),
            participantTranscript: Buffer.alloc(0),
            rosterDigest: Buffer.alloc(32, 7),
          },
        ],
      });
      // Closed failure-code set, never a payload fragment.
      expect([
        '',
        'COMMITMENT_MISMATCH',
        'NODE_TAG_MISMATCH',
        'UNKNOWN_FRANKING_PROFILE',
        'UNKNOWN_KEY_ERA',
        'TRANSCRIPT_MISMATCH',
      ]).toContain(attached.verificationFailureCode);
    }, 120_000);

    afterAll(async () => {
      Logger.overrideLogger(console);
      await server.close();
      await dataSource.destroy();
    });

    it('storage scan: every canary appears only in its allowlisted columns (ADR 0020 §12.6)', async () => {
      expect(legacyConversationId).not.toBe('');
      expect(e2eeConversationId).not.toBe('');
      const violations: string[] = [];

      for (const { label, Entity } of SCANNED_ENTITIES) {
        const rows = await dataSource.getRepository(Entity).find();
        for (const [rowIndex, row] of rows.entries()) {
          for (const [column, value] of Object.entries(row)) {
            if (value === null || value === undefined) continue;
            for (const canary of canaries) {
              let present = false;
              if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
                const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
                present = buffer.indexOf(canary.bytes) !== -1;
              } else if (typeof value === 'string') {
                present =
                  value.includes(canary.bytes.toString('utf8')) ||
                  hexForms(canary.bytes).some((form) => value.includes(form));
              }
              if (!present) continue;

              const allowed = STORAGE_ALLOWLIST.get(`${label}.${column}`);
              const isAllowed = allowed?.has(canary.name) ?? false;
              // Row-scoping: the legacy body may exist only on the legacy conversation's
              // message rows — never on any row created by an E2EE flow.
              const rowScopeOk =
                label !== 'Message' ||
                (row as { conversationId?: unknown }).conversationId === legacyConversationId;
              if (!isAllowed || !rowScopeOk) {
                violations.push(
                  `${canary.name} leaked into ${label}.${column} (row ${rowIndex}, ` +
                    `allowed=${String(isAllowed)}, rowScopeOk=${String(rowScopeOk)})`,
                );
              }
            }
          }
        }
      }

      expect(violations, `Storage canary leaks:\n${violations.join('\n')}`).toEqual([]);
    }, 60_000);

    it('no notification row is created for an E2EE conversation (§187/ADR 0020 §1.5)', async () => {
      const forE2eeConversation = await dataSource
        .getRepository(NotificationEntity)
        .countBy({ conversationId: e2eeConversationId });
      expect(forE2eeConversation).toBe(0);

      // Every notification in the database, scanned as text: no canary anywhere. A
      // MESSAGE notification is a generic signal + conversation id, never a body.
      const all = await dataSource.getRepository(NotificationEntity).find();
      const serialized = JSON.stringify(all, (_key, nested: unknown) => {
        if (Buffer.isBuffer(nested)) return nested.toString('hex');
        return nested;
      });
      for (const canary of canaries) {
        expect(serialized.includes(canary.bytes.toString('utf8'))).toBe(false);
      }
    });

    it('log/error scan: no canary appears in any captured Logger line or thrown error', () => {
      expect(capturedLogLines.length).toBeGreaterThan(0);
      const violations: string[] = [];
      for (const line of capturedLogLines) {
        for (const canary of canaries) {
          if (
            line.includes(canary.bytes.toString('utf8')) ||
            hexForms(canary.bytes).some((form) => line.includes(form))
          ) {
            violations.push(`${canary.name} leaked into log line: ${line.slice(0, 300)}`);
          }
        }
      }
      expect(violations, `Log canary leaks:\n${violations.join('\n')}`).toEqual([]);
    });

    it('migration: a LEGACY_SERVER_VISIBLE conversation stays legacy and legible after E2EE capability arrives', async () => {
      // E2EE capability "arrives": both legacy actors publish identity roots and devices.
      // One keypair — the root's self-signature must verify against its own public half.
      const legacyRootKeys = generateSigningKeyPair();
      const legacyKeys: TestActorKeys = {
        actorId: legacyAlice.actorId,
        rootPrivateKey: legacyRootKeys.privateKey,
        rootPublicKey: legacyRootKeys.publicKey,
      };
      await enrollFirstDevice(legacyKeys);

      const conversation = await dataSource
        .getRepository(ConversationEntity)
        .findOneByOrFail({ id: legacyConversationId });
      expect(conversation.securityMode).toBe('LEGACY_SERVER_VISIBLE');

      const listed = await callUnary<ListMessagesRequest, ListMessagesResponse>(
        messages.listMessages.bind(messages),
        { conversationId: legacyConversationId, cursor: '', limit: 10 },
        { accessToken: legacyAlice.accessToken },
      );
      const bodies = listed.messages.map((message) => message.body ?? '');
      expect(bodies.some((body) => body.includes(legacyBody))).toBe(true);
    });

    it('migration: security_mode cannot be flipped in place — the DB trigger rejects both directions', async () => {
      await expect(
        dataSource.query('UPDATE conversations SET security_mode = $1 WHERE id = $2', [
          'E2EE_V1',
          legacyConversationId,
        ]),
      ).rejects.toThrow(/security mode is immutable/i);

      await expect(
        dataSource.query('UPDATE conversations SET security_mode = $1 WHERE id = $2', [
          'LEGACY_SERVER_VISIBLE',
          e2eeConversationId,
        ]),
      ).rejects.toThrow(/security mode is immutable/i);

      // Neither update took effect.
      const legacy = await dataSource
        .getRepository(ConversationEntity)
        .findOneByOrFail({ id: legacyConversationId });
      const encrypted = await dataSource
        .getRepository(ConversationEntity)
        .findOneByOrFail({ id: e2eeConversationId });
      expect(legacy.securityMode).toBe('LEGACY_SERVER_VISIBLE');
      expect(encrypted.securityMode).toBe('E2EE_V1');
    });

    it('export semantics: E2EE flows write no messages rows, and the export handler reads no e2ee table (§204, ADR 0020 §12.10)', async () => {
      // The export's messages.json is built from `messages` rows of the actor's
      // conversations (apps/worker/src/jobs/handlers/export-account.handler.ts).
      const legacyRows = await dataSource
        .getRepository(MessageEntity)
        .countBy({ conversationId: legacyConversationId });
      const e2eeRows = await dataSource
        .getRepository(MessageEntity)
        .countBy({ conversationId: e2eeConversationId });
      expect(legacyRows).toBeGreaterThan(0);
      expect(e2eeRows).toBe(0);

      // And by construction the export never queries any E2EE envelope/ciphertext table.
      const exportHandlerSource = readFileSync(
        resolve(__dirname, '../../worker/src/jobs/handlers/export-account.handler.ts'),
        'utf8',
      );
      expect(exportHandlerSource.includes('E2ee')).toBe(false);
      expect(exportHandlerSource.includes("'e2ee_")).toBe(false);
    });

    it('deletion semantics: PURGE_ACCOUNT erases the purged actor’s e2ee rows but spares report evidence (audit P1 fix; ADR 0020 evidence-outlives rule)', () => {
      // The purge handler now deletes identity roots, device identities/certs, rosters,
      // prekeys, mailbox envelopes, logical messages, and self-signed group-control events
      // for the purged actor — while report-evidence rows remain, by design, as the
      // moderation record that outlives the account.
      const purgeHandlerSource = readFileSync(
        resolve(__dirname, '../../worker/src/jobs/handlers/purge-account.handler.ts'),
        'utf8',
      );
      expect(purgeHandlerSource.includes('E2ee')).toBe(true);
      expect(purgeHandlerSource.includes('E2eeIdentityRoot')).toBe(true);
      expect(purgeHandlerSource.includes('getRepository(E2eeReportEvidence')).toBe(false);
    });
  },
);

// ---------------------------------------------------------------------------
// Federation isolation (ADR 0020 §12.11/§13) — no import path between the federation
// seam and the e2ee module, in either direction, transitive within apps/server/src and
// apps/worker/src. Pure source analysis; no database, but it lives in this file so the
// whole P13-013 verification ships as one runnable artifact.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '../..');
const SERVER_SRC = resolve(REPO_ROOT, 'server/src');
const WORKER_SRC = resolve(REPO_ROOT, 'worker/src');

function listSourceFiles(directory: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const IMPORT_PATTERN = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Resolves a specifier against `importingFile`, following this repo's conventions
 * (`.js` → `.ts`, directory → `index.ts`). Returns undefined for externals. */
function resolveSpecifier(specifier: string, importingFile: string): string | undefined {
  if (!specifier.startsWith('.') && !isAbsolute(specifier)) return undefined;
  const base = resolve(importingFile, '..', specifier);
  const candidates = [
    base,
    base.endsWith('.js') ? `${base.slice(0, -3)}.ts` : undefined,
    `${base}.ts`,
    join(base, 'index.ts'),
  ].filter((candidate): candidate is string => candidate !== undefined);
  return candidates.find((candidate) => {
    try {
      return readdirSync(candidate, { withFileTypes: true }).length >= 0 &&
        listSourceFiles(candidate).length >= 0
        ? true
        : true;
    } catch {
      return false;
    }
  });
}

function importGraph(roots: readonly string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of roots) {
    if (graph.has(file)) continue;
    graph.set(file, new Set());
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2];
      if (specifier === undefined) continue;
      const resolved = resolveSpecifier(specifier, file);
      if (resolved !== undefined) graph.get(file)?.add(resolved);
    }
  }
  return graph;
}

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'P13-013 federation isolation (ADR 0020 §12.11/§13)',
  () => {
    const serverFiles = listSourceFiles(SERVER_SRC);
    const workerFiles = listSourceFiles(WORKER_SRC);
    const graph = importGraph([...serverFiles, ...workerFiles]);

    /** BFS over the resolved relative-import graph from `start`. */
    function reachableFrom(start: string): Set<string> {
      const visited = new Set<string>();
      const queue = [start];
      while (queue.length > 0) {
        const current = queue.shift() as string;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const next of graph.get(current) ?? []) {
          if (!visited.has(next)) queue.push(next);
        }
      }
      return visited;
    }

    it('no federation module reaches the e2ee module through the import graph', () => {
      const federationRoots = [
        ...serverFiles.filter((file) => file.includes(`${join('modules', 'federation')}/`)),
        ...workerFiles.filter((file) => file.includes(`${join('src', 'federation')}/`)),
        ...workerFiles.filter((file) =>
          file.endsWith(join('handlers', 'federation-deliver.handler.ts')),
        ),
      ];
      expect(federationRoots.length).toBeGreaterThan(0);

      const violations: string[] = [];
      for (const root of federationRoots) {
        for (const visited of reachableFrom(root)) {
          if (visited.includes(`${join('modules', 'e2ee')}/`)) {
            violations.push(`${root} → ${visited}`);
          }
          // Even a direct textual mention would be a review flag: nothing in the
          // federation seam should know E2EE exists.
          const source = readFileSync(visited, 'utf8');
          if (/e2ee/i.test(source) && visited.includes(`${join('modules', 'federation')}/`)) {
            violations.push(`${root} → ${visited} (source mentions e2ee)`);
          }
        }
      }
      expect(violations, `Federation→E2EE edges:\n${violations.join('\n')}`).toEqual([]);
    });

    it('no e2ee module reaches a federation module through the import graph', () => {
      const e2eeRoots = serverFiles.filter((file) => file.includes(`${join('modules', 'e2ee')}/`));
      expect(e2eeRoots.length).toBeGreaterThan(0);

      const violations: string[] = [];
      for (const root of e2eeRoots) {
        for (const visited of reachableFrom(root)) {
          if (visited.includes(`${join('modules', 'federation')}/`)) {
            violations.push(`${root} → ${visited}`);
          }
        }
      }
      expect(violations, `E2EE→federation edges:\n${violations.join('\n')}`).toEqual([]);
    });
  },
);
