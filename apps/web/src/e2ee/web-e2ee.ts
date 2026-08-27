/**
 * The web app's E2EE manager (B-102 follow-up): one module-level owner of the vault,
 * the enrolled identity, and the session runtime — the browser analogue of the TUI's
 * `app/e2ee-send.ts` pipeline, bound to `@patches/client`'s Connect transport.
 *
 * Ownership rules carried over unchanged (ADR 0020 §4):
 *   - ONE vault per tab per account, opened once; faults (corrupt/rollback) are sticky
 *     and coarse — the UI shows an inaccessible-history state with an explicit reset,
 *     never a silent wipe;
 *   - an enrolled identity is required before any send/receive (`E2eeNotEnrolledError`
 *     fixed copy otherwise);
 *   - signing out does NOT wipe the vault — the vault is account-scoped storage, and
 *     wipe is an explicit, labeled destructive act.
 *
 * Conversation **creation** fails closed here, for two independent and documented
 * reasons (both also bind the TUI, which is why neither client wires a working create):
 *   1. B-124: establishing the first session needs peer prekey bundles in the
 *      crypto-native encoding X3DH verifies, which the node cannot serve (see
 *      `transports.ts`).
 *   2. The wire contract itself: `CreateE2eeConversation` mints the conversation id
 *      server-side *after* the client composes the initial message — but every
 *      envelope's AEAD associated data binds the conversation id the *recipient* will
 *      read off the wire (`packages/crypto`'s `encodeDeviceEnvelopeAssociatedData`
 *      requires it non-empty). A client cannot seal an initial envelope for an id it
 *      cannot know; inventing one would produce envelopes no recipient can ever open.
 *      This manager refuses to do that (fail closed) rather than shipping un-openable
 *      ciphertext.
 */
import { useSyncExternalStore } from 'react';

import { api } from '../api/client.js';

import type { InboxRow } from './runtime.js';
import { E2eeNotEnrolledError } from './runtime.js';
import { E2eeSessionRuntime } from './runtime-session.js';
import type { LocalDeviceIdentity } from './local-identity.js';
import {
  createRatchetSessionVault,
  wipeVaultStorage,
  type RatchetSessionVault,
  type WebVaultAccount,
} from './vault.js';
import {
  ENROLLMENT_PEER_WARNING_COPY,
  disposeStoredEnrollment,
  enrollThisDevice,
  loadStoredEnrollment,
  type EnrollOutcome,
  type EnrollmentTransport,
} from './enrollment.js';
import {
  bindConversationCreate,
  createWebE2eeTransports,
  createWebEnrollmentTransport,
  type E2eeApiSurface,
  type PeerIdentityEvent,
} from './transports.js';

/** Fixed, content-free copy for every state and failure (ADR 0020 §4 / spec §194). */
export const WEB_E2EE_COPY = {
  vaultFault:
    'The encrypted message history stored in this browser cannot be opened. It may have ' +
    'been restored from an older backup. Resetting deletes this browser’s E2EE history ' +
    'and enrolls a fresh device; conversations stay on the node.',
  notEnrolled: 'This browser has no enrolled messaging device yet.',
  enrollFailed: 'Enrolling this browser did not complete. Nothing was half-registered.',
  sendFailed: 'The message could not be delivered.',
  pollFailed: 'Could not fetch new encrypted messages.',
  createFailed: 'The conversation could not be started.',
  peerWarning: ENROLLMENT_PEER_WARNING_COPY,
} as const;

export type WebE2eeStatus =
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'not-enrolled' }
  | { readonly kind: 'enrolling' }
  | { readonly kind: 'enrolled' }
  | { readonly kind: 'refused'; readonly copy: string }
  | { readonly kind: 'fault'; readonly copy: string };

/** Error with fixed user copy for create/send/enroll failures (content-free by rule). */
export class WebE2eeUnavailableError extends Error {
  constructor(copy: string) {
    super(copy);
    this.name = new.target.name;
  }
}

export interface WebE2eeManagerOptions {
  /** The app's Connect API surface; defaults to the real singleton (`api/client.ts`). */
  readonly api?: E2eeApiSurface | undefined;
  /** Injectable clock (tests). */
  readonly nowMs?: (() => number) | undefined;
}

type Listener = () => void;

