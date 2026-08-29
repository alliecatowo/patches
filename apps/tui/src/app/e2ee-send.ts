/**
 * The vault-backed send/receive pipeline for end-to-end conversations (B-101,
 * P13-006 × P13-010, ADR 0020 §4).
 *
 * This is the ONLY route an E2EE conversation's traffic may take in this client — never
 * a fallback to the plaintext RPC, not "just this once" (ADR 0020 §1.2). All protocol
 * composition lives in `../e2ee/runtime-session.ts`; this module owns what the shell
 * actually holds:
 *
 *   1. one lazily-opened, keyring-wrapped vault per account, whose faults are sticky and
 *      coarse (`corrupt`/`rollback` — inaccessible-history banners, never silent resets);
 *   2. the bridge to an enrolled identity + transports (B-107). Without an enrolled
 *      messaging device, sends fail with `E2eeNotEnrolledError`, which the messages
 *      screen renders as its enrolled-device copy — stated plainly, never downgraded.
 *      Enrollment itself (`enroll()`) runs against this SAME vault instance so the
 *      single-owner rule holds; `restoreEnrollment()` re-binds a previously submitted
 *      enrollment on session start;
 *   3. the explicit wipe path (audit P1-2): wiping routes through the LIVE store's
 *      `wipe()`/`close()` so locks and in-memory secrets are released by the same object
 *      that acquired them, drops this factory's cached instance, unbinds any enrolled
 *      identity, and clears the sticky fault state so a wiped account can start over.
 */
import { randomUUID } from 'node:crypto';

import type { E2eeMailboxTransport, E2eeSendTransport, InboxMessageRow } from '../e2ee/runtime.js';
import { E2eeNotEnrolledError } from '../e2ee/runtime.js';
import {
  inboundMessageRow,
  inboundMessagesToRecords,
  loadInboundMessages,
  recordInboundMessages,
} from '../e2ee/inbound-messages.js';
import { clearUnread, loadUnread, setUnread } from '../e2ee/conversation-unread.js';
import {
  loadOwnMessages,
  mergeOwnMessages,
  ownMessageRow,
  recordOwnMessage,
} from '../e2ee/own-messages.js';
import { E2eeSessionRuntime } from '../e2ee/runtime-session.js';
import type { LocalDeviceIdentity } from '../e2ee/local-identity.js';
import { createRatchetSessionVault, type RatchetSessionVault } from '../e2ee/ratchet-vault.js';
import { VaultCorruptionError, VaultRollbackError } from '../e2ee/vault-errors.js';
import type { VaultAccount } from '../e2ee/vault-key-providers.js';
import {
  enrollThisDevice,
  loadStoredEnrollment,
  type EnrollOutcome,
  type EnrollmentTransport,
} from '../e2ee/enrollment.js';
import {
  approveLinkOffer,
  beginDeviceLinkOffer,
  listLinkOffers,
  pollLinkedEnrollment,
  rotateMessagingRoot,
  type ApproveLinkOfferResult,
  type BeginDeviceLinkOfferResult,
  type PendingLinkOfferSummary,
  type PollLinkedEnrollmentResult,
  type RotateMessagingRootResult,
} from '../e2ee/device-link.js';

/** Sticky, content-free vault faults surfaced verbatim as inaccessible-history states. */
export type E2eeVaultFault = 'corrupt' | 'rollback';

/** The conversation has no established ratchet session on this device yet. */
export class E2eeSessionUnavailableError extends Error {
  constructor() {
    super('No established end-to-end session with this conversation exists on this device yet.');
    this.name = new.target.name;
  }
}

/** The shell provided no authenticated `SendEnvelopes` composition to deliver through. */
export class E2eeTransportUnavailableError extends Error {
  constructor() {
    super('Encrypted delivery is not wired up in this build.');
    this.name = new.target.name;
  }
}

export interface E2eeTransports extends E2eeSendTransport, E2eeMailboxTransport {}

