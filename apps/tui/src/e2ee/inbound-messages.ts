/**
 * Durable local record of the decrypted messages THIS device received (issue #352).
 *
 * A drain acknowledges each inbound envelope as soon as its receive state commits
 * (ADR 0020 §4), so the node will never redeliver it — the rows a drain returns are the
 * only copy. This is the receiving counterpart of `own-messages.ts` (#332, which
 * persisted the sender's side): before this store a received message existed only in
 * session state and vanished on reload or restart. These rows live under the same
 * authenticated encryption as ratchet state, one reserved opaque record per conversation
 * (the leading NUL cannot occur in a real session id, matching
 * `ENROLLMENT_RECORD_KEY`/`PEER_PIN_RECORD_KEY`), keyed by the delivering envelope id so a
 * lost-acknowledgement replay is never rendered twice. They are erased by a vault wipe
 * with everything else, and never leave this device.
 *
 * Bodies are content — never log, measure, or put one in an error (spec §194).
 */
import { ByteReader, ByteWriter } from '@patches/crypto';

import type { InboxMessageRow, InboxRow } from './runtime.js';
import { VaultCorruptionError } from './vault-errors.js';

/** Prefix of the reserved opaque record key holding one conversation's received rows. */
export const INBOUND_MESSAGE_RECORD_PREFIX = '\0patches-e2ee-inbound-messages\0';

const INBOUND_MESSAGE_RECORD_VERSION = 1;

/**
 * Newest-N retention per conversation. The record is rewritten whole on every drain, so
 * an unbounded list would make each poll cost the size of the whole thread; this bounds
 * both that cost and the vault's growth. Trimming drops the OLDEST entries only.
 */
export const INBOUND_MESSAGE_RETENTION = 500;

/** Render-ready row saved for one received message. */
export interface InboundMessageRecord {
  /** The delivering envelope's id — the stable dedupe key (issue #352). */
  readonly id: string;
  readonly senderLabel: string;
  readonly body: string;
}

/** The slice of the vault this store needs — satisfied structurally by
 * `RatchetSessionVault` (and by a minimal test double). */
export interface InboundMessageVaultAccess {
  getOpaqueRecord(key: string): Promise<Uint8Array | undefined>;
  putOpaqueRecord(key: string, value: Uint8Array): Promise<void>;
}

function recordKey(conversationId: string): string {
  return `${INBOUND_MESSAGE_RECORD_PREFIX}${conversationId}`;
}

/** Render-ready row for a stored received message, in the same id space as a live drain. */
export function inboundMessageRow(record: InboundMessageRecord): InboxMessageRow {
  return {
    kind: 'message',
    id: record.id,
    senderLabel: record.senderLabel,
    body: record.body,
    sentByViewer: false,
  };
}

/**
 * The subset of a drain's rows worth persisting: received `message` rows only. Anything
 * `sentByViewer` came from the own-message store, and the system rows
 * (quarantine/undisplayable/history) are content-free metadata the drain delivers once.
 */
export function inboundMessagesToRecords(rows: readonly InboxRow[]): InboundMessageRecord[] {
  const records: InboundMessageRecord[] = [];
  for (const row of rows) {
    if (row.kind !== 'message' || row.sentByViewer) continue;
    records.push({ id: row.id, senderLabel: row.senderLabel, body: row.body });
  }
  return records;
}

function encodeInboundMessages(records: readonly InboundMessageRecord[]): Uint8Array {
  const writer = new ByteWriter().u8(INBOUND_MESSAGE_RECORD_VERSION).u32(records.length);
  for (const record of records) {
    writer.string(record.id).string(record.senderLabel).string(record.body);
  }
  return writer.finish();
}

function decodeInboundMessages(bytes: Uint8Array): InboundMessageRecord[] {
  const reader = new ByteReader(bytes);
  if (reader.u8() !== INBOUND_MESSAGE_RECORD_VERSION) throw new VaultCorruptionError();
  const count = reader.u32();
  const records: InboundMessageRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = reader.string();
    const senderLabel = reader.string();
    const body = reader.string();
    records.push({ id, senderLabel, body });
  }
  reader.end();
  return records;
}

/**
 * This device's received messages in `conversationId`, in the order they were drained.
 * Fails closed on a record that will not decode: silently reporting "you never received
 * anything" would be a false statement about the conversation, not a graceful
 * degradation — the same stance `loadOwnMessages` takes for the sender's side.
 */
export async function loadInboundMessages(
  vault: InboundMessageVaultAccess,
  conversationId: string,
): Promise<readonly InboundMessageRecord[]> {
  const bytes = await vault.getOpaqueRecord(recordKey(conversationId));
  if (bytes === undefined) return [];
  try {
    return decodeInboundMessages(bytes);
  } catch {
    throw new VaultCorruptionError();
  }
}

/**
 * Merges `newRecords` into the conversation's stored inbound rows, deduping by envelope
 * id (a lost-acknowledgement replay, or a re-drain after a transient fault, must never be
 * rendered twice) and bounding the record to `INBOUND_MESSAGE_RETENTION`.
 */
export function mergeInboundMessages(
  existing: readonly InboundMessageRecord[],
  newRecords: readonly InboundMessageRecord[],
): InboundMessageRecord[] {
  const seen = new Set(existing.map((record) => record.id));
  const merged = [...existing];
  for (const record of newRecords) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    merged.push(record);
  }
  return merged.slice(Math.max(0, merged.length - INBOUND_MESSAGE_RETENTION));
}

/**
 * Durably records newly drained received messages for `conversationId`, deduped by
 * envelope id against what is already stored. Called after each successful drain — the
 * rows are acknowledged, so persisting before they can be dropped is what stops a
 * received message from disappearing.
 */
export async function recordInboundMessages(
  vault: InboundMessageVaultAccess,
  conversationId: string,
  records: readonly InboundMessageRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const existing = await loadInboundMessages(vault, conversationId);
  await vault.putOpaqueRecord(
    recordKey(conversationId),
    encodeInboundMessages(mergeInboundMessages(existing, records)),
  );
}