class WebE2eeManager {
  private status: WebE2eeStatus = { kind: 'signed-out' };
  private readonly listeners = new Set<Listener>();
  private vault: RatchetSessionVault | undefined;
  private identity: LocalDeviceIdentity | undefined;
  private runtime: E2eeSessionRuntime | undefined;
  /** The account the open vault belongs to (set by `setActor`, read by `enroll`). */
  private actorId: string | undefined;
  /** The last actor `setActor` was asked to become, independent of `actorId`/`release()`
   * — a fault clears `actorId` (via `release()`) even though the manager never held a
   * vault for it, so `wipe()` needs its own memory of which account's storage to erase.
   * Cleared only on sign-out (`setActor(null)`), never by a fault or a superseded call. */
  private lastActorId: string | undefined;
  /** Serializes `setActor`: each call captures its own sequence number and checks it
   * after every await. A call whose number no longer matches was superseded by a later
   * call (StrictMode double-effect, rapid navigation) — it closes whatever vault it
   * opened instead of leaking the IndexedDB connection, and never touches shared state
   * (single-owner rule, `vault.ts:36-38`). The last call issued always wins. */
  private setActorSeq = 0;
  private readonly api: E2eeApiSurface;
  private readonly nowMs: (() => number) | undefined;
  /**
   * Peer-identity events from the transports (C2's verification surface): `first-seen`
   * for TOFU contact, `rotated` for a countersignature-verified rotation. One entry per
   * (actor, kind), latest wins — this is a disclosure list, not a log. Cleared with the
   * account on `setActor`.
   */
  private identityEvents = new Map<string, PeerIdentityEvent>();
  /** Cached snapshot so `useSyncExternalStore` sees a stable reference between events. */
  private identityEventsSnapshot: readonly PeerIdentityEvent[] = [];

  constructor(options: WebE2eeManagerOptions = {}) {
    this.api = options.api ?? api;
    this.nowMs = options.nowMs;
  }

  getStatus(): WebE2eeStatus {
    return this.status;
  }

  /** Identity-pinning disclosures for the thread screen (C2). */
  getIdentityEvents(): readonly PeerIdentityEvent[] {
    return this.identityEventsSnapshot;
  }

