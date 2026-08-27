/**
 * The TUI's end-to-end runtime contract (B-101) — types shared by the send fanout and
 * the mailbox receive loop, both of which compose reviewed primitives
 * (`@patches/crypto`'s X3DH, Double Ratchet, `sealDeviceEnvelope`/`openDeviceEnvelope`)
 * over the encrypted vault's staged-commit protocol (P13-006).
 *
 * Hard rule (ADR 0020 §4 / spec §194): no key material, ratchet counters, or message
 * content ever reaches an error or log line. Every failure carries fixed copy.
 */
import type { VerifiedPreKeyBundle, VerifiedRosterSnapshot } from '@patches/crypto';

/** Vault session id for one device pair inside one conversation (`\u0000` is id-safe). */
export function sessionIdFor(conversationId: string, actorId: string, deviceId: string): string {
  return `${conversationId}\u0000${actorId}\u0000${deviceId}`;
}

// ---------------------------------------------------------------------------
// Errors — fixed copy only
// ---------------------------------------------------------------------------

export class E2eeNotEnrolledError extends Error {
  constructor() {
    super('This client has no enrolled messaging device yet.');
    this.name = new.target.name;
  }
}

export class E2eeMessageTooLargeError extends Error {
  constructor() {
    super('That message is too large to send encrypted.');
    this.name = new.target.name;
  }
}

// ---------------------------------------------------------------------------
// Transport seams — defined at the crypto boundary, implemented by the shell
// ---------------------------------------------------------------------------

export interface FanoutTarget {
  readonly actorId: string;
  readonly deviceId: string;
}

export interface FanoutPlan {
  readonly conversationId: string;
  readonly membershipEpoch: bigint;
  /** Every currently active member device the fanout must cover (ADR 0020 §7). */
  readonly targets: readonly FanoutTarget[];
}

/** A prekey bundle plus the peer roster snapshot it was verified against. */
export interface ClaimedPeerBundle {
  readonly actorId: string;
  readonly deviceId: string;
  /** Already verified by the transport adapter (ADR 0033 §3: a branded, unforgeable value). */
  readonly bundle: VerifiedPreKeyBundle;
  readonly roster: VerifiedRosterSnapshot;
}

/** Send-side seam the shell binds to authenticated `E2eeService` RPCs. */
export interface E2eeSendTransport {
  loadFanoutPlan(conversationId: string): Promise<FanoutPlan>;
  claimPrekeyBundles(request: {
    conversationId: string;
    actorIds: readonly string[];
  }): Promise<readonly ClaimedPeerBundle[]>;
  sendEnvelopes(request: SendEnvelopesRequestLike): Promise<unknown>;
}

/** Structural shape of the `SendEnvelopesRequest` this runtime composes. */
export interface SendEnvelopesRequestLike {
  conversationId: string;
  clientRequestId: string;
  senderDeviceId: string;
  message: {
    /** ADR 0025: bound into every envelope's AD; the node must store it verbatim. */
    logicalMessageId: string;
    membershipEpoch: bigint;
    frankingCommitment: Uint8Array;
    frankingProfile: string;
    fanoutDigest: Uint8Array;
    deviceEnvelopes: readonly {
      recipientActorId: string;
      recipientDeviceId: string;
      encryptedHeader: Uint8Array;
      ciphertext: Uint8Array;
      openingCiphertext: Uint8Array;
      ciphertextDigest: Uint8Array;
    }[];
  };
}

/** Receive-side seam the shell binds to authenticated `E2eeService` RPCs. */
export interface E2eeMailboxTransport {
  listMailboxPage(cursor: string): Promise<{
    readonly envelopes: readonly E2eeMailboxEnvelopeLike[];
    readonly nextCursor: string;
  }>;
  acknowledge(envelopeIds: readonly string[]): Promise<void>;
  /** The peer's signed roster snapshot, already verified by the adapter. */
  loadPeerRoster(actorId: string): Promise<VerifiedRosterSnapshot>;
}

/** Structural shape of `E2eeMailboxEnvelope` (wire type mirrored for tests). */
export interface E2eeMailboxEnvelopeLike {
  envelopeId: string;
  logicalMessageId: string;
  conversationId: string;
  membershipEpoch: bigint;
  senderActorId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  encryptedHeader: Uint8Array;
  ciphertext: Uint8Array;
  frankingCommitment: Uint8Array;
  frankingTag?: { profile: string } | undefined;
}

