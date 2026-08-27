/**
 * `E2eeSessionRuntime` tests (B-185). The happy path (compose a session, seal one
 * envelope, decrypt it on the other side) is the least likely part of this module to be
 * wrong — everything here targets the failure and crash paths instead:
 *
 *   - the staged-commit crash window around `send()`'s catch block (`:191-208`): a
 *     freshly created session is deleted on failure (its X3DH envelope never left, so
 *     nothing could ever authenticate against it), while a pre-existing session's
 *     staged advance is confirmed/adopted instead of left pending (audit P1-1);
 *   - what a genuine process crash (not a caught throw) leaves behind for a freshly
 *     created session — see the `BUG (suspected)` test below;
 *   - the mailbox's replay-duplicate acknowledgement (`:289-297`);
 *   - the franking-failure `unverifiable` path (`:378-386`);
 *   - responder-side session establishment from an inbound initial envelope (`:340-356`).
 *
 * Identities are built with the same primitives `enrollment.ts` uses in production
 * (`signDeviceCertificate`, `signDeviceRoster`, `signPreKeyBundle`), so sessions here run
 * the real X3DH/Double Ratchet code, not a stand-in.
 */
import 'fake-indexeddb/auto';

import {
  commitFranking,
  createFrankingOpeningKey,
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  sealDeviceEnvelope,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
  verifyCertifiedDevice,
  verifyMessagingRoot,
  verifyRosterSnapshot,
  E2EE_PROTOCOL,
  KEY_BYTES,
} from '@patches/crypto';
import { E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { ENROLLMENT_RECORD_KEY, enrollThisDevice, loadStoredEnrollment } from './enrollment.js';
import type { LocalDeviceIdentity } from './local-identity.js';
import { selfPrekeyBundle } from './local-identity.js';
import { E2eeSessionRuntime } from './runtime-session.js';
import {
  encodeChatPlaintext,
  sessionIdFor,
  type ClaimedPeerBundle,
  type E2eeMailboxEnvelopeLike,
  type E2eeMailboxTransport,
  type E2eeSendTransport,
  type FanoutPlan,
  type SendEnvelopesRequestLike,
} from './runtime.js';
import { establishInitiatorSession, withInitialFraming } from './session-setup.js';
import {
  createFakeE2eeNode,
  fakeMessagingMailboxTransport,
  fakeMessagingSendTransport,
  fakeTransport,
  registerMessagingDevice,
} from './test-support.js';
import { createRatchetSessionVault, type RatchetSessionVault } from './vault.js';

const NOW = 1_700_000_000_000;
const CONVERSATION_ID = 'c1';

let counter = 0;

function freshId(label: string): string {
  counter += 1;
  return `${label}-${counter}`;
}

// ---------------------------------------------------------------------------
// Identity fixture — the same statements enrollment.ts's crypto-native family makes
// ---------------------------------------------------------------------------

function buildIdentity(actorId: string, deviceId: string): LocalDeviceIdentity {
  const rootKeys = generateSigningKeyPair();
  const signing = generateSigningKeyPair();
  const agreement = generateKeyAgreementKeyPair();
  const createdAtMs = NOW;
  const expiresAtMs = NOW + 30 * 24 * 60 * 60 * 1_000;

  const signedRoot = signMessagingRoot(rootKeys.privateKey, {
    actorId,
    generation: 1,
    publicKey: rootKeys.publicKey,
    createdAtMs,
  });
  const root = verifyMessagingRoot({
    rootBytes: signedRoot.rootBytes,
    selfSignature: signedRoot.selfSignature,
    nowMs: NOW,
  });

  const signedCertificate = signDeviceCertificate(rootKeys.privateKey, {
    actorId,
    deviceId,
    rootGeneration: 1,
    rootPublicKey: rootKeys.publicKey,
    certificateVersion: 1,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    supportedProtocolVersions: [E2EE_PROTOCOL],
    createdAtMs,
    expiresAtMs,
  });
  const selfDevice = verifyCertifiedDevice({
    certificateBytes: signedCertificate.certificateBytes,
    rootSignature: signedCertificate.rootSignature,
    root,
    nowMs: NOW,
  });

  const signedRoster = signDeviceRoster(rootKeys.privateKey, {
    actorId,
    rootGeneration: 1,
    rootPublicKey: rootKeys.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(KEY_BYTES),
    createdAtMs,
    entries: [
      {
        deviceId,
        certificateDigest: signedCertificate.certificateDigest,
        active: true,
        addedAtMs: createdAtMs,
      },
    ],
  });
  const ownRoster = verifyRosterSnapshot({
    rosterBytes: signedRoster.rosterBytes,
    rootSignature: signedRoster.rootSignature,
    root,
    certificates: [
      {
        certificateBytes: signedCertificate.certificateBytes,
        rootSignature: signedCertificate.rootSignature,
      },
    ],
    nowMs: NOW,
  });

  const signedPreKeyId = 1;
  const signedPreKeyPair = generateKeyAgreementKeyPair();
  const signedPreKeyExpiresAtMs = NOW + 7 * 24 * 60 * 60 * 1_000;
  const signedBundle = signPreKeyBundle(signing.privateKey, {
    actorId,
    deviceId,
    certificateDigest: signedCertificate.certificateDigest,
    signedPrekeyId: signedPreKeyId,
    signedPrekeyPublicKey: signedPreKeyPair.publicKey,
    createdAtMs,
    expiresAtMs: signedPreKeyExpiresAtMs,
  });

  return {
    actorId,
    deviceId,
    keys: { signing, agreement },
    selfDevice,
    ownRoster,
    signedPreKey: {
      id: signedPreKeyId,
      keyPair: signedPreKeyPair,
      createdAtMs,
      expiresAtMs: signedPreKeyExpiresAtMs,
    },
    ownBundle: {
      bundleBytes: signedBundle.bundleBytes,
      deviceSignature: signedBundle.deviceSignature,
    },
    oneTimePreKeys: [{ id: 1, keyPair: generateKeyAgreementKeyPair() }],
  };
}

function claimedBundle(identity: LocalDeviceIdentity): ClaimedPeerBundle {
  const oneTime = identity.oneTimePreKeys[0];
  return {
    actorId: identity.actorId,
    deviceId: identity.deviceId,
    bundle: selfPrekeyBundle(
      identity,
      oneTime === undefined ? undefined : { id: oneTime.id, publicKey: oneTime.keyPair.publicKey },
      NOW,
    ),
    roster: identity.ownRoster,
  };
}

async function openVault(): Promise<RatchetSessionVault> {
  return createRatchetSessionVault({
    account: { origin: 'https://node.example', actorId: freshId('actor') },
  });
}

// ---------------------------------------------------------------------------
// Transport fakes
// ---------------------------------------------------------------------------

function sendTransportFor(
  plan: FanoutPlan,
  peerIdentity: LocalDeviceIdentity,
  opts: { sendThrows?: Error | undefined },
): { transport: E2eeSendTransport; state: { claims: number; sent: SendEnvelopesRequestLike[] } } {
  const state = { claims: 0, sent: [] as SendEnvelopesRequestLike[] };
  const transport: E2eeSendTransport = {
    loadFanoutPlan: () => Promise.resolve(plan),
    claimPrekeyBundles: () => {
      state.claims += 1;
      return Promise.resolve([claimedBundle(peerIdentity)]);
    },
    sendEnvelopes: (request) => {
      if (opts.sendThrows !== undefined) return Promise.reject(opts.sendThrows);
      state.sent.push(request);
      return Promise.resolve(undefined);
    },
  };
  return { transport, state };
}

// A send-side transport this test never expects to be called, for receive-only tests.
function deadSendTransport(): E2eeSendTransport {
  return {
    loadFanoutPlan: () => Promise.reject(new Error('unused in this test: send never runs')),
    claimPrekeyBundles: () => Promise.reject(new Error('unused in this test: send never runs')),
    sendEnvelopes: () => Promise.reject(new Error('unused in this test: send never runs')),
  };
}

function deadMailboxTransport(): E2eeMailboxTransport {
  return {
    listMailboxPage: () => Promise.resolve({ envelopes: [], nextCursor: '' }),
    acknowledge: () => Promise.resolve(undefined),
    loadPeerRoster: () => Promise.reject(new Error('unused in this test: mailbox never polls')),
  };
}

function queueMailbox(
  pages: readonly (readonly E2eeMailboxEnvelopeLike[])[],
  rosterByActor: ReadonlyMap<string, LocalDeviceIdentity>,
): { transport: E2eeMailboxTransport; state: { acked: string[]; ackCalls: number } } {
  const state = { acked: [] as string[], ackCalls: 0 };
  let pageIndex = 0;
  const transport: E2eeMailboxTransport = {
    listMailboxPage: () => {
      const envelopes = pages[pageIndex] ?? [];
      pageIndex += 1;
      return Promise.resolve({ envelopes, nextCursor: '' });
    },
    acknowledge: (ids) => {
      state.ackCalls += 1;
      state.acked.push(...ids);
      return Promise.resolve(undefined);
    },
    loadPeerRoster: (actorId) => {
      const identity = rosterByActor.get(actorId);
      if (identity === undefined)
        return Promise.reject(new Error(`no roster fixture for ${actorId}`));
      return Promise.resolve(identity.ownRoster);
    },
  };
  return { transport, state };
}

/** Seals a real initial (X3DH-carrying) envelope from `sender` to `recipient`. Binds one fixed
 * `oneTimePreKeys[0]` bundle from `recipient` regardless of what a fake node's own claim
 * bookkeeping currently offers — callers reconstructing a "reused claim" pass the recipient
 * snapshot captured BEFORE consumption. `nowMs`/`conversationId` default to this file's shared
 * fixtures, but a caller enrolling under its own clock (issue #153's tests) must pass its own. */
function sealInitialEnvelope(params: {
  readonly sender: LocalDeviceIdentity;
  readonly recipient: LocalDeviceIdentity;
  readonly body: string;
  readonly envelopeId: string;
  readonly conversationId?: string;
  readonly nowMs?: number;
}): E2eeMailboxEnvelopeLike {
  const nowMs = params.nowMs ?? NOW;
  const conversationId = params.conversationId ?? CONVERSATION_ID;
  const recipientOneTime = params.recipient.oneTimePreKeys[0];
  const established = establishInitiatorSession({
    identity: params.sender,
    peerBundle: selfPrekeyBundle(
      params.recipient,
      recipientOneTime === undefined
        ? undefined
        : { id: recipientOneTime.id, publicKey: recipientOneTime.keyPair.publicKey },
      nowMs,
    ),
    peerRoster: params.recipient.ownRoster,
    nowMs,
  });
  const plaintext = encodeChatPlaintext(params.body);
  const openingKey = createFrankingOpeningKey();
  const context = {
    frankingProfile: E2EE_FRANKING_PROFILE_V1,
    conversationId,
    membershipEpoch: 1,
    senderActorId: params.sender.actorId,
    senderDeviceId: params.sender.deviceId,
  };
  const commitment = commitFranking(openingKey, context, plaintext);
  const transition = sealDeviceEnvelope(established.state, {
    context,
    recipient: {
      recipientActorId: params.recipient.actorId,
      recipientDeviceId: params.recipient.deviceId,
    },
    logicalMessageId: params.envelopeId,
    plaintext,
    openingKey,
    commitment,
  });
  return {
    envelopeId: params.envelopeId,
    logicalMessageId: params.envelopeId,
    conversationId,
    membershipEpoch: 1n,
    senderActorId: params.sender.actorId,
    senderDeviceId: params.sender.deviceId,
    recipientDeviceId: params.recipient.deviceId,
    encryptedHeader: withInitialFraming(established.setupPrefix, transition.output.encryptedHeader),
    ciphertext: transition.output.ciphertext,
    frankingCommitment: commitment,
    frankingTag: { profile: E2EE_FRANKING_PROFILE_V1 },
  };
}

function flipByte(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  out[0] = (out[0] ?? 0) ^ 0x01;
  return out;
}

// ---------------------------------------------------------------------------
// send() — staged-commit crash window
// ---------------------------------------------------------------------------

describe('E2eeSessionRuntime.send — staged-commit recovery on transport failure', () => {
  it('deletes a freshly created session when the send fails, so a retry re-establishes instead of wedging', async () => {
    const self = buildIdentity('alice', 'dev-a');
    const peer = buildIdentity('bob', 'dev-b');
    const vault = await openVault();
    const plan: FanoutPlan = {
      conversationId: CONVERSATION_ID,
      membershipEpoch: 1n,
      targets: [{ actorId: peer.actorId, deviceId: peer.deviceId }],
    };
    const opts: { sendThrows?: Error | undefined } = { sendThrows: new Error('network down') };
    const { transport, state } = sendTransportFor(plan, peer, opts);
    const runtime = new E2eeSessionRuntime({
      vault,
      identity: self,
      sendTransport: transport,
      mailboxTransport: deadMailboxTransport(),
      nowMs: () => NOW,
    });
    const sessionId = sessionIdFor(CONVERSATION_ID, peer.actorId, peer.deviceId);

    await expect(runtime.send(CONVERSATION_ID, 'hello', 'req-1')).rejects.toThrow('network down');

    // No half-established session survives: the X3DH envelope never reached the peer,
    // so nothing could ever authenticate against this chain.
    expect(await vault.getSession(sessionId)).toBeUndefined();
    expect(state.claims).toBe(1);

    opts.sendThrows = undefined;
    await runtime.send(CONVERSATION_ID, 'hello again', 'req-2');

    // Recovery re-claims prekeys and establishes fresh — never resumes the deleted one.
    expect(state.claims).toBe(2);
    expect(await vault.getSession(sessionId)).toBeDefined();
    vault.close();
  });

  it('confirms (adopts) a pre-existing session’s staged advance when the send fails, instead of leaving it pending', async () => {
    const self = buildIdentity('gina', 'dev-g');
    const peer = buildIdentity('hank', 'dev-h');
    const vault = await openVault();
    const plan: FanoutPlan = {
      conversationId: CONVERSATION_ID,
      membershipEpoch: 1n,
      targets: [{ actorId: peer.actorId, deviceId: peer.deviceId }],
    };
    const opts: { sendThrows?: Error | undefined } = {};
    const { transport, state } = sendTransportFor(plan, peer, opts);
    const runtime = new E2eeSessionRuntime({
      vault,
      identity: self,
      sendTransport: transport,
      mailboxTransport: deadMailboxTransport(),
      nowMs: () => NOW,
    });
    const sessionId = sessionIdFor(CONVERSATION_ID, peer.actorId, peer.deviceId);

    await runtime.send(CONVERSATION_ID, 'first', 'req-1');
    const established = await vault.getSession(sessionId);
    if (established === undefined) throw new Error('test setup: session was not established');

    opts.sendThrows = new Error('network down');
    await expect(runtime.send(CONVERSATION_ID, 'second', 'req-2')).rejects.toThrow('network down');

    const afterFailure = await vault.getSession(sessionId);
    expect(afterFailure).toBeDefined();
    // The ratchet is confirmed AHEAD of the failed send, not reverted or dropped
    // (audit P1-1): the next send flows normally from here.
    expect(afterFailure?.sentCount).toBeGreaterThan(established.sentCount);
    // Pre-existing session: no re-claim on failure, unlike the freshly-created case above.
    expect(state.claims).toBe(1);

    opts.sendThrows = undefined;
    await runtime.send(CONVERSATION_ID, 'third', 'req-3');
    expect(state.claims).toBe(1);
    vault.close();
  });

  it('BUG (suspected): a real crash between staging and confirming a NEW session — not a caught throw — leaves the vault presenting it as an already-advanced, live session on reopen, even though its X3DH envelope never left the process', async () => {
    // `send()`'s catch block (runtime-session.ts:191-208) only runs for an in-process
    // exception. A genuine crash (tab kill, OOM, power loss) between the `stageSend`
    // at :164-167 and that catch never runs any recovery code at all — the vault's own
    // crash contract (verified in vault.test.ts's "adopts a staged send left behind by
    // a crash between stage and confirm") is generic per-session and has no notion of
    // "this session was only just created and its first envelope never sent". On
    // reopen it promotes the staged, POST-send state to live regardless. This
    // reproduces exactly that sequence without going through `send()`'s own catch, to
    // show what state a real crash — not a thrown/caught error — actually leaves.
    const self = buildIdentity('carol', 'dev-c');
    const peer = buildIdentity('dave', 'dev-d');
    const account = { origin: 'https://node.example', actorId: freshId('crash-actor') };
    const sessionId = sessionIdFor(CONVERSATION_ID, peer.actorId, peer.deviceId);

    const first = await createRatchetSessionVault({ account });
    const peerOneTime = peer.oneTimePreKeys[0];
    const established = establishInitiatorSession({
      identity: self,
      peerBundle: selfPrekeyBundle(
        peer,
        peerOneTime === undefined
          ? undefined
          : { id: peerOneTime.id, publicKey: peerOneTime.keyPair.publicKey },
        NOW,
      ),
      peerRoster: peer.ownRoster,
      nowMs: NOW,
    });
    // Mirrors `ensureSendSession`: commit the freshly created session before anything
    // is sealed against it (runtime-session.ts:244).
    await first.applyUpdate(sessionId, established.state);
    const createdState = await first.getSession(sessionId);
    if (createdState === undefined) throw new Error('test setup: session was not stored');

    const plaintext = encodeChatPlaintext('never actually sent');
    const openingKey = createFrankingOpeningKey();
    const context = {
      frankingProfile: E2EE_FRANKING_PROFILE_V1,
      conversationId: CONVERSATION_ID,
      membershipEpoch: 1,
      senderActorId: self.actorId,
      senderDeviceId: self.deviceId,
    };
    const commitment = commitFranking(openingKey, context, plaintext);
    const transition = sealDeviceEnvelope(createdState, {
      context,
      recipient: { recipientActorId: peer.actorId, recipientDeviceId: peer.deviceId },
      logicalMessageId: 'req-1',
      plaintext,
      openingKey,
      commitment,
    });
    // Mirrors the durable pre-send stage (runtime-session.ts:164-167). The "crash"
    // happens right here: no bytes left the process, and neither `deleteSession` nor
    // `confirmSend` (the catch block's two branches) ever runs.
    await first.stageSend(sessionId, transition.state);
    first.close();

    const second = await createRatchetSessionVault({ account });
    const reopened = await second.getSession(sessionId);

    expect(reopened).toBeDefined();
    // The vault silently adopted the post-send state as live — one message ahead of
    // what the peer (who never received `transition.output`) could possibly know
    // about. A subsequent real send would use this advanced chain and address the
    // peer as an existing session (no setup prefix), which the peer cannot open: see
    // `processEnvelope`'s `storedState === undefined` branch returning
    // `undisplayable` for a non-initial header with no local session. The message
    // would be silently lost rather than the conversation being wedged loudly.
    expect(reopened?.sentCount).toBe(1);
    second.close();
  });
});

// ---------------------------------------------------------------------------
// pollMailbox — responder establishment, replay, franking failure
// ---------------------------------------------------------------------------

describe('E2eeSessionRuntime.pollMailbox', () => {
  it('establishes the responder side of a session from an inbound initial envelope', async () => {
    const self = buildIdentity('erin', 'dev-e');
    const peer = buildIdentity('frank', 'dev-f');
    const vault = await openVault();
    const envelope = sealInitialEnvelope({
      sender: peer,
      recipient: self,
      body: 'hi there',
      envelopeId: 'env-1',
    });
    const mailbox = queueMailbox([[envelope]], new Map([[peer.actorId, peer]]));
    const runtime = new E2eeSessionRuntime({
      vault,
      identity: self,
      sendTransport: deadSendTransport(),
      mailboxTransport: mailbox.transport,
      nowMs: () => NOW,
    });

    const result = await runtime.pollMailbox();

    expect(result.error).toBeUndefined();
    expect(result.rows).toEqual([
      {
        kind: 'message',
        id: 'env-1',
        senderLabel: `@${peer.actorId}`,
        body: 'hi there',
        sentByViewer: false,
      },
    ]);
    expect(mailbox.state.acked).toEqual(['env-1']);
    // The responder session is durably committed, ready for the next inbound message.
    const sessionId = sessionIdFor(CONVERSATION_ID, peer.actorId, peer.deviceId);
    expect(await vault.getSession(sessionId)).toBeDefined();
    vault.close();
  });

  it('acknowledges a redelivered envelope on the replay guard without re-processing it a second time', async () => {
    const self = buildIdentity('erin2', 'dev-e2');
    const peer = buildIdentity('frank2', 'dev-f2');
    const vault = await openVault();
    const envelope = sealInitialEnvelope({
      sender: peer,
      recipient: self,
      body: 'hi',
      envelopeId: 'env-1',
    });
    // The same envelope redelivered in one page — a lost ack followed by mailbox
    // redelivery looks exactly like this from the runtime's point of view.
    const mailbox = queueMailbox([[envelope, envelope]], new Map([[peer.actorId, peer]]));
    const runtime = new E2eeSessionRuntime({
      vault,
      identity: self,
      sendTransport: deadSendTransport(),
      mailboxTransport: mailbox.transport,
      nowMs: () => NOW,
    });

    const result = await runtime.pollMailbox();

    expect(result.error).toBeUndefined();
    // Rendered exactly once, never twice.
    expect(result.rows).toHaveLength(1);
    // Both deliveries are acknowledged so the mailbox actually drains.
    expect(mailbox.state.acked).toEqual(['env-1', 'env-1']);
    vault.close();
  });

  it('renders unverifiable and still acknowledges when the franking check fails, without committing any session state', async () => {
    const self = buildIdentity('erin3', 'dev-e3');
    const peer = buildIdentity('frank3', 'dev-f3');
    const vault = await openVault();
    const envelope = sealInitialEnvelope({
      sender: peer,
      recipient: self,
      body: 'hi',
      envelopeId: 'env-1',
    });
    const tampered: E2eeMailboxEnvelopeLike = {
      ...envelope,
      frankingCommitment: flipByte(envelope.frankingCommitment),
    };
    const mailbox = queueMailbox([[tampered]], new Map([[peer.actorId, peer]]));
    const runtime = new E2eeSessionRuntime({
      vault,
      identity: self,
      sendTransport: deadSendTransport(),
      mailboxTransport: mailbox.transport,
      nowMs: () => NOW,
    });

    const result = await runtime.pollMailbox();

    expect(result.error).toBeUndefined();
    expect(result.rows).toEqual([
      { kind: 'unverifiable', id: 'env-1', senderLabel: `@${peer.actorId}` },
    ]);
    expect(mailbox.state.acked).toEqual(['env-1']);
    // Never rendered, never silent (ADR 0025 §4) — and no session state was committed
    // for a handshake that never authenticated.
    const sessionId = sessionIdFor(CONVERSATION_ID, peer.actorId, peer.deviceId);
    expect(await vault.getSession(sessionId)).toBeUndefined();
    vault.close();
  });

  it('surfaces a fixed error and stops paging when a later page fetch fails, still acknowledging what was already processed', async () => {
    const self = buildIdentity('erin4', 'dev-e4');
    const peer = buildIdentity('frank4', 'dev-f4');
    const vault = await openVault();
    const envelope = sealInitialEnvelope({
      sender: peer,
      recipient: self,
      body: 'hi',
      envelopeId: 'env-1',
    });
    const acked: string[] = [];
    let calls = 0;
    const runtime = new E2eeSessionRuntime({
      vault,
      identity: self,
      sendTransport: deadSendTransport(),
      mailboxTransport: {
        listMailboxPage: () => {
          calls += 1;
          if (calls === 1) return Promise.resolve({ envelopes: [envelope], nextCursor: 'more' });
          return Promise.reject(new Error('network down'));
        },
        acknowledge: (ids) => {
          acked.push(...ids);
          return Promise.resolve(undefined);
        },
        loadPeerRoster: () => Promise.resolve(peer.ownRoster),
      },
      nowMs: () => NOW,
    });

    const result = await runtime.pollMailbox();

    expect(calls).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(acked).toEqual(['env-1']);
    // Fixed, content-free copy — never the underlying transport error.
    expect(result.error).toBe('Could not fetch new encrypted messages.');
    vault.close();
  });
});

// ---------------------------------------------------------------------------
// One-time prekey consumption (issue #153, ADR 0020 §5)
// ---------------------------------------------------------------------------

/** Wraps a vault to record the ORDER `applyUpdate` (session commit) and `putOpaqueRecord`
 * (enrollment record, including the consumed-prekey removal) calls land in, without changing
 * their behavior — every other method passes straight through. */
function withPersistenceOrderSpy(vault: RatchetSessionVault): {
  readonly vault: RatchetSessionVault;
  readonly order: string[];
} {
  const order: string[] = [];
  const spied: RatchetSessionVault = {
    open: () => vault.open(),
    listSessions: () => vault.listSessions(),
    getSession: (sessionId) => vault.getSession(sessionId),
    stageSend: (sessionId, next) => vault.stageSend(sessionId, next),
    confirmSend: (sessionId, successor) => vault.confirmSend(sessionId, successor),
    applyUpdate: (sessionId, next) => {
      order.push(`applyUpdate:${sessionId}`);
      return vault.applyUpdate(sessionId, next);
    },
    deleteSession: (sessionId) => vault.deleteSession(sessionId),
    getOpaqueRecord: (key) => vault.getOpaqueRecord(key),
    putOpaqueRecord: (key, value) => {
      order.push(`putOpaqueRecord:${key}`);
      return vault.putOpaqueRecord(key, value);
    },
    wipe: () => vault.wipe(),
    close: () => vault.close(),
  };
  return { vault: spied, order };
}

describe('E2eeSessionRuntime — one-time prekey consumption on responder establishment (issue #153)', () => {
  it('removes the consumed one-time prekey from the stored enrollment record, and rejects a second initial message that reuses it', async () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const now = () => nowMs;
    const node = createFakeE2eeNode();
    const alice = 'alice-153a';
    const bob = 'bob-153a';
    const convFirst = 'conv-153a-1';
    const convSecond = 'conv-153a-2';

    const transportA = fakeTransport({ actorId: alice, node });
    const vaultA = await createRatchetSessionVault({
      account: { origin: 'https://node.example', actorId: freshId('a-153a') },
    });
    await enrollThisDevice({ actorId: alice, transport: transportA, vault: vaultA, nowMs: now });
    const storedA = await loadStoredEnrollment(vaultA, nowMs);
    if (storedA === undefined) throw new Error('test setup: A must be enrolled');
    registerMessagingDevice(node, storedA.identity);

    const transportB = fakeTransport({ actorId: bob, node });
    const vaultB = await createRatchetSessionVault({
      account: { origin: 'https://node.example', actorId: freshId('b-153a') },
    });
    await enrollThisDevice({ actorId: bob, transport: transportB, vault: vaultB, nowMs: now });
    const storedB = await loadStoredEnrollment(vaultB, nowMs);
    if (storedB === undefined) throw new Error('test setup: B must be enrolled');
    registerMessagingDevice(node, storedB.identity);
    const claimedId = storedB.identity.oneTimePreKeys[0]?.id;
    if (claimedId === undefined) throw new Error('test setup: B must hold a one-time prekey');

    const runtimeA = new E2eeSessionRuntime({
      vault: vaultA,
      identity: storedA.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: alice,
        deviceId: storedA.identity.deviceId,
        participantActorIds: [alice, bob],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedA.identity.deviceId,
        nowMs: now,
      }),
      nowMs: now,
    });
    const runtimeB = new E2eeSessionRuntime({
      vault: vaultB,
      identity: storedB.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: bob,
        deviceId: storedB.identity.deviceId,
        participantActorIds: [alice, bob],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedB.identity.deviceId,
        nowMs: now,
      }),
      nowMs: now,
    });

    await runtimeA.send(convFirst, 'first handshake', 'req-1');
    const firstPoll = await runtimeB.pollMailbox({ conversationId: convFirst });
    expect(firstPoll.error).toBeUndefined();
    expect(firstPoll.rows).toEqual([
      expect.objectContaining({ kind: 'message', body: 'first handshake' }),
    ]);

    const afterFirst = await loadStoredEnrollment(vaultB, nowMs);
    expect(afterFirst?.identity.oneTimePreKeys.some((prekey) => prekey.id === claimedId)).toBe(
      false,
    );

    // Seals a SECOND initial envelope directly against `storedB.identity` — the pristine,
    // pre-consumption snapshot captured above — to model a claim that reused the already-spent
    // bundle (a stale relay, or two initiators racing the same claim) independently of whatever
    // the fake node's own claim bookkeeping would do. Delivered under a different conversation
    // id so it hits the `storedState === undefined` responder-establishment path, not a
    // redelivery of the first session.
    const replay = sealInitialEnvelope({
      sender: storedA.identity,
      recipient: storedB.identity,
      body: 'replays the spent prekey',
      envelopeId: 'env-153a-replay',
      conversationId: convSecond,
      nowMs,
    });
    const bDeviceId = storedB.identity.deviceId;
    node.mailboxesByDevice.set(bDeviceId, [
      ...(node.mailboxesByDevice.get(bDeviceId) ?? []),
      replay,
    ]);
    const secondPoll = await runtimeB.pollMailbox({ conversationId: convSecond });

    expect(secondPoll.rows).toEqual([]);
    expect(secondPoll.error).toBe('Envelope processing failed');
    const secondSessionId = sessionIdFor(convSecond, alice, storedA.identity.deviceId);
    expect(await vaultB.getSession(secondSessionId)).toBeUndefined();

    vaultA.close();
    vaultB.close();
  });

  it('leaves the one-time prekey inventory untouched when the initiator falls back to a handshake with no one-time prekey', async () => {
    const nowMs = Date.UTC(2026, 0, 2);
    const now = () => nowMs;
    const node = createFakeE2eeNode();
    const alice = 'alice-153b';
    const bob = 'bob-153b';
    const conv = 'conv-153b';

    const transportA = fakeTransport({ actorId: alice, node });
    const vaultA = await createRatchetSessionVault({
      account: { origin: 'https://node.example', actorId: freshId('a-153b') },
    });
    await enrollThisDevice({ actorId: alice, transport: transportA, vault: vaultA, nowMs: now });
    const storedA = await loadStoredEnrollment(vaultA, nowMs);
    if (storedA === undefined) throw new Error('test setup: A must be enrolled');
    registerMessagingDevice(node, storedA.identity);

    const transportB = fakeTransport({ actorId: bob, node });
    const vaultB = await createRatchetSessionVault({
      account: { origin: 'https://node.example', actorId: freshId('b-153b') },
    });
    await enrollThisDevice({ actorId: bob, transport: transportB, vault: vaultB, nowMs: now });
    const storedB = await loadStoredEnrollment(vaultB, nowMs);
    if (storedB === undefined) throw new Error('test setup: B must be enrolled');
    // Registers a snapshot with B's one-time prekeys stripped out — models a node that had
    // none left to hand an initiator. B's OWN vault still holds its full, untouched batch,
    // which is exactly what this test checks stays that way.
    registerMessagingDevice(node, { ...storedB.identity, oneTimePreKeys: [] });
    const beforeIds = storedB.identity.oneTimePreKeys.map((prekey) => prekey.id).sort();
    expect(beforeIds.length).toBeGreaterThan(0);

    const runtimeA = new E2eeSessionRuntime({
      vault: vaultA,
      identity: storedA.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: alice,
        deviceId: storedA.identity.deviceId,
        participantActorIds: [alice, bob],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedA.identity.deviceId,
        nowMs: now,
      }),
      nowMs: now,
    });
    const runtimeB = new E2eeSessionRuntime({
      vault: vaultB,
      identity: storedB.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: bob,
        deviceId: storedB.identity.deviceId,
        participantActorIds: [alice, bob],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedB.identity.deviceId,
        nowMs: now,
      }),
      nowMs: now,
    });

    await runtimeA.send(conv, 'no prekey available', 'req-1');
    const polled = await runtimeB.pollMailbox({ conversationId: conv });

    expect(polled.error).toBeUndefined();
    expect(polled.rows).toEqual([
      expect.objectContaining({ kind: 'message', body: 'no prekey available' }),
    ]);

    const afterPoll = await loadStoredEnrollment(vaultB, nowMs);
    const afterIds = (afterPoll?.identity.oneTimePreKeys ?? []).map((prekey) => prekey.id).sort();
    expect(afterIds).toEqual(beforeIds);

    vaultA.close();
    vaultB.close();
  });

  it('persists the responder session BEFORE removing the consumed prekey from the enrollment record', async () => {
    const nowMs = Date.UTC(2026, 0, 3);
    const now = () => nowMs;
    const node = createFakeE2eeNode();
    const alice = 'alice-153c';
    const bob = 'bob-153c';
    const conv = 'conv-153c';

    const transportA = fakeTransport({ actorId: alice, node });
    const vaultA = await createRatchetSessionVault({
      account: { origin: 'https://node.example', actorId: freshId('a-153c') },
    });
    await enrollThisDevice({ actorId: alice, transport: transportA, vault: vaultA, nowMs: now });
    const storedA = await loadStoredEnrollment(vaultA, nowMs);
    if (storedA === undefined) throw new Error('test setup: A must be enrolled');
    registerMessagingDevice(node, storedA.identity);

    const transportB = fakeTransport({ actorId: bob, node });
    const vaultB = await createRatchetSessionVault({
      account: { origin: 'https://node.example', actorId: freshId('b-153c') },
    });
    await enrollThisDevice({ actorId: bob, transport: transportB, vault: vaultB, nowMs: now });
    const storedB = await loadStoredEnrollment(vaultB, nowMs);
    if (storedB === undefined) throw new Error('test setup: B must be enrolled');
    registerMessagingDevice(node, storedB.identity);

    const { vault: spiedVaultB, order } = withPersistenceOrderSpy(vaultB);
    const runtimeA = new E2eeSessionRuntime({
      vault: vaultA,
      identity: storedA.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: alice,
        deviceId: storedA.identity.deviceId,
        participantActorIds: [alice, bob],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedA.identity.deviceId,
        nowMs: now,
      }),
      nowMs: now,
    });
    const runtimeB = new E2eeSessionRuntime({
      vault: spiedVaultB,
      identity: storedB.identity,
      sendTransport: fakeMessagingSendTransport({
        node,
        actorId: bob,
        deviceId: storedB.identity.deviceId,
        participantActorIds: [alice, bob],
        nowMs: now,
      }),
      mailboxTransport: fakeMessagingMailboxTransport({
        node,
        deviceId: storedB.identity.deviceId,
        nowMs: now,
      }),
      nowMs: now,
    });

    await runtimeA.send(conv, 'order check', 'req-1');
    const polled = await runtimeB.pollMailbox({ conversationId: conv });
    expect(polled.error).toBeUndefined();

    const sessionId = sessionIdFor(conv, alice, storedA.identity.deviceId);
    const applyIndex = order.indexOf(`applyUpdate:${sessionId}`);
    const enrollmentIndex = order.indexOf(`putOpaqueRecord:${ENROLLMENT_RECORD_KEY}`);
    expect(applyIndex).toBeGreaterThanOrEqual(0);
    expect(enrollmentIndex).toBeGreaterThan(applyIndex);

    vaultA.close();
    vaultB.close();
  });
});
