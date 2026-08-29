/**
 * Durable local record of the messages THIS device sent (issue #332).
 *
 * A device is never in its own fanout (ADR 0020 §7): the node has no envelope addressed
 * back to the sender, so nothing will ever redeliver an outgoing message to the person
 * who wrote it. Without a local copy an outgoing message exists only as in-memory echo
 * and is gone the moment the client restarts — the thread then shows the peer's half of
 * the conversation and nothing else.
 *
 * ADR 0020 §4 already names "plaintext-history material" and "a local encrypted outbox
 * entry" as vault-resident, so these rows live under the same authenticated encryption as
 * ratchet state, in one reserved opaque record per conversation (the leading NUL cannot
 * occur in a real session id, matching `ENROLLMENT_RECORD_KEY`/`PEER_PIN_RECORD_KEY`).
 * They are erased by `vault.wipe()` with everything else, and never leave this device:
 * multi-device sync of own messages is explicitly out of scope (ADR 0020 §7).
 *
 * Bodies are content — never log, measure, or put one in an error (spec §194).
 */
import { ByteReader, ByteWriter } from '@patches/crypto';

import type { InboxMessageRow } from './runtime.js';
import { VaultCorruptionError } from './vault-errors.js';

/** Prefix of the reserved opaque record key holding one conversation's own messages. */
export const OWN_MESSAGE_RECORD_PREFIX = '\0patches-e2ee-own-messages\0';

const OWN_MESSAGE_RECORD_VERSION = 1;

/**
 * Newest-N retention per conversation. The record is rewritten whole on every send, so
 * an unbounded list would make each send cost the size of the whole thread; this bounds
 * both that cost and the vault's growth. Trimming drops the OLDEST entries only.
 */
export const OWN_MESSAGE_RETENTION = 500;

const STATE_SENT = 1;
const STATE_FAILED = 2;

export type OwnMessageDeliveryState = 'sent' | 'failed';

export interface OwnMessageRecord {
  /** The client-minted id of the send this row records (stable across retries). */
  readonly clientMessageId: string;
  readonly body: string;
  /** Local clock at send time — the only timestamp this device can vouch for. */
  readonly sentAtMs: number;
  readonly deliveryState: OwnMessageDeliveryState;
}

/** The slice of the vault this store needs — satisfied structurally by
 * `RatchetSessionVault` (and by a minimal test double). */
export interface OwnMessageVaultAccess {
  getOpaqueRecord(key: string): Promise<Uint8Array | undefined>;
  putOpaqueRecord(key: string, value: Uint8Array): Promise<void>;
}

function recordKey(conversationId: string): string {
  return `${OWN_MESSAGE_RECORD_PREFIX}${conversationId}`;
}

/** The row id an own message renders under, in the same id space as envelope ids. */
export function ownMessageRowId(clientMessageId: string): string {
  return `own:${clientMessageId}`;
}

/** Render-ready row for a stored own message. `senderLabel` matches what the receive
 * path uses for the viewer's own envelopes, so the two are indistinguishable on screen. */
export function ownMessageRow(record: OwnMessageRecord): InboxMessageRow {
  return {
    kind: 'message',
    id: ownMessageRowId(record.clientMessageId),
    senderLabel: 'you',
    body: record.body,
    sentByViewer: true,
    ...(record.deliveryState === 'failed' ? { deliveryFailed: true } : {}),
  };
}

function encodeOwnMessages(records: readonly OwnMessageRecord[]): Uint8Array {
  const writer = new ByteWriter().u8(OWN_MESSAGE_RECORD_VERSION).u32(records.length);
  for (const record of records) {
    writer
      .string(record.clientMessageId)
      .string(record.body)
      .u64(record.sentAtMs)
      .u8(record.deliveryState === 'failed' ? STATE_FAILED : STATE_SENT);
  }
  return writer.finish();
}

function decodeOwnMessages(bytes: Uint8Array): OwnMessageRecord[] {
  const reader = new ByteReader(bytes);
  if (reader.u8() !== OWN_MESSAGE_RECORD_VERSION) throw new VaultCorruptionError();
  const count = reader.u32();
  const records: OwnMessageRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const clientMessageId = reader.string();
    const body = reader.string();
    const sentAtMs = reader.u64();
    const state = reader.u8();
    if (state !== STATE_SENT && state !== STATE_FAILED) throw new VaultCorruptionError();
    records.push({
      clientMessageId,
      body,
      sentAtMs,
      deliveryState: state === STATE_FAILED ? 'failed' : 'sent',
    });
  }
  reader.end();
  return records;
}

/**
 * This device's own messages in `conversationId`, oldest first. Fails closed on a
 * record that will not decode: silently reporting "you never sent anything" would be a
 * false statement about the viewer's own history, not a graceful degradation.
 */
export async function loadOwnMessages(
  vault: OwnMessageVaultAccess,
  conversationId: string,
): Promise<readonly OwnMessageRecord[]> {
  const bytes = await vault.getOpaqueRecord(recordKey(conversationId));
  if (bytes === undefined) return [];
  try {
    return decodeOwnMessages(bytes);
  } catch {
    throw new VaultCorruptionError();
  }
}

/**
 * Durably records (or updates, by `clientMessageId`) one outgoing message. Called once
 * with `'sent'` after the send resolves and once with `'failed'` when it does not, so a
 * message the viewer wrote is never lost just because delivery was.
 */
export async function recordOwnMessage(
  vault: OwnMessageVaultAccess,
  conversationId: string,
  record: OwnMessageRecord,
): Promise<void> {
  const existing = await loadOwnMessages(vault, conversationId);
  const merged = existing.filter((entry) => entry.clientMessageId !== record.clientMessageId);
  merged.push(record);
  merged.sort((left, right) => left.sentAtMs - right.sentAtMs);
  const retained = merged.slice(Math.max(0, merged.length - OWN_MESSAGE_RETENTION));
  await vault.putOpaqueRecord(recordKey(conversationId), encodeOwnMessages(retained));
}

/**
 * Own rows first (by local send time), then the rows drained from the mailbox in the
 * order the node delivered them. Received envelopes carry no timestamp this device can
 * trust — ADR 0020 §8 keeps send time out of the node-visible metadata — so within one
 * session the received half stays in observation order rather than being interleaved
 * against a clock that does not exist. Ids already seen in `drained` win, so a row this
 * device echoed after its own send is never duplicated by a later load.
 */
export function mergeOwnMessages<Row extends { readonly id: string }>(
  own: readonly OwnMessageRecord[],
  drained: readonly Row[],
): readonly (Row | InboxMessageRow)[] {
  const seen = new Set(drained.map((row) => row.id));
  const ownRows = own
    .filter((record) => !seen.has(ownMessageRowId(record.clientMessageId)))
    .map(ownMessageRow);
  return [...ownRows, ...drained];
}
