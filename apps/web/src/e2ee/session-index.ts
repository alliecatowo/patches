/**
 * Per-peer-device session bookkeeping (audit P2-H1): which ratchet sessions exist for one
 * (conversation, peer actor, peer device) triple, which one sends, and which handshakes were
 * already seen.
 *
 * Why this exists. The base session id is symmetric, so one slot per pair cannot represent two
 * live handshakes. Two things then went wrong with no way out:
 *
 *   - glare: both sides send first, each holds an initiator session, each opens the other's
 *     initial envelope against its own initiator state, fails authentication, and drops the
 *     message as "unverifiable" in both directions, permanently;
 *   - a lost first-send response: the sender deleted its new session, the next send ran a fresh
 *     X3DH, and the responder (which had committed the first) took the new initial envelope for a
 *     redelivery of the old one.
 *
 * The fix, in the Sesame/Signal shape:
 *
 *   - a handshake id is the SHA-256 of the exact setup bytes an initial envelope carries, so both
 *     sides name the same handshake without trusting anything the node adds;
 *   - every handshake gets its own vault session (`<base>#<id>`); a pair can hold several;
 *   - an initiator session stays unconfirmed, and keeps prefixing the setup block to every
 *     envelope, until the peer answers in it. Nothing is deleted on an ambiguous transport
 *     failure: a retry resends under the same handshake;
 *   - glare is settled deterministically: the lower (actor id, device id) in UTF-8 byte order
 *     keeps its own initiator session as primary and still opens the other side's messages from
 *     the extra session; the other side adopts the winner's handshake as primary;
 *   - a handshake id that was seen before but is no longer held is a replay and never rebuilds a
 *     live session (the node can redeliver an old initial envelope; a signed-prekey-only
 *     handshake can be re-derived indefinitely);
 *   - an explicit reset drops a pair's sessions but keeps the seen set.
 *
 * Sessions created before this module existed live at the bare base id with no index entry; they
 * are adopted as a confirmed `legacy` entry the first time the pair is touched.
 *
 * The index is one opaque vault record. It holds ids and flags only, never key material. Writers
 * are serialized by the runtime's operation lock.
 */
import { ByteReader, ByteWriter, compareUtf8Bytes, sha256Hash } from '@patches/crypto';

import type { RatchetSessionVault } from './vault.js';

export const SESSION_INDEX_KEY = '\0patches-e2ee-session-index';

const INDEX_VERSION = 1;
/** Sessions kept per peer device: the primary, an unconfirmed initiator, and a few demoted ones. */
export const MAX_SESSIONS_PER_PEER = 4;
/** Handshake ids remembered per peer device for replay refusal. */
export const MAX_SEEN_HANDSHAKES = 64;
const HANDSHAKE_ID_BYTES = 32;

export type SessionRole = 'initiator' | 'responder' | 'legacy';

export interface SessionEntry {
  /** SHA-256 of the setup prefix; 32 zero bytes for a `legacy` entry. */
  readonly handshakeId: Uint8Array;
  readonly role: SessionRole;
  /** Initiator only: the peer has answered in this session. Always true otherwise. */
  readonly confirmed: boolean;
  /** Initiator only, and only while unconfirmed: prefixed to every outgoing envelope. */
  readonly setupPrefix: Uint8Array;
  /** The vault session id holding this entry's ratchet. */
  readonly key: string;
}

export interface PeerSessions {
  readonly baseId: string;
  /** Vault key of the session that sends; always one of `entries`. */
  readonly primaryKey: string;
  /** Oldest first. */
  readonly entries: readonly SessionEntry[];
  readonly seen: readonly Uint8Array[];
}

export type SessionIndex = ReadonlyMap<string, PeerSessions>;

export function handshakeIdOf(setupPrefix: Uint8Array): Uint8Array {
  return sha256Hash(setupPrefix);
}

