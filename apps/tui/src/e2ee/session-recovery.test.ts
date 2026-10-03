/**
 * Session recovery (audit P2-H1): glare, a lost first-send response, replay of retired
 * handshakes, reordering, forged initial envelopes, and the explicit reset. Every case runs
 * two real runtimes over the shared fake node, so X3DH, the Double Ratchet and the session
 * index are the production code paths; only the transport is faked.
 */
import { describe, expect, it } from 'vitest';

import { enrollThisDevice, loadStoredEnrollment } from './enrollment.js';
import { E2eeSessionRuntime } from './runtime-session.js';
import { sessionIdFor, type E2eeMailboxEnvelopeLike, type InboxRow } from './runtime.js';
import { loadSessionIndex, MAX_SESSIONS_PER_PEER } from './session-index.js';
import {
  createFakeE2eeNode,
  fakeMessagingMailboxTransport,
  fakeMessagingSendTransport,
  fakeTransport,
  registerMessagingDevice,
  type FakeE2eeNode,
} from './test-support.js';
import { TypedRatchetVault, type RatchetSessionVault } from './ratchet-vault.js';
import { MemoryVaultStore } from './vault-store.js';

const CONV = 'conv-recovery';
const NOW = Date.UTC(2026, 0, 1);
const now = (): number => NOW;

interface Party {
  readonly actorId: string;
  readonly deviceId: string;
  readonly vault: RatchetSessionVault;
  readonly runtime: E2eeSessionRuntime;
  /** Wraps `sendEnvelopes` so a test can deliver and then fail, or fail before delivering. */
  readonly sendHook: { before?: (() => never) | undefined; after?: (() => never) | undefined };
}

async function party(node: FakeE2eeNode, actorId: string, peerActorId: string): Promise<Party> {
  const vault = new TypedRatchetVault(new MemoryVaultStore());
  await vault.open();
  const transport = fakeTransport({ actorId, node });
  await enrollThisDevice({ actorId, transport, vault, nowMs: now });
  const stored = await loadStoredEnrollment(vault, NOW);
  if (stored === undefined) throw new Error('test setup: not enrolled');
  registerMessagingDevice(node, stored.identity);
  const send = fakeMessagingSendTransport({
    node,
    actorId,
    deviceId: stored.identity.deviceId,
    participantActorIds: [actorId, peerActorId],
    nowMs: now,
  });
  const sendHook: Party['sendHook'] = {};
  const runtime = new E2eeSessionRuntime({
    vault,
    identity: stored.identity,
    sendTransport: {
      ...send,
      sendEnvelopes: async (request) => {
        sendHook.before?.();
        await send.sendEnvelopes(request);
        sendHook.after?.();
      },
    },
    mailboxTransport: fakeMessagingMailboxTransport({
      node,
      deviceId: stored.identity.deviceId,
      nowMs: now,
    }),
    nowMs: now,
  });
  return { actorId, deviceId: stored.identity.deviceId, vault, runtime, sendHook };
}

function bodies(rows: readonly InboxRow[]): string[] {
  return rows.flatMap((row) => (row.kind === 'message' ? [row.body] : []));
}

async function poll(p: Party): Promise<readonly InboxRow[]> {
  const result = await p.runtime.pollMailbox({ conversationId: CONV });
  expect(result.error).toBeUndefined();
  return result.rows;
}

function mailbox(node: FakeE2eeNode, p: Party): E2eeMailboxEnvelopeLike[] {
  return node.mailboxesByDevice.get(p.deviceId) ?? [];
}

async function fixture(): Promise<{ node: FakeE2eeNode; a: Party; b: Party }> {
  const node = createFakeE2eeNode();
  // Fixed ids make the glare tie-break (lower actor id wins) explicit in the assertions.
  const a = await party(node, 'actor-a', 'actor-b');
  const b = await party(node, 'actor-b', 'actor-a');
  return { node, a, b };
}