// ---------------------------------------------------------------------------
// Logical plaintext format (inside the sealed inner plaintext, then padded)
// ---------------------------------------------------------------------------
//   byte 0        kind: 1 = chat body, 2 = history-transfer record
//   bytes 1..4    u32be true body length (chat kind; ADR 0020 §8)
//   remaining     payload, zero-padded to a fixed size bucket (ADR 0020 §6)

const KIND_CHAT = 1;
const KIND_HISTORY = 2;
const BUCKETS: readonly number[] = [512, 2_048, 8_192, 32_000];
const HEADER_BYTES = 5;

function bucketFor(payloadLength: number): number {
  for (const bucket of BUCKETS) {
    if (payloadLength + HEADER_BYTES <= bucket) return bucket;
  }
  throw new E2eeMessageTooLargeError();
}

export function encodeChatPlaintext(body: string): Uint8Array {
  const payload = new TextEncoder().encode(body);
  const total = bucketFor(payload.length);
  const out = new Uint8Array(total);
  out[0] = KIND_CHAT;
  new DataView(out.buffer).setUint32(1, payload.length, false);
  out.set(payload, HEADER_BYTES);
  return out;
}

/** Wraps canonical history-transfer record bytes as a logical plaintext. */
export function encodeHistoryPlaintext(record: Uint8Array): Uint8Array {
  const largest = BUCKETS[BUCKETS.length - 1] ?? 0;
  if (record.length + 1 > largest) throw new E2eeMessageTooLargeError();
  const out = new Uint8Array(record.length + 1);
  out[0] = KIND_HISTORY;
  out.set(record, 1);
  return out;
}

export interface DecodedPayload {
  readonly kind: 'chat' | 'history';
  /** Chat bodies only: the true, unpadded UTF-8 body. */
  readonly body?: string | undefined;
  /** History records only: the canonical transfer record bytes. */
  readonly record?: Uint8Array | undefined;
}

export function decodePayload(inner: Uint8Array): DecodedPayload {
  const kind = inner[0];
  if (kind === KIND_CHAT) {
    if (inner.length < HEADER_BYTES) throw new Error('Truncated chat payload.');
    const length = new DataView(inner.buffer, inner.byteOffset, HEADER_BYTES).getUint32(1, false);
    if (length > inner.length - HEADER_BYTES) throw new Error('Body length exceeds its padding.');
    return {
      kind: 'chat',
      body: new TextDecoder().decode(inner.subarray(HEADER_BYTES, HEADER_BYTES + length)),
    };
  }
  if (kind === KIND_HISTORY) {
    return { kind: 'history', record: inner.slice(1) };
  }
  throw new Error('Unknown inner payload kind.');
}

export function epochToNumber(epoch: bigint): number {
  // The commitment transcript encodes the epoch at u64 but rejects values above the u32
  // ceiling (`MEMBERSHIP_EPOCH_U32_MAX`); stay inside the same accepted range.
  if (epoch < 0n || epoch > 0xffff_ffffn) throw new Error('Membership epoch is invalid.');
  return Number(epoch);
}

// ---------------------------------------------------------------------------
// Rows the screen renders
// ---------------------------------------------------------------------------

export interface InboxMessageRow {
  readonly kind: 'message';
  /** Stable dedupe key: the delivering envelope's id. */
  readonly id: string;
  readonly senderLabel: string;
  readonly body: string;
  readonly sentByViewer: boolean;
}

export interface InboxUnverifiableRow {
  readonly kind: 'unverifiable';
  readonly id: string;
  readonly senderLabel: string;
}

export interface InboxHistoryRow {
  readonly kind: 'history';
  readonly id: string;
  readonly fromLabel: string;
  readonly entries: readonly { readonly senderLabel: string; readonly body: string }[];
}

export interface InboxUndisplayableRow {
  readonly kind: 'undisplayable';
  readonly id: string;
}

export type InboxRow =
  InboxMessageRow | InboxUnverifiableRow | InboxHistoryRow | InboxUndisplayableRow;

export interface PollResult {
  readonly rows: readonly InboxRow[];
  /** Fixed-copy failure description; polling continues on the next interval. */
  readonly error?: string | undefined;
}