export function sameHandshake(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hex(bytes: Uint8Array, count: number): string {
  let out = '';
  for (let index = 0; index < Math.min(count, bytes.length); index += 1) {
    out += (bytes[index] ?? 0).toString(16).padStart(2, '0');
  }
  return out;
}

/** Vault key of the session a handshake created. 16 bytes of the id keep it unique in practice;
 * the full id is stored in the entry and is what lookups compare. */
export function sessionKeyFor(baseId: string, handshakeId: Uint8Array): string {
  return `${baseId}#${hex(handshakeId, 16)}`;
}

export function legacyEntry(baseId: string): SessionEntry {
  return {
    handshakeId: new Uint8Array(HANDSHAKE_ID_BYTES),
    role: 'legacy',
    confirmed: true,
    setupPrefix: new Uint8Array(0),
    key: baseId,
  };
}

export function emptyPeer(baseId: string): PeerSessions {
  return { baseId, primaryKey: '', entries: [], seen: [] };
}

// ---------------------------------------------------------------------------
// Pure transitions
// ---------------------------------------------------------------------------

export function findEntry(peer: PeerSessions, handshakeId: Uint8Array): SessionEntry | undefined {
  return peer.entries.find((entry) => sameHandshake(entry.handshakeId, handshakeId));
}

export function hasSeen(peer: PeerSessions, handshakeId: Uint8Array): boolean {
  return peer.seen.some((seen) => sameHandshake(seen, handshakeId));
}

export function primaryOf(peer: PeerSessions): SessionEntry | undefined {
  return peer.entries.find((entry) => entry.key === peer.primaryKey);
}

/** Receive order: the primary first, then the rest newest first. */
export function receiveOrder(peer: PeerSessions): readonly SessionEntry[] {
  const primary = primaryOf(peer);
  const rest = peer.entries.filter((entry) => entry !== primary).reverse();
  return primary === undefined ? rest : [primary, ...rest];
}

function actorDeviceKey(actorId: string, deviceId: string): string {
  return `${actorId}\u0000${deviceId}`;
}

/**
 * Whether a freshly accepted responder session from `peer` should become the sending session.
 * Only an unconfirmed initiator primary is in glare with it; there the lower (actor, device)
 * key in UTF-8 byte order keeps its own initiator session. Everything else is a peer that
 * (re)started, and its newest handshake wins.
 */
export function incomingWins(input: {
  readonly primary: SessionEntry | undefined;
  readonly self: { readonly actorId: string; readonly deviceId: string };
  readonly peer: { readonly actorId: string; readonly deviceId: string };
}): boolean {
  const { primary } = input;
  if (primary === undefined) return true;
  if (primary.role !== 'initiator' || primary.confirmed) return true;
  const self = actorDeviceKey(input.self.actorId, input.self.deviceId);
  const peer = actorDeviceKey(input.peer.actorId, input.peer.deviceId);
  return compareUtf8Bytes(peer, self) < 0;
}

function rememberSeen(seen: readonly Uint8Array[], handshakeId: Uint8Array): Uint8Array[] {
  const next = seen.filter((candidate) => !sameHandshake(candidate, handshakeId));
  next.push(handshakeId);
  return next.slice(-MAX_SEEN_HANDSHAKES);
}

export interface AddEntryResult {
  readonly peer: PeerSessions;
  /** Vault keys the caller must delete: entries pruned to stay within the cap. */
  readonly evictedKeys: readonly string[];
}

/** Adds an entry (and records its handshake as seen), optionally making it the sender. */
export function addEntry(
  peer: PeerSessions,
  entry: SessionEntry,
  makePrimary: boolean,
): AddEntryResult {
  const withoutDuplicate = peer.entries.filter((candidate) => candidate.key !== entry.key);
  let entries = [...withoutDuplicate, entry];
  const primaryKey = makePrimary || peer.primaryKey === '' ? entry.key : peer.primaryKey;
  const evictedKeys: string[] = [];
  while (entries.length > MAX_SESSIONS_PER_PEER) {
    // Oldest first, but never the sender and never an initiator the peer has yet to answer.
    const victim = entries.find(
      (candidate) =>
        candidate.key !== primaryKey &&
        !(candidate.role === 'initiator' && !candidate.confirmed) &&
        candidate.key !== entry.key,
    );
    if (victim === undefined) break;
    evictedKeys.push(victim.key);
    entries = entries.filter((candidate) => candidate !== victim);
  }
  return {
    peer: {
      baseId: peer.baseId,
      primaryKey,
      entries,
      seen: rememberSeen(peer.seen, entry.handshakeId),
    },
    evictedKeys,
  };
}

/** Marks an initiator entry answered: it stops carrying the setup block. */
export function confirmEntry(peer: PeerSessions, key: string): PeerSessions {
  return {
    ...peer,
    entries: peer.entries.map((entry) =>
      entry.key === key && entry.role === 'initiator' && !entry.confirmed
        ? { ...entry, confirmed: true, setupPrefix: new Uint8Array(0) }
        : entry,
    ),
  };
}

export function removeEntry(peer: PeerSessions, key: string): PeerSessions {
  const entries = peer.entries.filter((entry) => entry.key !== key);
  const primaryKey =
    peer.primaryKey === key ? (entries[entries.length - 1]?.key ?? '') : peer.primaryKey;
  return { ...peer, entries, primaryKey };
}

/** Drops every session of a pair, keeping the seen set so an old initial cannot come back. */
export function clearSessions(peer: PeerSessions): { peer: PeerSessions; keys: string[] } {
  return {
    peer: { baseId: peer.baseId, primaryKey: '', entries: [], seen: peer.seen },
    keys: peer.entries.map((entry) => entry.key),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const ROLE_CODE: Readonly<Record<SessionRole, number>> = { initiator: 0, responder: 1, legacy: 2 };
const ROLE_BY_CODE: readonly SessionRole[] = ['initiator', 'responder', 'legacy'];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeSessionIndex(index: SessionIndex): Uint8Array {
  const writer = new ByteWriter();
  writer.u8(INDEX_VERSION);
  const peers = [...index.values()].filter(
    (peer) => peer.entries.length > 0 || peer.seen.length > 0,
  );
  writer.u32(peers.length);
  for (const peer of peers) {
    writer.bytes(textEncoder.encode(peer.baseId));
    writer.bytes(textEncoder.encode(peer.primaryKey));
    writer.u32(peer.entries.length);
    for (const entry of peer.entries) {
      writer.fixed(entry.handshakeId, HANDSHAKE_ID_BYTES);
      writer.u8(ROLE_CODE[entry.role]);
      writer.u8(entry.confirmed ? 1 : 0);
      writer.bytes(entry.setupPrefix);
      writer.bytes(textEncoder.encode(entry.key));
    }
    writer.u32(peer.seen.length);
    for (const seen of peer.seen) writer.fixed(seen, HANDSHAKE_ID_BYTES);
  }
  return writer.finish();
}

export function decodeSessionIndex(bytes: Uint8Array): SessionIndex {
  const reader = new ByteReader(bytes);
  if (reader.u8() !== INDEX_VERSION) throw new Error('Unsupported session index version.');
  const index = new Map<string, PeerSessions>();
  const peerCount = reader.u32();
  for (let peerIndex = 0; peerIndex < peerCount; peerIndex += 1) {
    const baseId = textDecoder.decode(reader.bytes());
    const primaryKey = textDecoder.decode(reader.bytes());
    const entries: SessionEntry[] = [];
    const entryCount = reader.u32();
    for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
      const handshakeId = reader.fixed(HANDSHAKE_ID_BYTES);
      const role = ROLE_BY_CODE[reader.u8()];
      if (role === undefined) throw new Error('Unknown session role.');
      const confirmed = reader.u8() === 1;
      const setupPrefix = reader.bytes();
      const key = textDecoder.decode(reader.bytes());
      entries.push({ handshakeId, role, confirmed, setupPrefix, key });
    }
    const seen: Uint8Array[] = [];
    const seenCount = reader.u32();
    for (let seenIndex = 0; seenIndex < seenCount; seenIndex += 1) {
      seen.push(reader.fixed(HANDSHAKE_ID_BYTES));
    }
    index.set(baseId, { baseId, primaryKey, entries, seen });
  }
  reader.end();
  return index;
}

/** Loads the index. A missing record is an empty index; an undecodable one is a hard error
 * (the caller treats it as a local fault rather than silently forgetting which handshakes were
 * seen, which would reopen the replay hole). */
export async function loadSessionIndex(
  vault: RatchetSessionVault,
): Promise<Map<string, PeerSessions>> {
  const bytes = await vault.getOpaqueRecord(SESSION_INDEX_KEY);
  if (bytes === undefined || bytes.length === 0) return new Map();
  return new Map(decodeSessionIndex(bytes));
}

export async function saveSessionIndex(
  vault: RatchetSessionVault,
  index: SessionIndex,
): Promise<void> {
  await vault.putOpaqueRecord(SESSION_INDEX_KEY, encodeSessionIndex(index));
}

// ---------------------------------------------------------------------------
// Runtime-facing handle
// ---------------------------------------------------------------------------

/**
 * The index plus the vault it lives in. Callers hold the runtime's operation lock, so a
 * load-modify-save here never interleaves with another writer in the same process.
 */
export class SessionBook {
  private index = new Map<string, PeerSessions>();

  constructor(private readonly vault: RatchetSessionVault) {}

  async load(): Promise<void> {
    this.index = await loadSessionIndex(this.vault);
  }

  peer(baseId: string): PeerSessions {
    return this.index.get(baseId) ?? emptyPeer(baseId);
  }

  /** Persists one peer's record, then deletes the sessions it evicted. The index is written
   * first: a crash in between leaves an unreferenced session, never a reference to a deleted
   * one. */
  async put(peer: PeerSessions, evictedKeys: readonly string[] = []): Promise<void> {
    const next = new Map(this.index);
    next.set(peer.baseId, peer);
    await saveSessionIndex(this.vault, next);
    this.index = next;
    for (const key of evictedKeys) await this.vault.deleteSession(key);
  }

  /** Adopts a session that predates the index (stored at the bare base id) as a confirmed
   * `legacy` entry, so it takes part in ordering like any other. */
  async withLegacy(baseId: string): Promise<PeerSessions> {
    const peer = this.peer(baseId);
    if (peer.entries.length > 0) return peer;
    if ((await this.vault.getSession(baseId)) === undefined) return peer;
    const adopted = addEntry(peer, legacyEntry(baseId), true).peer;
    await this.put(adopted);
    return adopted;
  }

  /**
   * Explicit "reset secure session" (audit P2-H1): drops every session this conversation holds
   * with its peers, including legacy ones, and keeps the seen set so an old initial envelope can
   * never rebuild one. The next send runs a fresh X3DH under a new handshake id; the peer
   * adopts it as their sending session. Returns how many sessions were removed.
   */
  async resetConversation(conversationId: string): Promise<number> {
    const prefix = `${conversationId}\u0000`;
    const keys = (await this.vault.listSessions()).filter((key) => key.startsWith(prefix));
    const next = new Map(this.index);
    for (const [baseId, peer] of this.index) {
      if (baseId.startsWith(prefix)) next.set(baseId, clearSessions(peer).peer);
    }
    await saveSessionIndex(this.vault, next);
    this.index = next;
    for (const key of keys) await this.vault.deleteSession(key);
    return keys.length;
  }
}
