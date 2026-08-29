/**
 * B-093 control-envelope transport tests. A control envelope (typing edge, read receipt,
 * edit, or delete) is composed via `@patches/domain`'s canonical codec and `sendControl`d
 * over the exact sealed fanout as a chat body; a peer drain decodes it and surfaces it on
 * the `controls` channel — never as a persisted `row` message (so `inboundMessagesToRecords`
 * can't record an edit/tombstone as a body it doesn't carry).
 *
 * Built over the same `test-support.js` fake node + real `enrollThisDevice`/
 * `E2eeSessionRuntime` public API the other runtime tests use, so sending and receiving a
 * control here runs the real X3DH/Double Ratchet code end to end (ADR 0020 §7).
 */
import { describe, expect, it } from 'vitest';

import { decodeControlEnvelope } from '@patches/domain';

import { enrollThisDevice, loadStoredEnrollment } from './enrollment.js';
import { E2eeSessionRuntime } from './runtime-session.js';
import { TypedRatchetVault } from './ratchet-vault.js';
import { MemoryVaultStore } from './vault-store.js';
import {
  createFakeE2eeNode,
  fakeMessagingMailboxTransport,
  fakeMessagingSendTransport,
  fakeTransport,
  registerMessagingDevice,
} from './test-support.js';

const ACTOR_A = 'actor-a';
const ACTOR_B = 'actor-b';
const CONV = 'conv-a-b';

async function openVault(): Promise<TypedRatchetVault> {
  const store = new MemoryVaultStore();
  await store.open();
  return new TypedRatchetVault(store);
}

interface TestRuntimes {
  readonly a: E2eeSessionRuntime;
  readonly b: E2eeSessionRuntime;
}

/** Enrolls independent devices for actors A and B, registers both with the fake node, and
 * returns an A-runtime and a B-runtime wired to the same conversation fanout. */
async function setUpTwoRuntimes(): Promise<TestRuntimes> {
  const nowMs = Date.UTC(2026, 0, 1);
  const now = () => nowMs;
  const node = createFakeE2eeNode();

  const transportA = fakeTransport({ actorId: ACTOR_A, node });
  const vaultA = await openVault();
  await enrollThisDevice({ actorId: ACTOR_A, transport: transportA, vault: vaultA, nowMs: now });
  const storedA = await loadStoredEnrollment(vaultA, now());
  if (storedA === undefined) throw new Error('A must have a stored enrollment');
  registerMessagingDevice(node, storedA.identity);

  const transportB = fakeTransport({ actorId: ACTOR_B, node });
  const vaultB = await openVault();
  await enrollThisDevice({ actorId: ACTOR_B, transport: transportB, vault: vaultB, nowMs: now });
  const storedB = await loadStoredEnrollment(vaultB, now());
  if (storedB === undefined) throw new Error('B must have a stored enrollment');
  registerMessagingDevice(node, storedB.identity);

  const runtimeA = new E2eeSessionRuntime({
    vault: vaultA,
    identity: storedA.identity,
    sendTransport: fakeMessagingSendTransport({
      node,
      actorId: ACTOR_A,
      deviceId: storedA.identity.deviceId,
      participantActorIds: [ACTOR_A, ACTOR_B],
      nowMs: now,
    }),
    mailboxTransport: fakeMessagingMailboxTransport({
      node,
      deviceId: storedA.identity.deviceId,
      nowMs: now,
    }),
    transport: transportA,
    refreshIntervalMs: 0,
    nowMs: now,
  });
  const runtimeB = new E2eeSessionRuntime({
    vault: vaultB,
    identity: storedB.identity,
    sendTransport: fakeMessagingSendTransport({
      node,
      actorId: ACTOR_B,
      deviceId: storedB.identity.deviceId,
      participantActorIds: [ACTOR_A, ACTOR_B],
      nowMs: now,
    }),
    mailboxTransport: fakeMessagingMailboxTransport({
      node,
      deviceId: storedB.identity.deviceId,
      nowMs: now,
    }),
    transport: transportB,
    refreshIntervalMs: 0,
    nowMs: now,
  });

  return { a: runtimeA, b: runtimeB };
}

