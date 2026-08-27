import { describe, expect, it, vi } from 'vitest';

import { commitFranking, createFrankingOpeningKey, sealDeviceEnvelope } from '@patches/crypto';
import type { DoubleRatchetState, VerifiedPreKeyBundle } from '@patches/crypto';
import { E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';

import { encodeChatPlaintext, encodeHistoryPlaintext, sessionIdFor } from '../src/e2ee/runtime.js';
import type {
  ClaimedPeerBundle,
  E2eeMailboxEnvelopeLike,
  E2eeMailboxTransport,
  E2eeSendTransport,
  FanoutPlan,
} from '../src/e2ee/runtime.js';
import { E2eeSessionRuntime } from '../src/e2ee/runtime-session.js';
import { TypedRatchetVault } from '../src/e2ee/ratchet-vault.js';
import { MemoryVaultStore } from '../src/e2ee/vault-store.js';
import { buildHistoryTransfer } from '../src/e2ee/history-transfer.js';
import type { LocalDeviceIdentity } from '../src/e2ee/local-identity.js';
import { testLocalIdentity } from '../src/e2ee/test-support.js';

// ---------------------------------------------------------------------------
// Both sides are built from `@patches/crypto` primitives via the shared test helper, so
// X3DH transcripts round-trip byte-for-byte between two runtimes.
// ---------------------------------------------------------------------------

interface TestIdentity {
  readonly local: LocalDeviceIdentity;
  readonly bundle: VerifiedPreKeyBundle;
}

function testIdentity(actorId: string, deviceId: string): TestIdentity {
  return testLocalIdentity(actorId, deviceId);
}

const ALICE_IDENTITY = testIdentity('actor-alice', 'device-alice');
const BOB_IDENTITY = testIdentity('actor-bob', 'device-bob');
const CONV = 'conv-1';
const PLAN: FanoutPlan = {
  conversationId: CONV,
  membershipEpoch: 3n,
  targets: [
    { actorId: 'actor-alice', deviceId: 'device-alice' },
    { actorId: 'actor-bob', deviceId: 'device-bob' },
  ],
};

// ---------------------------------------------------------------------------
// A minimal in-memory "node": exact fanout delivery, per-device mailbox, acks. It
// mirrors the one server behavior the envelope associated data depends on — the
// delivered logical message id equals what the sender bound (see the report finding on
// node-assigned logical ids).
// ---------------------------------------------------------------------------

class FakeNode {
  readonly mailboxes = new Map<string, E2eeMailboxEnvelopeLike[]>();
  readonly acknowledgedIds: string[] = [];
  sendEnvelopesCalls = 0;
  /** Next `sendEnvelopes` rejects once (transport-failure recovery test). */
  failNextSend = false;
  /** Re-file every subsequent envelope under a different logical id (AD-binding test). */
  refileLogicalIds = false;

  private readonly identities = new Map<string, TestIdentity>([
    ['actor-alice', ALICE_IDENTITY],
    ['actor-bob', BOB_IDENTITY],
  ]);

  private mailbox(deviceId: string): E2eeMailboxEnvelopeLike[] {
    let box = this.mailboxes.get(deviceId);
    if (box === undefined) {
      box = [];
      this.mailboxes.set(deviceId, box);
    }
    return box;
  }

  /** Delivers a hand-crafted envelope straight into a device's mailbox. */
  deliver(deviceId: string, envelope: E2eeMailboxEnvelopeLike): void {
    this.mailbox(deviceId).push(envelope);
  }

  sendTransport(sender: TestIdentity): E2eeSendTransport {
    return {
      loadFanoutPlan: () => Promise.resolve(PLAN),
      claimPrekeyBundles: ({ actorIds }) => {
        const out: ClaimedPeerBundle[] = [];
        for (const actorId of actorIds) {
          const peer = this.identities.get(actorId);
          if (peer === undefined) continue;
          out.push({
            actorId,
            deviceId: peer.local.deviceId,
            bundle: peer.bundle,
            roster: peer.local.ownRoster,
          });
        }
        return Promise.resolve(out);
      },
      sendEnvelopes: (request) => {
        this.sendEnvelopesCalls += 1;
        if (this.failNextSend) {
          this.failNextSend = false;
          return Promise.reject(new Error('transport down'));
        }
        const logicalId = this.refileLogicalIds ? 'rewritten-by-node' : request.clientRequestId;
        for (const envelope of request.message.deviceEnvelopes) {
          const box = this.mailbox(envelope.recipientDeviceId);
          box.push({
            envelopeId: `env-${sender.local.actorId}-${box.length}`,
            logicalMessageId: logicalId,
            conversationId: request.conversationId,
            membershipEpoch: request.message.membershipEpoch,
            senderActorId: sender.local.actorId,
            senderDeviceId: sender.local.deviceId,
            recipientDeviceId: envelope.recipientDeviceId,
            encryptedHeader: envelope.encryptedHeader,
            ciphertext: envelope.ciphertext,
            frankingCommitment: request.message.frankingCommitment,
            frankingTag: { profile: request.message.frankingProfile },
          });
        }
        return Promise.resolve({ logicalMessageId: logicalId });
      },
    };
  }

  mailboxTransport(deviceId: string): E2eeMailboxTransport {
    return {
      listMailboxPage: (cursor: string) => {
        const box = this.mailbox(deviceId);
        const start = cursor === '' ? 0 : Number(cursor);
        const page = box.slice(start, start + 50);
        const next = start + page.length;
        return Promise.resolve({
          envelopes: page,
          nextCursor: next < box.length ? String(next) : '',
        });
      },
      acknowledge: (ids: readonly string[]) => {
        this.acknowledgedIds.push(...ids);
        const remaining = this.mailbox(deviceId).filter(
          (envelope) => !ids.includes(envelope.envelopeId),
        );
        this.mailboxes.set(deviceId, remaining);
        return Promise.resolve();
      },
      loadPeerRoster: (actorId: string) => {
        const peer = this.identities.get(actorId);
        if (peer === undefined) throw new Error('unknown peer');
        return Promise.resolve(peer.local.ownRoster);
      },
    };
  }
}

interface Party {
  readonly runtime: E2eeSessionRuntime;
  readonly vault: TypedRatchetVault;
}

async function makeParty(
  identity: TestIdentity,
  node: FakeNode,
  nowMs?: () => number,
): Promise<Party> {
  const store = new MemoryVaultStore();
  await store.open();
  const vault = new TypedRatchetVault(store);
  const runtime = new E2eeSessionRuntime({
    vault,
    identity: identity.local,
    sendTransport: node.sendTransport(identity),
    mailboxTransport: node.mailboxTransport(identity.local.deviceId),
    ...(nowMs === undefined ? {} : { nowMs }),
  });
  return { runtime, vault };
}

function makeWorld(): Promise<{ node: FakeNode; alice: Party; bob: Party }> {
  const node = new FakeNode();
  return Promise.all([
    Promise.resolve(node),
    makeParty(ALICE_IDENTITY, node),
    makeParty(BOB_IDENTITY, node),
  ]).then(([resolvedNode, alice, bob]) => ({ node: resolvedNode, alice, bob }));
}

describe('E2EE runtime (B-101)', () => {
  it('delivers a message end to end: X3DH bootstrap, franking verify, durable commit, ack', async () => {
    const { node, alice, bob } = await makeWorld();
    await alice.runtime.send(CONV, 'hello bob', 'client-req-1');

    expect(node.sendEnvelopesCalls).toBe(1);
    const result = await bob.runtime.pollMailbox({ conversationId: CONV });
    if (result.error !== undefined) throw new Error(result.error);
    expect(result.rows[0]?.kind).toBe('message');
    const row = result.rows[0];
    expect(row?.kind).toBe('message');
    if (row?.kind === 'message') {
      expect(row.body).toBe('hello bob');
      expect(row.sentByViewer).toBe(false);
      expect(row.senderLabel).toBe('@actor-alice');
    }
    // The mailbox drained behind validated state only, after the durable commit.
    expect(node.acknowledgedIds).toEqual(['env-actor-alice-0']);
    expect(node.mailboxes.get('device-bob') ?? []).toHaveLength(0);
    const bobSession = await bob.vault.getSession(
      sessionIdFor(CONV, 'actor-alice', 'device-alice'),
    );
    expect(bobSession).toBeDefined();
  });

  it('round-trips a reply over independent sessions in both directions', async () => {
    const { alice, bob } = await makeWorld();
    await alice.runtime.send(CONV, 'ping', 'req-a1');
    await bob.runtime.pollMailbox({ conversationId: CONV });

    await bob.runtime.send(CONV, 'pong', 'req-b1');
    const back = await alice.runtime.pollMailbox({ conversationId: CONV });
    expect(back.rows).toHaveLength(1);
    const row = back.rows[0];
    if (row?.kind === 'message') {
      expect(row.body).toBe('pong');
      expect(row.senderLabel).toBe('@actor-bob');
    }
  });

  it("renders ADR 0025 §4's placeholder and still acknowledges a tampered ciphertext", async () => {
    const { node, alice, bob } = await makeWorld();
    await alice.runtime.send(CONV, 'secret', 'req-t1');

    // Flip one bit of Bob's delivered ciphertext after acceptance.
    const box = node.mailboxes.get('device-bob') ?? [];
    const envelope = box[0];
    expect(envelope).toBeDefined();
    if (envelope === undefined) return;
    envelope.ciphertext = envelope.ciphertext.slice();
    envelope.ciphertext[10] = (envelope.ciphertext[10] ?? 0) ^ 0x40;

    const result = await bob.runtime.pollMailbox({ conversationId: CONV });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.kind).toBe('unverifiable');
    if (result.rows[0]?.kind === 'unverifiable') {
      expect(result.rows[0].senderLabel).toBe('@actor-alice');
    }
    // Acknowledged anyway, so the mailbox drains (ADR 0025 §4).
    expect(node.acknowledgedIds).toHaveLength(1);
  });

  it('refuses to decrypt when the node-delivered franking commitment is tampered with', async () => {
    const { node, alice, bob } = await makeWorld();
    await alice.runtime.send(CONV, 'franking secret', 'req-fr1');

    // The commitment is the envelope's associated data (ADR 0025 §2), so a node that
    // swaps it — the exact move the franking construction has to survive — cannot
    // produce a readable envelope. There is no code path that yields plaintext with an
    // unverified commitment: `openDeviceEnvelope` is the only source of plaintext.
    const box = node.mailboxes.get('device-bob') ?? [];
    const envelope = box[0];
    expect(envelope).toBeDefined();
    if (envelope === undefined) return;
    const authentic = envelope.frankingCommitment;
    envelope.frankingCommitment = authentic.slice();
    envelope.frankingCommitment[0] = (authentic[0] ?? 0) ^ 0x01;

    const result = await bob.runtime.pollMailbox({ conversationId: CONV });
    expect(result.rows.map((row) => row.kind)).toEqual(['unverifiable']);
    expect(JSON.stringify(result.rows)).not.toContain('franking secret');
    expect(node.acknowledgedIds).toHaveLength(1);
  });

  it('never lets plaintext or key material reach a console or stderr diagnostic', async () => {
    const captured: string[] = [];
    const record = (...parts: unknown[]): void => {
      captured.push(parts.map((part) => String(part)).join(' '));
    };
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(record),
    );
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      captured.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    });

    const body = 'zebra-quintessence-plaintext';
    try {
      const { node, alice, bob } = await makeWorld();
      await alice.runtime.send(CONV, body, 'req-log1');
      await bob.runtime.pollMailbox({ conversationId: CONV });

      // Exercise the failure paths too — they are where a naive implementation logs.
      node.failNextSend = true;
      const sendError = await alice.runtime
        .send(CONV, body, 'req-log2')
        .catch((error: unknown) =>
          error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
        );
      captured.push(String(sendError));

      const box = node.mailboxes.get('device-bob') ?? [];
      const tampered = box[0];
      if (tampered !== undefined) {
        tampered.ciphertext = tampered.ciphertext.slice();
        tampered.ciphertext[3] = (tampered.ciphertext[3] ?? 0) ^ 0x80;
      }
      const poll = await bob.runtime.pollMailbox({ conversationId: CONV });
      captured.push(JSON.stringify(poll));

      const transcript = captured.join('\n');
      expect(transcript).not.toContain(body);
      // Ratchet/root/prekey private halves, in every encoding a careless log would use.
      for (const secret of [
        ALICE_IDENTITY.local.keys.signing.privateKey,
        ALICE_IDENTITY.local.keys.agreement.privateKey,
        ALICE_IDENTITY.local.signedPreKey.keyPair.privateKey,
      ]) {
        expect(transcript).not.toContain(Buffer.from(secret).toString('hex'));
        expect(transcript).not.toContain(Buffer.from(secret).toString('base64'));
      }
      // Nothing at all should have gone to a console or stderr from this pipeline.
      for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it('uses the injected clock for session-setup validity windows', async () => {
    const node = new FakeNode();
    // Past every test certificate's expiry: setup must fail closed rather than
    // establishing a session against expired material.
    const expired = (): number => Date.now() + 30 * 24 * 60 * 60 * 1000;
    const alice = await makeParty(ALICE_IDENTITY, node, expired);
    await expect(alice.runtime.send(CONV, 'too late', 'req-clock')).rejects.toThrow();
    expect(node.mailboxes.get('device-bob') ?? []).toHaveLength(0);
  });

  it('rejects an envelope re-filed under a different logical message id', async () => {
    const { node, alice, bob } = await makeWorld();
    await alice.runtime.send(CONV, 'honest', 'req-ok');

    node.refileLogicalIds = true;
    await alice.runtime.send(CONV, 'refiled', 'req-evil');

    const result = await bob.runtime.pollMailbox({ conversationId: CONV });
    const byBody = result.rows.map((row) => (row.kind === 'message' ? row.body : row.kind));
    expect(byBody).toContain('honest');
    expect(byBody).toContain('unverifiable');
  });

  it('recovers from a transport failure without wedging staged state (audit P1-1)', async () => {
    const { node, alice, bob } = await makeWorld();
    node.failNextSend = true;
    await expect(alice.runtime.send(CONV, 'lost', 'req-f1')).rejects.toThrow('transport down');

    // Retry succeeds: the failed send's half-born session was discarded (its initial
    // envelope never reached the peer), so this send re-ran X3DH cleanly — no "staged
    // send pending" wedge and a peer-readable chain (audit P1-1).
    await alice.runtime.send(CONV, 'found', 'req-f2');
    expect(node.mailboxes.get('device-bob') ?? []).toHaveLength(1);
    const result = await bob.runtime.pollMailbox({ conversationId: CONV });
    if (result.error !== undefined) throw new Error(result.error);
    const bodies = result.rows
      .filter((row) => row.kind === 'message')
      .map((row) => (row.kind === 'message' ? row.body : ''));
    expect(bodies).toEqual(['found']);
  });

  it('parses and labels a history-transfer record as re-delivered provenance', async () => {
    const { node, alice, bob } = await makeWorld();
    await alice.runtime.send(CONV, 'live one', 'req-h0');
    await bob.runtime.pollMailbox({ conversationId: CONV });

    const transfer = buildHistoryTransfer({
      conversationId: CONV,
      fromActorId: 'actor-alice',
      fromDeviceId: 'device-alice',
      entries: [
        {
          conversationId: CONV,
          logicalMessageId: 'orig-1',
          senderActorId: 'actor-alice',
          senderDeviceId: 'device-alice',
          membershipEpoch: 1n,
          acceptedAtMs: 500,
          plaintext: new TextEncoder().encode('older message'),
        },
      ],
    });

    // Alice's sending ratchet toward Bob's device, as the live pipeline left it.
    const aliceState = await alice.vault.getSession(sessionIdFor(CONV, 'actor-bob', 'device-bob'));
    expect(aliceState).toBeDefined();
    if (aliceState === undefined) return;

    const context = {
      frankingProfile: E2EE_FRANKING_PROFILE_V1,
      conversationId: CONV,
      membershipEpoch: 3,
      senderActorId: 'actor-alice',
      senderDeviceId: 'device-alice',
    } as const;
    const openingKey = createFrankingOpeningKey();
    const plaintext = encodeHistoryPlaintext(transfer.recordBytes);
    const commitment = commitFranking(openingKey, context, plaintext);
    const sealed = sealDeviceEnvelope(aliceState, {
      context,
      recipient: { recipientActorId: 'actor-bob', recipientDeviceId: 'device-bob' },
      logicalMessageId: 'hist-1',
      plaintext,
      openingKey,
      commitment,
    });
    node.deliver('device-bob', {
      envelopeId: 'env-hist',
      logicalMessageId: 'hist-1',
      conversationId: CONV,
      membershipEpoch: 3n,
      senderActorId: 'actor-alice',
      senderDeviceId: 'device-alice',
      recipientDeviceId: 'device-bob',
      encryptedHeader: sealed.output.encryptedHeader,
      ciphertext: sealed.output.ciphertext,
      frankingCommitment: commitment,
      frankingTag: { profile: E2EE_FRANKING_PROFILE_V1 },
    });

    const result = await bob.runtime.pollMailbox({ conversationId: CONV });
    const row = result.rows.find((candidate) => candidate.kind === 'history');
    expect(row).toBeDefined();
    if (row?.kind === 'history') {
      expect(row.fromLabel).toBe('@actor-alice');
      expect(row.entries).toHaveLength(1);
      expect(row.entries[0]?.body).toBe('older message');
      expect(row.entries[0]?.senderLabel).toBe('@actor-alice');
    }
  });

  it('pads chat plaintext into fixed buckets with an authenticated true-length prefix', () => {
    const small = encodeChatPlaintext('hi');
    expect(small.length).toBe(512);
    const length = new DataView(small.buffer).getUint32(1, false);
    expect(new TextDecoder().decode(small.subarray(5, 5 + length))).toBe('hi');
  });

  it('decodes stored ratchet states through the typed vault seam', async () => {
    const { alice, bob } = await makeWorld();
    await alice.runtime.send(CONV, 'x', 'req-d1');
    await bob.runtime.pollMailbox({ conversationId: CONV });
    const encoded = await alice.vault.listSessions();
    expect(encoded).toContain(sessionIdFor(CONV, 'actor-bob', 'device-bob'));
    const state: DoubleRatchetState | undefined = await alice.vault.getSession(
      sessionIdFor(CONV, 'actor-bob', 'device-bob'),
    );
    expect(state?.protocol).toBe('patches-e2ee-v1');
  });
});
