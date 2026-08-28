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
 * Conversation creation reserves a bare conversation (ADR 0035: no message on the
 * reserve) via `CreateE2eeConversation`, then sends the first message through the same
 * `send()` path as any later message — see `createConversation` below.
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
} from './enrollment.js';
import {
  bindConversationCreate,
  createWebE2eeTransports,
  createWebEnrollmentTransport,
  type E2eeApiSurface,
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
  createFailed: 'The conversation could not be created.',
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

  constructor(options: WebE2eeManagerOptions = {}) {
    this.api = options.api ?? api;
    this.nowMs = options.nowMs;
  }

  getStatus(): WebE2eeStatus {
    return this.status;
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
  }

  /** Called by the session layer on sign-in/sign-out/actor switch. */
  async setActor(actor: { readonly id: string } | null): Promise<void> {
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
    const transports = createWebE2eeTransports({ api: this.api, identity });
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
      if (outcome.status === 'refused') {
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
   * Reserves a new E2EE conversation (`CreateE2eeConversation`, ADR 0035 — the reserve
   * itself carries no message) and immediately sends `firstMessageBody` into the id it
   * returns through the ordinary `send()` path, so the reservation never becomes visible
   * (ADR 0035 §5) without a real first message landing in the same call.
   */
  async createConversation(
    recipientActorIds: readonly string[],
    firstMessageBody: string,
  ): Promise<{ readonly conversationId: string }> {
    const identity = this.identity;
    this.requireRuntime();
    if (identity === undefined) throw new E2eeNotEnrolledError();
    try {
      const reserved = await bindConversationCreate(this.api).createE2eeConversation({
        clientRequestId: crypto.randomUUID(),
        senderDeviceId: identity.deviceId,
        recipientActorIds,
      });
      await this.send(reserved.conversationId, firstMessageBody);
      return reserved;
    } catch (error) {
      if (error instanceof WebE2eeUnavailableError || error instanceof E2eeNotEnrolledError) {
        throw error;
      }
      throw new WebE2eeUnavailableError(WEB_E2EE_COPY.createFailed);
    }
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