describe('simultaneous first messages (glare)', () => {
  it('opens both first messages and every later message in both directions', async () => {
    const { a, b } = await fixture();
    await a.runtime.send(CONV, 'a first', 'req-a1');
    await b.runtime.send(CONV, 'b first', 'req-b1');

    // Each side now holds an unconfirmed initiator session and receives the other's initial.
    expect(bodies(await poll(a))).toEqual(['b first']);
    expect(bodies(await poll(b))).toEqual(['a first']);

    await a.runtime.send(CONV, 'a second', 'req-a2');
    await b.runtime.send(CONV, 'b second', 'req-b2');
    expect(bodies(await poll(a))).toEqual(['b second']);
    expect(bodies(await poll(b))).toEqual(['a second']);

    // Settled: the winner (actor-a) kept its initiator session; the loser adopted it.
    for (let round = 0; round < 3; round += 1) {
      await a.runtime.send(CONV, `a round ${String(round)}`, `req-ar${String(round)}`);
      await b.runtime.send(CONV, `b round ${String(round)}`, `req-br${String(round)}`);
      expect(bodies(await poll(a))).toEqual([`b round ${String(round)}`]);
      expect(bodies(await poll(b))).toEqual([`a round ${String(round)}`]);
    }
  });

  it('never reports a message as unverifiable when the first messages cross', async () => {
    const { a, b } = await fixture();
    await a.runtime.send(CONV, 'x', 'req-1');
    await b.runtime.send(CONV, 'y', 'req-2');
    const rowsA = await poll(a);
    const rowsB = await poll(b);
    expect([...rowsA, ...rowsB].some((row) => row.kind === 'unverifiable')).toBe(false);
  });

  it('settles on one sending session per side, the lower actor keeping its own', async () => {
    const { a, b } = await fixture();
    await a.runtime.send(CONV, 'x', 'req-1');
    await b.runtime.send(CONV, 'y', 'req-2');
    await poll(a);
    await poll(b);
    await a.runtime.send(CONV, 'x2', 'req-3');
    await poll(b);
    await b.runtime.send(CONV, 'y2', 'req-4');
    await poll(a);

    const peerOfA = (await loadSessionIndex(a.vault)).get(
      sessionIdFor(CONV, 'actor-b', b.deviceId),
    );
    const peerOfB = (await loadSessionIndex(b.vault)).get(
      sessionIdFor(CONV, 'actor-a', a.deviceId),
    );
    const primaryA = peerOfA?.entries.find((entry) => entry.key === peerOfA.primaryKey);
    const primaryB = peerOfB?.entries.find((entry) => entry.key === peerOfB.primaryKey);
    // actor-a < actor-b in UTF-8 byte order: a's initiator handshake is the survivor on both.
    expect(primaryA?.role).toBe('initiator');
    expect(primaryB?.role).toBe('responder');
    expect(Buffer.from(primaryB?.handshakeId ?? []).toString('hex')).toBe(
      Buffer.from(primaryA?.handshakeId ?? []).toString('hex'),
    );
    // The answered initiator stops carrying the setup block.
    expect(primaryA?.confirmed).toBe(true);
    expect(primaryA?.setupPrefix.length).toBe(0);
  });
});

describe('lost first-send response', () => {
  it('delivers both messages and keeps both directions working after a retry', async () => {
    const { a, b } = await fixture();
    // The node stores the message, then the response is lost: the sender sees a failure.
    a.sendHook.after = () => {
      throw new Error('response lost');
    };
    await expect(a.runtime.send(CONV, 'one', 'req-1')).rejects.toThrow('response lost');
    a.sendHook.after = undefined;
    await a.runtime.send(CONV, 'two', 'req-2');

    expect(bodies(await poll(b))).toEqual(['one', 'two']);
    await b.runtime.send(CONV, 'reply', 'req-3');
    expect(bodies(await poll(a))).toEqual(['reply']);
    await a.runtime.send(CONV, 'three', 'req-4');
    expect(bodies(await poll(b))).toEqual(['three']);
  });

  it('delivers the retry when the first message never reached the node', async () => {
    const { a, b } = await fixture();
    a.sendHook.before = () => {
      throw new Error('network down');
    };
    await expect(a.runtime.send(CONV, 'one', 'req-1')).rejects.toThrow('network down');
    a.sendHook.before = undefined;
    await a.runtime.send(CONV, 'two', 'req-2');

    // The retry carries the setup block again, so b can bootstrap from it even though the
    // first message is gone.
    expect(bodies(await poll(b))).toEqual(['two']);
    await b.runtime.send(CONV, 'reply', 'req-3');
    expect(bodies(await poll(a))).toEqual(['reply']);
  });
});