describe('B-093 control-envelope transport (#201)', () => {
  it('surfaces a TYPING_START control on the peer drain (not as a row), and pairs with its TYPING_STOP', async () => {
    const { a, b } = await setUpTwoRuntimes();

    await b.sendControl(CONV, { type: 'TYPING_START', createdAtMs: 1000 }, 'logical-typing-1');
    const pollA = await a.pollMailbox({ conversationId: CONV });

    expect(pollA.error).toBeUndefined();
    // A typing edge is ephemeral set membership, never a message:
    expect(pollA.rows).toEqual([]);
    expect(pollA.controls).toHaveLength(1);
    const typing = pollA.controls?.[0];
    expect(typing).toBeDefined();
    expect(typing?.conversationId).toBe(CONV);
    expect(typing?.senderActorId).toBe(ACTOR_B);
    expect(typeof typing?.senderDeviceId).toBe('string');
    expect(typeof typing?.envelopeId).toBe('string');
    expect(typing?.type).toBe('TYPING_START');
    expect(typing?.createdAtMs).toBe(1000);
    // Recovering the control from its own bytes yields the original event.
    expect(decodeControlEnvelope(typing!.envelopeBytes)).toEqual({
      type: 'TYPING_START',
      createdAtMs: 1000,
    });

    await b.sendControl(CONV, { type: 'TYPING_STOP', createdAtMs: 1500 }, 'logical-typing-2');
    const pollA2 = await a.pollMailbox({ conversationId: CONV });
    expect(pollA2.controls).toHaveLength(1);
    expect(pollA2.controls?.[0]).toMatchObject({
      type: 'TYPING_STOP',
      createdAtMs: 1500,
      senderActorId: ACTOR_B,
    });
    expect(pollA2.rows).toEqual([]);
  });

  it('delivers a READ_RECEIPT control carrying the acked logical ids, invisible as rows', async () => {
    const { a, b } = await setUpTwoRuntimes();

    await b.sendControl(
      CONV,
      { type: 'READ_RECEIPT', createdAtMs: 2000, messageIds: ['m-1', 'm-2'] },
      'logical-rr-1',
    );
    const pollA = await a.pollMailbox({ conversationId: CONV });

    expect(pollA.error).toBeUndefined();
    expect(pollA.rows).toEqual([]);
    expect(pollA.controls).toHaveLength(1);
    const receipt = pollA.controls?.[0];
    expect(receipt).toMatchObject({
      type: 'READ_RECEIPT',
      createdAtMs: 2000,
      messageIds: ['m-1', 'm-2'],
      senderActorId: ACTOR_B,
    });
    expect(decodeControlEnvelope(receipt!.envelopeBytes)).toEqual({
      type: 'READ_RECEIPT',
      createdAtMs: 2000,
      messageIds: ['m-1', 'm-2'],
    });
  });

  it('delivers EDIT and DELETE controls referencing their logical message, not as rows', async () => {
    const { a, b } = await setUpTwoRuntimes();

    await b.sendControl(
      CONV,
      { type: 'EDIT', createdAtMs: 3000, logicalMessageId: 'm-7', newPlaintext: 'revised' },
      'logical-edit-1',
    );
    await b.sendControl(
      CONV,
      { type: 'DELETE', createdAtMs: 3100, logicalMessageId: 'm-7' },
      'logical-edit-1',
    );

    const pollA = await a.pollMailbox({ conversationId: CONV });
    expect(pollA.error).toBeUndefined();
    // A control never surfaces as a renderable row, even when it is the only inbound payload.
    expect(pollA.rows).toEqual([]);
    expect(pollA.controls).toHaveLength(2);

    const edit = pollA.controls?.[0];
    expect(edit).toMatchObject({ type: 'EDIT', logicalMessageId: 'm-7', createdAtMs: 3000 });
    expect(decodeControlEnvelope(edit!.envelopeBytes)).toEqual({
      type: 'EDIT',
      createdAtMs: 3000,
      logicalMessageId: 'm-7',
      newPlaintext: 'revised',
    });

    const del = pollA.controls?.[1];
    expect(del).toMatchObject({ type: 'DELETE', logicalMessageId: 'm-7', createdAtMs: 3100 });
    expect(decodeControlEnvelope(del!.envelopeBytes)).toEqual({
      type: 'DELETE',
      createdAtMs: 3100,
      logicalMessageId: 'm-7',
    });
  });

  it('keeps a control and a sibling chat message distinct: the chat lands in rows, the control in controls', async () => {
    const { a, b } = await setUpTwoRuntimes();

    // A plain body supplies a session, then a control follows on the same fanout.
    await b.send(CONV, 'hello A', 'req-b-1');
    await b.sendControl(CONV, { type: 'TYPING_START', createdAtMs: 4000 }, 'logical-typing-3');

    const pollA = await a.pollMailbox({ conversationId: CONV });
    expect(pollA.error).toBeUndefined();
    expect(pollA.rows).toEqual([
      expect.objectContaining({ kind: 'message', body: 'hello A', senderLabel: `@${ACTOR_B}` }),
    ]);
    expect(pollA.controls).toHaveLength(1);
    expect(pollA.controls?.[0]).toMatchObject({
      type: 'TYPING_START',
      createdAtMs: 4000,
      senderActorId: ACTOR_B,
    });
  });
});