  private noteIdentityEvent(event: PeerIdentityEvent): void {
    this.identityEvents.set(`${event.kind}:${event.actorId}`, event);
    this.identityEventsSnapshot = [...this.identityEvents.values()];
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(next: WebE2eeStatus): void {
    this.status = next;
    for (const listener of this.listeners) listener();
  }

  private release(): void {
    this.vault?.close();
    this.vault = undefined;
    this.identity = undefined;
    this.runtime = undefined;
    this.actorId = undefined;
    this.identityEvents = new Map();
    this.identityEventsSnapshot = [];
  }

  /** Called by the session layer on sign-in/sign-out/actor switch. */
  async setActor(actor: { readonly id: string } | null): Promise<void> {
    if (actor !== null && actor.id === this.lastActorId && this.vault !== undefined) {
      // Already the bound actor with an open vault (ADR 0020 §4: one connection at a
      // time) — a second consumer binding to the actor this manager already holds open
      // (e.g. a settings route mounted alongside the messages route) must not tear down
      // and reopen a live connection just to reach the same state. `reloadEnrollment()`
      // is the seam for picking up a write another flow made to the stored record; this
      // is a no-op join, not a refresh.
      return;
    }
    const seq = (this.setActorSeq += 1);
    if (actor === null) {
      this.release();
      this.lastActorId = undefined;
      this.setStatus({ kind: 'signed-out' });
      return;
    }
    this.release();
    this.lastActorId = actor.id;
    this.setStatus({ kind: 'loading' });
    let vault: RatchetSessionVault | undefined;
    try {
      const account: WebVaultAccount = { origin: location.origin, actorId: actor.id };
      vault = await createRatchetSessionVault({ account });
      if (seq !== this.setActorSeq) {
        // Superseded while opening: a later setActor call already owns `this.vault`
        // (or none does, e.g. a later sign-out). Close the vault THIS call opened
        // rather than leaking the connection, and leave shared state untouched.
        vault.close();
        return;
      }
      const stored = await loadStoredEnrollment(vault, Date.now());
      if (seq !== this.setActorSeq) {
        vault.close();
        return;
      }
      if (stored === undefined || !stored.submitted) {
        // Keep the vault open: enroll() runs against THIS instance (single-owner rule).
        this.vault = vault;
        this.actorId = actor.id;
        this.setStatus({ kind: 'not-enrolled' });
        return;
      }
      this.actorId = actor.id;
      this.bind(vault, stored.identity);
      // `bind` only needs `stored.identity` going forward; the account root private key
      // this load pulled off disk has no further use in this manager and must not sit in
      // memory unzeroized (ADR 0020 §4).
      disposeStoredEnrollment(stored);
      this.setStatus({ kind: 'enrolled' });
    } catch {
      if (seq !== this.setActorSeq) {
        // Superseded before or during the failure: don't clobber whatever the winning
        // call has since set. Still close any vault this call itself opened.
        vault?.close();
        return;
      }
      // Sticky, coarse, content-free fault — never the error itself (spec §194).
      this.release();
      this.setStatus({ kind: 'fault', copy: WEB_E2EE_COPY.vaultFault });
    }
  }

  private bind(vault: RatchetSessionVault, identity: LocalDeviceIdentity): void {
    const transports = createWebE2eeTransports({
      api: this.api,
      identity,
      pinVault: vault,
      onPeerIdentityEvent: (event) => this.noteIdentityEvent(event),
    });
    this.vault = vault;
    this.identity = identity;
    this.runtime = new E2eeSessionRuntime({
      vault,
      identity,
      sendTransport: transports,
      mailboxTransport: transports,
      ...(this.nowMs === undefined ? {} : { nowMs: this.nowMs }),
    });
  }

  /** Runs device enrollment for the signed-in actor (idempotent, resumable). */
  async enroll(): Promise<EnrollOutcome> {
    if (this.status.kind === 'enrolled' && this.identity !== undefined) {
      return { status: 'already-enrolled', identity: this.identity };
    }
    if (this.status.kind !== 'not-enrolled' && this.status.kind !== 'refused') {
      throw new WebE2eeUnavailableError(WEB_E2EE_COPY.notEnrolled);
    }
    if (this.vault === undefined || this.identity !== undefined || this.actorId === undefined) {
      throw new WebE2eeUnavailableError(WEB_E2EE_COPY.notEnrolled);
    }
    const actorId = this.actorId;
    this.setStatus({ kind: 'enrolling' });
    try {
      const outcome = await enrollThisDevice({
        actorId,
        transport: createWebEnrollmentTransport({ api: this.api }),
        vault: this.vault,
        ...(this.nowMs === undefined ? {} : { nowMs: this.nowMs }),
      });
      if (outcome.status === 'refused' || outcome.status === 'needs-authority') {
        this.setStatus({ kind: 'refused', copy: outcome.copy });
        return outcome;
      }
      this.bind(this.vault, outcome.identity);
      this.setStatus({ kind: 'enrolled' });
      return outcome;
    } catch (error) {
      // The record (if any) is durable in the vault; a retry resumes it verbatim. The
      // vault stays open in `not-enrolled` so the button can be pressed again.
      this.setStatus({ kind: 'not-enrolled' });
      if (error instanceof WebE2eeUnavailableError) throw error;
      throw new WebE2eeUnavailableError(WEB_E2EE_COPY.enrollFailed);
    }
  }

  async send(conversationId: string, body: string): Promise<void> {
    const runtime = this.requireRuntime();
    try {
      await runtime.send(conversationId, body, crypto.randomUUID());
    } catch (error) {
      if (error instanceof WebE2eeUnavailableError || error instanceof E2eeNotEnrolledError) {
        throw error;
      }
      // Transport/protocol failures surface as fixed copy; the staged-commit protocol
      // has already handled state recovery internally (audit P1-1).
      throw new WebE2eeUnavailableError(WEB_E2EE_COPY.sendFailed);
    }
  }

  async poll(conversationId: string): Promise<readonly InboxRow[]> {
    const runtime = this.requireRuntime();
    const result = await runtime.pollMailbox({ conversationId });
    return result.rows;
  }

  /**
   * Reserves a conversation with `recipientActorIds` and sends `body` into it as the
   * first message (ADR 0035). Two RPCs on purpose: the envelope's AEAD associated data
   * binds the conversation id, so the id has to exist before anything can be sealed for
   * it. Returns the new conversation id.
   */
  async createConversation(recipientActorIds: readonly string[], body: string): Promise<string> {
    const runtime = this.requireRuntime();
    const identity = this.identity;
    if (identity === undefined) throw new E2eeNotEnrolledError();
    let conversationId: string;
    try {
      const reserved = await bindConversationCreate(this.api).createE2eeConversation({
        clientRequestId: crypto.randomUUID(),
        senderDeviceId: identity.deviceId,
        recipientActorIds,
      });
      conversationId = reserved.conversationId;
    } catch {
      // Content-free by rule (spec §194): the reservation either happened or it did not,
      // and the recipient-availability failures are deliberately indistinguishable (§62).
      throw new WebE2eeUnavailableError(WEB_E2EE_COPY.createFailed);
    }
    try {
      await runtime.send(conversationId, body, crypto.randomUUID());
    } catch (error) {
      if (error instanceof E2eeNotEnrolledError) throw error;
      throw new WebE2eeUnavailableError(WEB_E2EE_COPY.sendFailed);
    }
    return conversationId;
  }

  /** Explicit, labeled destructive reset (also the only exit from a sticky fault).
   * Must erase before releasing: `IndexedDbRatchetVaultStore.wipe()` is a no-op on an
   * already-closed store, so the underlying wipe has to run while this manager still
   * owns an open vault, not after. `this.vault` is claimed (set to `undefined`) up
   * front so the `release()` call below — which also closes whatever vault it finds —
   * never double-closes the one this method already closed itself. */
  async wipe(): Promise<void> {
    const vault = this.vault;
    this.vault = undefined;
    if (vault !== undefined) {
      try {
        await vault.wipe();
      } finally {
        vault.close();
      }
    } else if (this.lastActorId !== undefined) {
      // A sticky open()-time fault (rollback/corruption) never hands this manager a
      // vault at all — `createRatchetSessionVault` closes and discards the store
      // itself on a failed `open()` (`vault.ts`), and the fault path's `release()`
      // already cleared `this.actorId`. `lastActorId` survives that clear, so this
      // reaches the same erased end state directly by account key — a genuine exit
      // from the fault, not just a status reset that leaves the same cause to
      // re-fault next time.
      await wipeVaultStorage({ origin: location.origin, actorId: this.lastActorId });
    }
    this.release();
    this.setStatus({ kind: 'not-enrolled' });
  }

  /** FIFO queue backing `withVault`/`reloadEnrollment`: two callers reading or writing
   * the stored enrollment record (a `withVault` caller and this manager's own
   * `reloadEnrollment`) never interleave on the vault's one open connection.
   * `send`/`poll` don't need this — they only exercise the ratchet session runtime,
   * never the stored enrollment record. */
  private operationChain: Promise<unknown> = Promise.resolve();

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.operationChain.then(fn, fn);
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * The narrow public seam settings/device-link UI needs (issue #279): hands `fn` this
   * manager's OWN open vault/actor/enrollment-transport instead of opening a second
   * IndexedDB connection to the same account (ADR 0020 §4 — one connection at a time),
   * and queues `fn` behind any other `withVault`/`reloadEnrollment` call so two callers
   * never read or write the stored enrollment record at once. Rejects with
   * `WebE2eeUnavailableError` if this browser has no open vault for a signed-in actor
   * right now (signed-out/loading/fault).
   */
  async withVault<T>(
    fn: (ctx: {
      readonly vault: RatchetSessionVault;
      readonly actorId: string;
      readonly transport: EnrollmentTransport;
    }) => Promise<T>,
  ): Promise<T> {
    return this.enqueue(async () => {
      if (this.vault === undefined || this.actorId === undefined) {
        throw new WebE2eeUnavailableError(WEB_E2EE_COPY.notEnrolled);
      }
      return fn({
        vault: this.vault,
        actorId: this.actorId,
        transport: createWebEnrollmentTransport({ api: this.api }),
      });
    });
  }

  /**
   * Re-reads the stored enrollment record after an external `withVault` caller (link,
   * rotate, or recovery-archive import) wrote a new one. Replaces the old
   * `setActor(null)`/`setActor({id})` round trip, which also transiently dropped
   * `identity`/`runtime` and reported `loading`/`not-enrolled` to every other consumer of
   * this manager for no reason other than forcing a reread. A no-op if this manager has
   * no open vault right now. Queued behind any in-flight `withVault` call so it never
   * reads a half-written record.
   */
  async reloadEnrollment(): Promise<void> {
    return this.enqueue(async () => {
      if (this.vault === undefined || this.actorId === undefined) return;
      const stored = await loadStoredEnrollment(this.vault, Date.now());
      if (stored === undefined || !stored.submitted) {
        this.setStatus({ kind: 'not-enrolled' });
        return;
      }
      this.bind(this.vault, stored.identity);
      disposeStoredEnrollment(stored);
      this.setStatus({ kind: 'enrolled' });
    });
  }

  private requireRuntime(): E2eeSessionRuntime {
    if (this.runtime === undefined || this.identity === undefined) {
      throw new E2eeNotEnrolledError();
    }
    return this.runtime;
  }
}

export type WebE2ee = WebE2eeManager;

export function createWebE2eeManager(options?: WebE2eeManagerOptions): WebE2ee {
  return new WebE2eeManager(options);
}

let singleton: WebE2eeManager | undefined;

/** The app's one manager. */
export function webE2ee(): WebE2eeManager {
  if (singleton === undefined) singleton = createWebE2eeManager();
  return singleton;
}

/** React binding: re-renders on every status transition. */
export function useWebE2eeStatus(): WebE2eeStatus {
  const manager = webE2ee();
  return useSyncExternalStore(
    (listener) => manager.subscribe(listener),
    () => manager.getStatus(),
    () => manager.getStatus(),
  );
}

/** React binding for the identity-pinning disclosures (C2): re-renders on each event. */
export function usePeerIdentityEvents(): readonly PeerIdentityEvent[] {
  const manager = webE2ee();
  return useSyncExternalStore(
    (listener) => manager.subscribe(listener),
    () => manager.getIdentityEvents(),
    () => manager.getIdentityEvents(),
  );
}