describe('replay and reordering', () => {
  it('drops a replayed initial envelope without disturbing the live session', async () => {
    const { node, a, b } = await fixture();
    await a.runtime.send(CONV, 'first', 'req-1');
    const initial = mailbox(node, b).map((envelope) => ({ ...envelope }));
    expect(bodies(await poll(b))).toEqual(['first']);
    await b.runtime.send(CONV, 'reply', 'req-2');
    expect(bodies(await poll(a))).toEqual(['reply']);

    const baseId = sessionIdFor(CONV, 'actor-a', a.deviceId);
    const before = (await loadSessionIndex(b.vault)).get(baseId);

    // The node redelivers the old initial envelope (twice, to be sure).
    node.mailboxesByDevice.set(b.deviceId, [...initial, ...initial]);
    const rows = await poll(b);
    expect(rows).toEqual([]);

    const after = (await loadSessionIndex(b.vault)).get(baseId);
    expect(after?.primaryKey).toBe(before?.primaryKey);
    expect(after?.entries.length).toBe(before?.entries.length);
    await a.runtime.send(CONV, 'still works', 'req-3');
    expect(bodies(await poll(b))).toEqual(['still works']);
  });

  it('refuses to rebuild a session from an old handshake after a reset retired it', async () => {
    const { node, a, b } = await fixture();
    await a.runtime.send(CONV, 'first', 'req-1');
    const oldInitial = mailbox(node, b).map((envelope) => ({ ...envelope }));
    await poll(b);

    // Retire more handshakes than the pair keeps sessions for, so the oldest is evicted.
    for (let reset = 0; reset < MAX_SESSIONS_PER_PEER + 1; reset += 1) {
      await a.runtime.resetSessions(CONV);
      await a.runtime.send(CONV, `after reset ${String(reset)}`, `req-r${String(reset)}`);
      expect(bodies(await poll(b))).toEqual([`after reset ${String(reset)}`]);
    }
    const baseId = sessionIdFor(CONV, 'actor-a', a.deviceId);
    const before = (await loadSessionIndex(b.vault)).get(baseId);
    expect(before?.entries.length).toBeLessThanOrEqual(MAX_SESSIONS_PER_PEER);

    node.mailboxesByDevice.set(b.deviceId, oldInitial);
    expect(await poll(b)).toEqual([]);
    const after = (await loadSessionIndex(b.vault)).get(baseId);
    expect(after?.primaryKey).toBe(before?.primaryKey);
    expect(after?.entries.map((entry) => entry.key)).toEqual(
      before?.entries.map((entry) => entry.key),
    );
  });

  it('opens a setup-bearing second message that arrives before the first', async () => {
    const { node, a, b } = await fixture();
    await a.runtime.send(CONV, 'first', 'req-1');
    await a.runtime.send(CONV, 'second', 'req-2');
    const queue = mailbox(node, b);
    expect(queue).toHaveLength(2);
    node.mailboxesByDevice.set(b.deviceId, [...queue].reverse());
    expect(bodies(await poll(b)).sort()).toEqual(['first', 'second']);
  });
});

describe('forged and mismatched initial envelopes', () => {
  it('leaves a live session untouched when a new-handshake initial fails authentication', async () => {
    const { node, a, b } = await fixture();
    await a.runtime.send(CONV, 'first', 'req-1');
    await poll(b);
    await b.runtime.send(CONV, 'reply', 'req-2');
    await poll(a);

    const baseId = sessionIdFor(CONV, 'actor-a', a.deviceId);
    const before = (await loadSessionIndex(b.vault)).get(baseId);

    // A genuine new handshake from a, with the ciphertext tampered in flight.
    await a.runtime.resetSessions(CONV);
    await a.runtime.send(CONV, 'fresh', 'req-3');
    const tampered = mailbox(node, b).map((envelope) => {
      const ciphertext = envelope.ciphertext.slice();
      ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
      return { ...envelope, ciphertext };
    });
    node.mailboxesByDevice.set(b.deviceId, tampered);
    const rows = await poll(b);
    expect(rows.map((row) => row.kind)).toEqual(['unverifiable']);

    const after = (await loadSessionIndex(b.vault)).get(baseId);
    expect(after?.primaryKey).toBe(before?.primaryKey);
    expect(after?.entries.length).toBe(before?.entries.length);
  });
});

describe('reset secure session', () => {
  it('recovers a pair whose sessions are unusable, in both directions, without losing history', async () => {
    const { a, b } = await fixture();
    await a.runtime.send(CONV, 'before', 'req-1');
    expect(bodies(await poll(b))).toEqual(['before']);
    await b.runtime.send(CONV, 'before reply', 'req-2');
    expect(bodies(await poll(a))).toEqual(['before reply']);

    // b loses its side of the session (a wiped vault entry, a restored backup, ...).
    const removed = await b.runtime.resetSessions(CONV);
    expect(removed).toBeGreaterThan(0);

    // a keeps sending in the old session: b cannot open it, but recovers once b speaks first.
    await b.runtime.send(CONV, 'b restarts', 'req-3');
    expect(bodies(await poll(a))).toEqual(['b restarts']);
    await a.runtime.send(CONV, 'a answers', 'req-4');
    expect(bodies(await poll(b))).toEqual(['a answers']);
  });

  it('is scoped to the conversation', async () => {
    const { a, b } = await fixture();
    await a.runtime.send(CONV, 'x', 'req-1');
    await a.runtime.send('other-conversation', 'y', 'req-2');
    await poll(b);
    const removed = await a.runtime.resetSessions(CONV);
    expect(removed).toBe(1);
    const index = await loadSessionIndex(a.vault);
    expect(
      index.get(sessionIdFor('other-conversation', 'actor-b', b.deviceId))?.entries.length,
    ).toBe(1);
  });
});