export interface CreateVaultE2eeSenderOptions {
  readonly account: VaultAccount;
  readonly allowInsecureKeyFile: boolean;
  /** Injectable for tests; defaults to the real keyring-wrapped file vault. */
  readonly vault?: RatchetSessionVault;
  /** Injectable clock for certificate validity windows (tests only). */
  readonly nowMs?: () => number;
  /**
   * The enrolled identity and its bound transports. Absent until an enrollment flow
   * produces a messaging device — sends and mailbox polls then fail with fixed copy
   * rather than pretending (ADR 0020 §1.2).
   */
  readonly enrolled?: {
    readonly identity: LocalDeviceIdentity;
    readonly transports: E2eeTransports;
  };
  /**
   * B-107: builds the authenticated transports once an enrolled identity is known —
   * either restored from this vault at startup or produced by `enroll()`. Without it a
   * restored identity stays dormant (the pre-enrollment behavior), never half-bound.
   * Receives the open vault: the transports enforce peer-identity pinning (C1/C2)
   * through it, so a builder cannot forget to hand it over.
   */
  readonly buildTransports?: (
    identity: LocalDeviceIdentity,
    vault: RatchetSessionVault,
  ) => E2eeTransports;
}

export interface EnrollThroughVaultInput {
  /** The signed-in account's actor id (certificates are issued per actor). */
  readonly actorId: string;
  /** The enrollment flow's RPC seam (capability probe, root publish, `EnrollDevice`). */
  readonly transport: EnrollmentTransport;
}

/** ADR 0037 §2: present only when this device holds the CURRENTLY served root's private
 * key locally (an imported recovery archive) — see `rotateMessagingRoot`'s own doc. */
