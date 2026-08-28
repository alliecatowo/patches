/**
 * The web client's end-to-end runtime contract (B-102 follow-up) — port of the TUI's
 * B-101 module: types shared by the send fanout and the mailbox receive loop, both of
 * which compose reviewed primitives (`@patches/crypto`'s X3DH, Double Ratchet,
 * `sealDeviceEnvelope`/`openDeviceEnvelope`) over the encrypted vault's staged-commit
 * protocol (P13-006). Kept byte-identical in behavior so a TUI session and a web
 * session interoperate.
 *
 * Hard rule (ADR 0020 §4 / spec §194): no key material, ratchet counters, or message
 * content ever reaches an error or log line. Every failure carries fixed copy.
 */
import type { VerifiedPreKeyBundle, VerifiedRosterSnapshot } from '@patches/crypto';
import { E2eeContractError } from '@patches/domain';

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

/** Fixed copy for a local receive fault; also the drain's `PollResult.error` in that case. */
export const E2EE_RECEIVE_UNAVAILABLE_COPY =
  'Could not process new encrypted messages on this device.';

/**
 * A receive attempt failed for a reason local to this device — the vault, the stored
 * enrollment record, or a mailbox round trip — rather than because the envelope itself is
 * bad. The drain fail-stops on this without acknowledging (B-193's original behavior,
 * narrowed by issue #260 to exactly this case), because the same envelope may open
 * perfectly once the local fault clears; skipping it would be a silent drop.
 */
export class E2eeReceiveUnavailableError extends Error {
  constructor() {
    super(E2EE_RECEIVE_UNAVAILABLE_COPY);
    this.name = new.target.name;
  }
}

// ---------------------------------------------------------------------------
// Transport seams — defined at the crypto boundary, implemented by the app shell
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
  /**
   * `conversationId`, when given, is a server-side filter (issue #152): only that
   * conversation's envelopes are matched and paged, so an open thread's poll no longer walks
   * every other conversation's queued mail just to skip it client-side.
   */
  listMailboxPage(
    cursor: string,
    conversationId?: string,
  ): Promise<{
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
  if (epoch < 0n || epoch > 0xffff_ffffn)
    throw new E2eeContractError('Membership epoch is invalid.');
  return Number(epoch);
}

// ---------------------------------------------------------------------------
// Rows the route renders
// ---------------------------------------------------------------------------

export interface InboxMessageRow {
  readonly kind: 'message';
  /** Stable dedupe key: the delivering envelope's id, or `own:<clientMessageId>` for a
   * message this device sent and stored locally (issue #332, `own-messages.ts`). */
  readonly id: string;
  readonly senderLabel: string;
  readonly body: string;
  readonly sentByViewer: boolean;
  /** Own messages only: the send did not reach the node. The body is kept so it can be
   * re-read or copied; delivery is not claimed. */
  readonly deliveryFailed?: boolean | undefined;
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

/**
 * An envelope this device could not open at all (issue #260): quarantined, acknowledged so
 * the mailbox keeps draining, and surfaced here so the gap is visible rather than silent.
 */
export interface InboxQuarantinedRow {
  readonly kind: 'quarantined';
  readonly id: string;
  readonly reason: QuarantineReason;
}

export type InboxRow =
  | InboxMessageRow
  | InboxUnverifiableRow
  | InboxHistoryRow
  | InboxUndisplayableRow
  | InboxQuarantinedRow;

/** Required copy for `InboxQuarantinedRow` — content-free, and never claims what was lost. */
export const E2EE_QUARANTINED_MESSAGE_COPY =
  'A message could not be decrypted on this device and was skipped.';

export interface PollResult {
  readonly rows: readonly InboxRow[];
  /** Fixed-copy failure description; polling continues on the next interval. */
  readonly error?: string | undefined;
}

// ---------------------------------------------------------------------------
// Quarantine of undecryptable envelopes (issue #260)
// ---------------------------------------------------------------------------

/**
 * Why an envelope was quarantined. A closed vocabulary on purpose: a reason is stored
 * locally and shown to the user, so it can never carry ciphertext, key material, ratchet
 * counters, or any fragment of a body (ADR 0020 §4).
 */
export type QuarantineReason =
  /** The envelope failed a structural/contract check before any ratchet step. */
  | 'malformed'
  /** Session setup or ratchet decryption failed deterministically for this envelope. */
  | 'undecryptable';

/**
 * Bound on how many envelopes one drain may quarantine (issue #260). Past it the drain stops
 * with `E2EE_QUARANTINE_LIMIT_COPY` instead of acknowledging an unbounded run of undecryptable
 * envelopes in a single pass — a flood is a signal, not something to grind through silently.
 */
export const MAX_QUARANTINED_PER_DRAIN = 16;

/** Fixed copy when a drain hits `MAX_QUARANTINED_PER_DRAIN`. */
export const E2EE_QUARANTINE_LIMIT_COPY =
  'Too many messages could not be decrypted on this device; the rest stay queued.';

/** Content-free local note that one envelope was skipped and acknowledged. */
export interface QuarantinedEnvelopeRecord {
  readonly envelopeId: string;
  readonly conversationId: string;
  readonly reason: QuarantineReason;
  readonly atMs: number;
}

/**
 * Where quarantine notes are kept. `record` rejecting fails the drain closed — the envelope
 * stays unacknowledged rather than vanishing with no local trace of it.
 */
export interface QuarantineStore {
  record(entry: QuarantinedEnvelopeRecord): Promise<void>;
  /** All notes, or only those for one conversation, oldest first. */
  list(conversationId?: string): Promise<readonly QuarantinedEnvelopeRecord[]>;
}

/**
 * Process-lifetime default store. Deliberately not the encrypted vault: a quarantine note
 * carries no secret, and keeping it out of the vault means recording one can never block on,
 * or corrupt, the staged-commit protocol that protects ratchet state.
 */
export function createInMemoryQuarantineStore(): QuarantineStore {
  const entries: QuarantinedEnvelopeRecord[] = [];
  return {
    record(entry: QuarantinedEnvelopeRecord): Promise<void> {
      entries.push(entry);
      return Promise.resolve();
    },
    list(conversationId?: string): Promise<readonly QuarantinedEnvelopeRecord[]> {
      return Promise.resolve(
        conversationId === undefined
          ? [...entries]
          : entries.filter((entry) => entry.conversationId === conversationId),
      );
    },
  };
}
