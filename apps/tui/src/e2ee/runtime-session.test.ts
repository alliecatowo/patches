/**
 * `E2eeSessionRuntime` one-time prekey consumption tests (issue #153, ADR 0020 §5): a
 * responder handshake must spend the one-time private key it names — both from the
 * in-memory identity (so this runtime never offers it again) and from the vault-persisted
 * enrollment record (so it stays spent across restarts). Everything else this class does
 * (send crash-window recovery, replay/franking handling) is already covered by
 * `two-device-interop.test.ts`; this file is scoped to the prekey-consumption defect only.
 *
 * Built over the same `test-support.js` fake node + real `enrollThisDevice`/
 * `E2eeSessionRuntime` public API `two-device-interop.test.ts` uses, so every handshake here
 * runs the real X3DH/Double Ratchet code, not a stand-in.
 */
import { commitFranking, createFrankingOpeningKey, sealDeviceEnvelope } from '@patches/crypto';
import { generateKeyAgreementKeyPair } from '@patches/crypto';
import { E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { ENROLLMENT_RECORD_KEY, enrollThisDevice, loadStoredEnrollment } from './enrollment.js';
import { selfPrekeyBundle, type LocalDeviceIdentity } from './local-identity.js';
import { E2eeSessionRuntime } from './runtime-session.js';
import {
  encodeChatPlaintext,
  E2EE_RECEIVE_UNAVAILABLE_COPY,
  sessionIdFor,
  type E2eeMailboxEnvelopeLike,
  type E2eeMailboxTransport,
} from './runtime.js';
import { TypedRatchetVault, type RatchetSessionVault } from './ratchet-vault.js';
import { establishInitiatorSession, withInitialFraming } from './session-setup.js';
import {
  createFakeE2eeNode,
  fakeMessagingMailboxTransport,
  fakeMessagingSendTransport,
  fakeTransport,
  registerMessagingDevice,
  testLocalIdentity,
} from './test-support.js';
import { MemoryVaultStore } from './vault-store.js';

/** Seals a real initial (X3DH-carrying) envelope from `sender` to `recipient`, binding one
 * fixed `oneTimePreKeys[0]` bundle from `recipient` regardless of what the fake node's own
 * claim bookkeeping currently offers — used to reconstruct a "reused claim" independent of the
 * node's own consumption tracking. */
function sealInitialEnvelope(params: {
  readonly sender: LocalDeviceIdentity;
  readonly recipient: LocalDeviceIdentity;
  readonly body: string;
  readonly envelopeId: string;
  readonly conversationId: string;
  readonly nowMs: number;
  /** Binds a distinct one-time prekey from `recipient` (defaults to `oneTimePreKeys[0]`),
   * so a test can seal multiple initial envelopes against the same recipient, each naming a
   * different unconsumed prekey (naming the same twice models a reused claim and is rejected
   * as malformed before any ratchet step). */
  readonly recipientPrekeyId?: number | undefined;
}): E2eeMailboxEnvelopeLike {
  const recipientOneTime =
    params.recipientPrekeyId === undefined
      ? params.recipient.oneTimePreKeys[0]
      : params.recipient.oneTimePreKeys.find((prekey) => prekey.id === params.recipientPrekeyId);
  const established = establishInitiatorSession({
    identity: params.sender,
    peerBundle: selfPrekeyBundle(
      params.recipient,
      recipientOneTime === undefined
        ? undefined
        : { id: recipientOneTime.id, publicKey: recipientOneTime.keyPair.publicKey },
      params.nowMs,
    ),
    peerRoster: params.recipient.ownRoster,
    nowMs: params.nowMs,
  });
  const plaintext = encodeChatPlaintext(params.body);
  const openingKey = createFrankingOpeningKey();
  const context = {
    frankingProfile: E2EE_FRANKING_PROFILE_V1,
    conversationId: params.conversationId,
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
    conversationId: params.conversationId,
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

/** A page-bound mailbox that reflects acknowledgements by removing acked envelopes, so a
 * subsequent poll redelivers exactly what was left unacknowledged — models the real node's
 * mailbox cursor + ack semantics at a small fixed page size. Tracked state proves how far
 * paging got (`pageFetches`) and exactly which envelopes were acknowledged. */
function pagedMailbox(params: {
  readonly senderByActor: ReadonlyMap<string, LocalDeviceIdentity>;
  readonly envelopes: readonly E2eeMailboxEnvelopeLike[];
  readonly pageSize?: number;
}): {
  readonly transport: E2eeMailboxTransport;
  readonly state: { acked: string[]; ackCalls: number; pageFetches: number };
  readonly box: E2eeMailboxEnvelopeLike[];
} {
  const pageSize = params.pageSize ?? 2;
  const box = [...params.envelopes];
  const state = { acked: [] as string[], ackCalls: 0, pageFetches: 0 };
  return {
    transport: {
      listMailboxPage: (cursor) => {
        state.pageFetches += 1;
        const start = cursor === '' ? 0 : Number(cursor);
        const page = box.slice(start, start + pageSize);
        const next = start + page.length;
        return Promise.resolve({
          envelopes: page,
          nextCursor: next < box.length ? String(next) : '',
        });
      },
      acknowledge: (ids) => {
        state.ackCalls += 1;
        state.acked.push(...ids);
        const doomed = new Set(ids);
        for (let index = box.length - 1; index >= 0; index -= 1) {
          const envelope = box[index];
          if (envelope !== undefined && doomed.has(envelope.envelopeId)) box.splice(index, 1);
        }
        return Promise.resolve(undefined);
      },
      loadPeerRoster: (actorId) => {
        const identity = params.senderByActor.get(actorId);
        if (identity === undefined) {
          return Promise.reject(new Error(`test mailbox: no roster for ${actorId}`));
        }
        return Promise.resolve(identity.ownRoster);
      },
    },
    state,
    box,
  };
}

async function openVault(): Promise<TypedRatchetVault> {
  const store = new MemoryVaultStore();
  await store.open();
  return new TypedRatchetVault(store);
}

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
    const vaultA = await openVault();
    await enrollThisDevice({ actorId: alice, transport: transportA, vault: vaultA, nowMs: now });
    const storedA = await loadStoredEnrollment(vaultA, nowMs);
    if (storedA === undefined) throw new Error('test setup: A must be enrolled');
    registerMessagingDevice(node, storedA.identity);

    const transportB = fakeTransport({ actorId: bob, node });
    const vaultB = await openVault();
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
    // the fake node's own claim bookkeeping would now do. Delivered under a different
    // conversation id so it hits the `storedState === undefined` responder-establishment path,
    // not a redelivery of the first session.
    const replay = sealInitialEnvelope({
      sender: storedA.identity,
      recipient: storedB.identity,
      body: 'replays the spent prekey',
      envelopeId: 'env-153a-replay',
      conversationId: convSecond,
      nowMs,
    });
    node.mailboxesByDevice.set(storedB.identity.deviceId, [
      ...(node.mailboxesByDevice.get(storedB.identity.deviceId) ?? []),
      replay,
    ]);
    const secondPoll = await runtimeB.pollMailbox({ conversationId: convSecond });

    // Issue #260: a reused one-time prekey is a structural/contract violation caught before
    // any ratchet step (`establishResponderSession` throws `E2eeContractError`) — deterministic
    // and envelope-caused, so it is quarantined (content-free, acknowledged) rather than
    // fail-stopping the whole mailbox behind it.
    expect(secondPoll.rows).toEqual([
      { kind: 'quarantined', id: 'env-153a-replay', reason: 'malformed' },
    ]);
    expect(secondPoll.error).toBeUndefined();
    const secondSessionId = sessionIdFor(convSecond, alice, storedA.identity.deviceId);
    expect(await vaultB.getSession(secondSessionId)).toBeUndefined();
  });

  it('leaves the one-time prekey inventory untouched when the initiator falls back to a handshake with no one-time prekey', async () => {
    const nowMs = Date.UTC(2026, 0, 2);
    const now = () => nowMs;
    const node = createFakeE2eeNode();
    const alice = 'alice-153b';
    const bob = 'bob-153b';
    const conv = 'conv-153b';

    const transportA = fakeTransport({ actorId: alice, node });
    const vaultA = await openVault();
    await enrollThisDevice({ actorId: alice, transport: transportA, vault: vaultA, nowMs: now });
    const storedA = await loadStoredEnrollment(vaultA, nowMs);
    if (storedA === undefined) throw new Error('test setup: A must be enrolled');
    registerMessagingDevice(node, storedA.identity);

    const transportB = fakeTransport({ actorId: bob, node });
    const vaultB = await openVault();
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
  });

  it('persists the responder session BEFORE removing the consumed prekey from the enrollment record', async () => {
    const nowMs = Date.UTC(2026, 0, 3);
    const now = () => nowMs;
    const node = createFakeE2eeNode();
    const alice = 'alice-153c';
    const bob = 'bob-153c';
    const conv = 'conv-153c';

    const transportA = fakeTransport({ actorId: alice, node });
    const vaultA = await openVault();
    await enrollThisDevice({ actorId: alice, transport: transportA, vault: vaultA, nowMs: now });
    const storedA = await loadStoredEnrollment(vaultA, nowMs);
    if (storedA === undefined) throw new Error('test setup: A must be enrolled');
    registerMessagingDevice(node, storedA.identity);

    const transportB = fakeTransport({ actorId: bob, node });
    const vaultB = await openVault();
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
  });
});