export interface RotatePreviousRoot {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

export interface RotateRootThroughVaultInput extends EnrollThroughVaultInput {
  readonly previousRoot?: RotatePreviousRoot;
}

export interface ApproveLinkOfferThroughVaultInput extends EnrollThroughVaultInput {
  readonly linkId: string;
}

/** A link/rotation result paired with the device id this sender is now bound to, when
 * the operation newly bound one — `undefined` when nothing changed (e.g. still pending). */
export interface LinkPollOutcome {
  readonly result: PollLinkedEnrollmentResult;
  readonly deviceId?: string;
}

export interface RotateRootOutcome {
  readonly result: RotateMessagingRootResult;
  readonly deviceId?: string;
}

export interface VaultE2eeSender {
  /** The sticky fault from opening, if any — rendered as an explicit
   * inaccessible-history banner until the viewer explicitly wipes and resets. */
  fault(): E2eeVaultFault | undefined;
  /** Whether an enrolled messaging identity is bound (gates send and mailbox polling). */
  enrolled(): boolean;
  /**
   * Sends `body` and durably records it as this device's own message (issue #332),
   * resolving the row the thread should render for it. A failed send is recorded too,
   * marked undelivered, so the viewer's text survives the failure.
   */
  send(conversationId: string, body: string): Promise<InboxMessageRow>;
  /**
   * Drains this account's encrypted mailbox (optionally only `conversationId`'s
   * envelopes) and returns render-ready rows. A conversation-scoped drain durably stores
   * the received message rows it produces (`inbound-messages.ts`, issue #352) and merges
   * them with this device's stored own messages, so both halves of a thread survive a
   * restart — no fanout ever redelivers either side. Requires an enrolled identity.
   *
   * When `reading` is false (a drain for a conversation the user is not looking at right
   * now), the count of newly drained received messages is added to the conversation's
   * durable unread store, so "messages received since I last looked" survives a reload
   * (issue #383). The open thread drains with `reading` true — those messages are being
   * read live and are not counted. The default keeps call sites that only ever drain the
   * open thread behaving as "reading".
   */
  pollMailbox(
    conversationId?: string,
    opts?: { readonly reading?: boolean },
  ): Promise<E2eeSessionRuntimePollResult>;
  /** This device's durable unread count for `conversationId` (issue #383); `undefined`
   * when this device has not yet set a read point here, in which case the caller falls
   * back to the server-managed `unreadCount`. Requires an open vault. */
  conversationUnread(conversationId: string): Promise<number | undefined>;
  /** Clears this device's durable unread for `conversationId` — the "marked read" side
   * of issue #383. The `0` is written to the vault, so a locally-read conversation stays
   * read across a reload even if the node's count lags. */
  clearConversationUnread(conversationId: string): Promise<void>;
  /**
   * B-107: restores a previously submitted enrollment from this vault and binds it
   * (and its transports) to the runtime. Resolves the bound identity, or `undefined`
   * when this vault holds none.
   */
  restoreEnrollment(): Promise<LocalDeviceIdentity | undefined>;
  /**
   * B-107: runs the device-enrollment flow through this sender's OWN vault — one
   * process owns the vault at a time (ADR 0020 §4) — then binds the resulting
   * identity. Idempotent: an already-submitted enrollment short-circuits.
   */
  enroll(input: EnrollThroughVaultInput): Promise<EnrollOutcome>;
  /** ADR 0037 §1 step 1: posts this device's link offer through this sender's OWN vault
   * (the offer material must survive a crash the same way enrollment material does). */
  beginLink(input: EnrollThroughVaultInput): Promise<BeginDeviceLinkOfferResult>;
  /** ADR 0037 §1 step 4: polls for the authority's approval. On `'enrolled'`, binds the
   * newly-certified identity exactly as `enroll()` does. */
  pollLink(input: EnrollThroughVaultInput): Promise<LinkPollOutcome>;
  /** ADR 0037 §2: mints and publishes the next root generation, then binds the result. */
  rotateRoot(input: RotateRootThroughVaultInput): Promise<RotateRootOutcome>;
  /** ADR 0037 §1 step 2: this account's pending link offers, authority-only. */
  listPendingLinks(input: EnrollThroughVaultInput): Promise<readonly PendingLinkOfferSummary[]>;
  /** ADR 0037 §1 step 3: signs and relays the new device's certificate after the caller
   * has already confirmed the SAS out of band. */
  approveLink(input: ApproveLinkOfferThroughVaultInput): Promise<ApproveLinkOfferResult>;
  /** Destroys local E2EE state through the live store and forgets this instance. */
  wipe(): Promise<void>;
  close(): void;
}

type E2eeSessionRuntimePollResult = Awaited<ReturnType<E2eeSessionRuntime['pollMailbox']>>;

export function createVaultE2eeSender(options: CreateVaultE2eeSenderOptions): VaultE2eeSender {
  let vault: RatchetSessionVault | undefined = options.vault;
  let owned = options.vault === undefined;
  let fault: E2eeVaultFault | undefined;
  let runtime: E2eeSessionRuntime | undefined;
  let binding: { identity: LocalDeviceIdentity; transports: E2eeTransports } | undefined =
    options.enrolled;
  // Stores this factory has already successfully opened (owned stores are opened
  // lazily below; injected stores arrive unopened and are opened here exactly once,
  // so their open-time faults surface through the same sticky-fault path).
  const openedStores = new WeakSet<object>();

  function noteFault(error: unknown): void {
    if (error instanceof VaultCorruptionError) fault = 'corrupt';
    else if (error instanceof VaultRollbackError) fault = 'rollback';
  }

  async function ensureOpen(): Promise<RatchetSessionVault> {
    if (vault !== undefined) {
      if (!openedStores.has(vault)) {
        try {
          await vault.open();
        } catch (error) {
          noteFault(error);
          throw error;
        }
        openedStores.add(vault);
      }
      return vault;
    }
    const created = await createRatchetSessionVault({
      account: options.account,
      allowInsecureKeyFile: options.allowInsecureKeyFile,
    });
    try {
      await created.open();
    } catch (error) {
      // Corruption and rollback are disclosed as inaccessible-history states — never
      // silently reset (P13-006). Everything else propagates as itself.
      noteFault(error);
      throw error;
    }
    vault = created;
    openedStores.add(created);
    return created;
  }

  async function ensureRuntime(): Promise<E2eeSessionRuntime> {
    if (binding === undefined) throw new E2eeNotEnrolledError();
    if (runtime !== undefined) return runtime;
    const store = await ensureOpen();
    runtime = new E2eeSessionRuntime({
      vault: store,
      identity: binding.identity,
      sendTransport: binding.transports,
      mailboxTransport: binding.transports,
      ...(options.nowMs === undefined ? {} : { nowMs: options.nowMs }),
    });
    return runtime;
  }

  /** Binds a submitted enrollment record through the caller-supplied transport builder. */
  async function bindSubmitted(): Promise<LocalDeviceIdentity | undefined> {
    if (binding !== undefined) return binding.identity;
    if (options.buildTransports === undefined) return undefined;
    const store = await ensureOpen();
    const record = await loadStoredEnrollment(store, (options.nowMs ?? Date.now)());
    if (record?.submitted !== true) return undefined;
    binding = {
      identity: record.identity,
      transports: options.buildTransports(record.identity, store),
    };
    runtime = undefined;
    return binding.identity;
  }

  return {
    fault: () => fault,
    enrolled: () => binding !== undefined,
    async restoreEnrollment(): Promise<LocalDeviceIdentity | undefined> {
      try {
        return await bindSubmitted();
      } catch (error) {
        noteFault(error);
        throw error;
      }
    },
    async enroll(input): Promise<EnrollOutcome> {
      const store = await ensureOpen();
      const outcome = await enrollThisDevice({
        actorId: input.actorId,
        transport: input.transport,
        vault: store,
        ...(options.nowMs === undefined ? {} : { nowMs: options.nowMs }),
      });
      if (outcome.status === 'enrolled' || outcome.status === 'already-enrolled') {
        await bindSubmitted();
      }
      return outcome;
    },
    async beginLink(input): Promise<BeginDeviceLinkOfferResult> {
      const store = await ensureOpen();
      return beginDeviceLinkOffer({
        actorId: input.actorId,
        transport: input.transport,
        vault: store,
        nowMs: options.nowMs ?? Date.now,
      });
    },
    async pollLink(input): Promise<LinkPollOutcome> {
      const store = await ensureOpen();
      const result = await pollLinkedEnrollment({
        actorId: input.actorId,
        transport: input.transport,
        vault: store,
        nowMs: options.nowMs ?? Date.now,
      });
      if (result !== 'enrolled') return { result };
      const identity = await bindSubmitted();
      return { result, ...(identity === undefined ? {} : { deviceId: identity.deviceId }) };
    },
    async rotateRoot(input): Promise<RotateRootOutcome> {
      const store = await ensureOpen();
      const result = await rotateMessagingRoot({
        actorId: input.actorId,
        transport: input.transport,
        vault: store,
        nowMs: options.nowMs ?? Date.now,
        ...(input.previousRoot === undefined ? {} : { previousRoot: input.previousRoot }),
      });
      const identity = await bindSubmitted();
      return { result, ...(identity === undefined ? {} : { deviceId: identity.deviceId }) };
    },
    async listPendingLinks(input): Promise<readonly PendingLinkOfferSummary[]> {
      const store = await ensureOpen();
      return listLinkOffers({
        actorId: input.actorId,
        transport: input.transport,
        vault: store,
        nowMs: options.nowMs ?? Date.now,
      });
    },
    async approveLink(input): Promise<ApproveLinkOfferResult> {
      const store = await ensureOpen();
      return approveLinkOffer({
        actorId: input.actorId,
        linkId: input.linkId,
        transport: input.transport,
        vault: store,
        nowMs: options.nowMs ?? Date.now,
      });
    },
    async send(conversationId, body): Promise<InboxMessageRow> {
      const active = await ensureRuntime();
      const store = await ensureOpen();
      const clientMessageId = randomUUID();
      const sentAtMs = (options.nowMs ?? Date.now)();
      try {
        await active.send(conversationId, body, clientMessageId);
      } catch (error) {
        noteFault(error);
        // A device is not in its own fanout (issue #332): if this is not written the
        // viewer's own text is gone, and a failed send is exactly when losing it hurts
        // most. Best-effort — a vault that cannot be written must not mask the send
        // error that the caller has to see.
        try {
          await recordOwnMessage(store, conversationId, {
            clientMessageId,
            body,
            sentAtMs,
            deliveryState: 'failed',
          });
        } catch (writeError) {
          noteFault(writeError);
        }
        throw error;
      }
      const record = {
        clientMessageId,
        body,
        sentAtMs,
        deliveryState: 'sent',
      } as const;
      await recordOwnMessage(store, conversationId, record);
      return ownMessageRow(record);
    },
    async pollMailbox(
      conversationId?: string,
      opts?: { readonly reading?: boolean },
    ): Promise<E2eeSessionRuntimePollResult> {
      const active = await ensureRuntime();
      const result = await active.pollMailbox({
        ...(conversationId === undefined ? {} : { conversationId }),
      });
      if (conversationId === undefined) return result;
      const store = await ensureOpen();
      const own = await loadOwnMessages(store, conversationId);
      // Durable copy of what this device received: the drain has already acknowledged
      // these envelopes, so persisting before they can be dropped is what stops a
      // received message from disappearing, and a thread that reopens after a restart
      // re-reads it from the vault (issue #352).
      if (result.rows.length > 0) {
        const inbound = inboundMessagesToRecords(result.rows);
        if (inbound.length > 0) {
          if (opts?.reading === false) {
            // Messages drained for a conversation the viewer is not currently reading are
            // unread on this device; the durable count is what survives a reload (#383).
            const known = new Set(
              (await loadInboundMessages(store, conversationId)).map((r) => r.id),
            );
            const fresh = inbound.filter((record) => !known.has(record.id)).length;
            const prior = (await loadUnread(store, conversationId)) ?? 0;
            if (fresh > 0) await setUnread(store, conversationId, prior + fresh);
          }
          await recordInboundMessages(store, conversationId, inbound);
        }
      }
      const inboundRecords = await loadInboundMessages(store, conversationId);
      const all = [...inboundRecords.map(inboundMessageRow), ...result.rows];
      const seen = new Set<string>();
      const drained = all.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
      // Own messages are per-conversation, so they merge only into a thread-scoped
      // drain — an account-wide drain has no single conversation to attribute them to.
      if (own.length === 0 && drained.length === 0) return result;
      return { ...result, rows: mergeOwnMessages(own, drained) };
    },
    async conversationUnread(conversationId: string): Promise<number | undefined> {
      return loadUnread(await ensureOpen(), conversationId);
    },
    async clearConversationUnread(conversationId: string): Promise<void> {
      await clearUnread(await ensureOpen(), conversationId);
    },
    async wipe(): Promise<void> {
      // Route the wipe through the LIVE store (audit P1-2): the same object that holds
      // the lock and the in-memory secrets performs the destruction.
      let target = vault;
      let createdHere = false;
      if (target === undefined) {
        target = await createRatchetSessionVault({
          account: options.account,
          allowInsecureKeyFile: options.allowInsecureKeyFile,
        });
        createdHere = true;
      }
      try {
        await target.wipe();
      } finally {
        if (createdHere) target.close();
      }
      this.close();
      fault = undefined;
    },
    close(): void {
      if (owned && vault !== undefined) vault.close();
      owned = false;
      vault = undefined;
      runtime = undefined;
      binding = undefined;
    },
  };
}
