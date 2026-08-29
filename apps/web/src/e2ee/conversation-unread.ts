/**
 * Durable, per-conversation unread state for THIS device (issue #383).
 *
 * The node's `conversation.unreadCount` is server-managed and shared across a user's
 * devices, so anything this client computes locally — a thread the user read but the
 * server has not caught up with, or messages this device received since the user last
 * looked — is currently dropped on reload. This is the companion to
 * `inbound-messages.ts` (#352): it keeps the *read* side durable, one reserved opaque
 * record per conversation under the same authenticated encryption as ratchet state.
 *
 * The record holds a single count. `undefined` (no record) means this device has never
 * engaged with the conversation's read state here, so the caller falls back to the
 * server's count; `0` means "explicitly read through here"; `n > 0` means messages this
 * device received since it last read. It is erased by a vault wipe with everything else,
 * and never leaves this device. The count is content-free metadata; no body ever touches
 * this store.
 */
import { ByteReader, ByteWriter } from '@patches/crypto';

import { VaultCorruptionError } from './vault-errors.js';

/** Prefix of the reserved opaque record key holding one conversation's unread count. */
export const CONVERSATION_UNREAD_RECORD_PREFIX = '\0patches-e2ee-conversation-unread\0';

const CONVERSATION_UNREAD_RECORD_VERSION = 1;

/** The slice of the vault this store needs — satisfied structurally by
 * `RatchetSessionVault` (and by a minimal test double). */
export interface UnreadVaultAccess {
  getOpaqueRecord(key: string): Promise<Uint8Array | undefined>;
  putOpaqueRecord(key: string, value: Uint8Array): Promise<void>;
}

function recordKey(conversationId: string): string {
  return `${CONVERSATION_UNREAD_RECORD_PREFIX}${conversationId}`;
}

export function encodeUnread(count: number): Uint8Array {
  return new ByteWriter().u8(CONVERSATION_UNREAD_RECORD_VERSION).u32(count).finish();
}

export function decodeUnread(bytes: Uint8Array): number {
  const reader = new ByteReader(bytes);
  if (reader.u8() !== CONVERSATION_UNREAD_RECORD_VERSION) throw new VaultCorruptionError();
  const count = reader.u32();
  reader.end();
  return count;
}

/** This device's unread count for `conversationId`; `undefined` when no record exists,
 * i.e. the caller should fall back to the server-managed `unreadCount`. */
export async function loadUnread(
  vault: UnreadVaultAccess,
  conversationId: string,
): Promise<number | undefined> {
  const bytes = await vault.getOpaqueRecord(recordKey(conversationId));
  if (bytes === undefined) return undefined;
  try {
    return decodeUnread(bytes);
  } catch {
    throw new VaultCorruptionError();
  }
}

/** Records this device's unread count for `conversationId` (derived on a drain). */
export async function setUnread(
  vault: UnreadVaultAccess,
  conversationId: string,
  count: number,
): Promise<void> {
  await vault.putOpaqueRecord(recordKey(conversationId), encodeUnread(count));
}

/** Marks the conversation read through on this device — survives a reload (issue #383). */
export async function clearUnread(vault: UnreadVaultAccess, conversationId: string): Promise<void> {
  await vault.putOpaqueRecord(recordKey(conversationId), encodeUnread(0));
}

/** The count to display for a conversation given the server's value and this device's
 * local record. A local record is authoritative once present; the server value is the
 * bootstrap while no local record exists. Never negative. */
export function mergeUnread(serverUnread: number, localUnread: number | undefined): number {
  return localUnread === undefined ? Math.max(0, serverUnread) : Math.max(0, localUnread);
}