describe('E2eeSessionRuntime.pollMailbox — B-193: a local receive/vault fault stops paging before a later page', () => {
  it('commits and acknowledges the earlier envelope, fail-stops unacknowledged on the local vault fault, never fetches the later page, and redelivers the rest on the next poll', async () => {
    const nowMs = Date.UTC(2026, 0, 5);
    const now = () => nowMs;
    const selfBase = testLocalIdentity('self-b193', 'dev-self-b193').local;
    const alice = testLocalIdentity('alice-b193', 'dev-a-b193').local;
    const carol = testLocalIdentity('carol-b193', 'dev-c-b193').local;
    const dave = testLocalIdentity('dave-b193', 'dev-d-b193').local;
    // `testLocalIdentity` leaves the recipient with a single one-time prekey; each envelope
    // here must bind a DISTINCT one (naming the same prekey twice models a reused claim and is
    // rejected as malformed before any ratchet step), so widen the recipient's key set.
    const self: LocalDeviceIdentity = {
      ...selfBase,
      oneTimePreKeys: [
        { id: 1, keyPair: generateKeyAgreementKeyPair() },
        { id: 2, keyPair: generateKeyAgreementKeyPair() },
        { id: 3, keyPair: generateKeyAgreementKeyPair() },
      ],
    };

    const good = sealInitialEnvelope({
      sender: alice,
      recipient: self,
      body: 'good',
      envelopeId: 'env-good',
      conversationId: 'conv-b193',
      nowMs,
      recipientPrekeyId: 1,
    });
    const failing = sealInitialEnvelope({
      sender: carol,
      recipient: self,
      body: 'failing',
      envelopeId: 'env-failing',
      conversationId: 'conv-b193',
      nowMs,
      recipientPrekeyId: 2,
    });
    const later = sealInitialEnvelope({
      sender: dave,
      recipient: self,
      body: 'later',
      envelopeId: 'env-later',
      conversationId: 'conv-b193',
      nowMs,
      recipientPrekeyId: 3,
    });

    const vault = await openVault();
    // `applyUpdate` commits the responder session once per envelope opened. Succeed for the
    // earlier envelope, fail on the one after it (a transient local vault fault), then succeed
    // again so a subsequent poll recovers.
    let applyUpdates = 0;
    // `TypedRatchetVault` carries its methods on the prototype, so a `{...vault}` spread would
    // drop every method but the overridden `applyUpdate` and send any envelope that calls
    // `getOpaqueRecord`/`getSession` straight to a "not a function" vault fault. Forward every
    // method explicitly, overriding only `applyUpdate`.
    const flakyVault: RatchetSessionVault = {
      open: () => vault.open(),
      listSessions: () => vault.listSessions(),
      getSession: (sessionId) => vault.getSession(sessionId),
      stageSend: (sessionId, next) => vault.stageSend(sessionId, next),
      confirmSend: (sessionId, successor) => vault.confirmSend(sessionId, successor),
      applyUpdate: (sessionId: string, next: Parameters<RatchetSessionVault['applyUpdate']>[1]) => {
        applyUpdates += 1;
        if (applyUpdates === 2) return Promise.reject(new Error('vault I/O exploded'));
        return vault.applyUpdate(sessionId, next);
      },
      deleteSession: (sessionId) => vault.deleteSession(sessionId),
      getOpaqueRecord: (key) => vault.getOpaqueRecord(key),
      putOpaqueRecord: (key, value) => vault.putOpaqueRecord(key, value),
      wipe: () => vault.wipe(),
      close: () => vault.close(),
    };

    const senderByActor = new Map<string, LocalDeviceIdentity>([
      [alice.actorId, alice],
      [carol.actorId, carol],
      [dave.actorId, dave],
    ]);
    // Page 1 (non-final) holds the earlier good envelope then the local-vault-faulting one;
    // page 2 holds a later envelope that a drain buggy past the fault would wrongly fetch.
    const mailbox = pagedMailbox({ senderByActor, envelopes: [good, failing, later] });
    const runtime = new E2eeSessionRuntime({
      vault: flakyVault,
      identity: self,
      sendTransport: {
        loadFanoutPlan: () => Promise.reject(new Error('send never runs in this test')),
        claimPrekeyBundles: () => Promise.reject(new Error('send never runs in this test')),
        sendEnvelopes: () => Promise.reject(new Error('send never runs in this test')),
      },
      mailboxTransport: mailbox.transport,
      nowMs: now,
    });

    const first = await runtime.pollMailbox({ conversationId: 'conv-b193' });

    // A fault local to this device fail-stops the drain; only the earlier envelope survives.
    expect(first.error).toBe(E2EE_RECEIVE_UNAVAILABLE_COPY);
    expect(first.rows).toEqual([
      {
        kind: 'message',
        id: 'env-good',
        senderLabel: `@${alice.actorId}`,
        body: 'good',
        sentByViewer: false,
      },
    ]);
    // Acknowledged exactly the earlier, durably committed envelope — never the faulting one,
    // and never the later page.
    expect(mailbox.state.acked).toEqual(['env-good']);
    // Paging stopped before the later page: page 2 was never requested.
    expect(mailbox.state.pageFetches).toBe(1);
    // The faulting and later envelopes stay queued unacknowledged.
    expect(mailbox.box.map((envelope) => envelope.envelopeId)).toEqual([
      'env-failing',
      'env-later',
    ]);

    // Once the transient vault fault clears, a subsequent poll redelivers exactly those two.
    const second = await runtime.pollMailbox({ conversationId: 'conv-b193' });
    expect(second.error).toBeUndefined();
    expect(second.rows).toEqual([
      {
        kind: 'message',
        id: 'env-failing',
        senderLabel: `@${carol.actorId}`,
        body: 'failing',
        sentByViewer: false,
      },
      {
        kind: 'message',
        id: 'env-later',
        senderLabel: `@${dave.actorId}`,
        body: 'later',
        sentByViewer: false,
      },
    ]);
    expect(mailbox.state.acked).toEqual(['env-good', 'env-failing', 'env-later']);
    expect(mailbox.box).toEqual([]);
  });
});
