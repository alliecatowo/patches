/**
 * The TUI's end-to-end session runtime (B-101) — the send fanout and the mailbox
 * receive loop, implemented over `runtime.ts`'s seams.
 *
 * **Send** (ADR 0020 §5–§8): load the fanout plan (epoch + active member devices) → for
 * each device pair without a session, claim prekey bundles and run the initiator half of
 * X3DH → pad and encode one logical plaintext → derive ONE opening + commitment per
 * logical message → seal one device envelope per target → stage every advanced state
 * durably BEFORE any bytes leave (P13-006's crash-window contract) → hand the whole
 * fanout to `SendEnvelopes` → confirm every staged state. A transport failure CONFIRMS
 * the staged states instead of leaving them pending (audit P1-1): adoption makes the
 * reloaded ratchet at least as advanced as anything sent, so one failed send can never
 * wedge the conversation into "staged send pending" forever.
 *
 * **Receive** (ADR 0020 §4; ADR 0025 §4 for the failure UX): poll the device mailbox →
 * open each envelope through `openDeviceEnvelope`, which refuses anything whose
 * associated data (logical message id, node-delivered commitment) does not authenticate
 * or whose recovered opening fails the franking check — there is deliberately no way to
 * render past that check → commit the advanced ratchet state durably → only then
 * acknowledge. A franking failure renders a neutral placeholder and is still
 * acknowledged; it is never shown, and never silent either.
 */
import {
  commitFranking,
  createFrankingOpeningKey,
  openDeviceEnvelope,
  ReplayedMessageError,
  sealDeviceEnvelope,
  sha256Hash,
} from '@patches/crypto';
import {
  canonicalFanoutTranscript,
  E2eeContractError,
  E2EE_FRANKING_PROFILE_V1,
} from '@patches/domain';

import { E2EE_DEVICE_REVOKED_COPY, refreshOwnRoster } from './device-link.js';
import type { EnrollmentTransport } from './enrollment.js';
import { loadStoredEnrollment, saveStoredEnrollment } from './enrollment.js';
import { parseHistoryTransfer } from './history-transfer.js';
import type { LocalDeviceIdentity } from './local-identity.js';
import { maintainPrekeys } from './prekey-maintenance.js';
import type { RatchetSessionVault } from './ratchet-vault.js';
import type { DoubleRatchetState, RatchetTransition } from '@patches/crypto';
import type { OpenedDeviceEnvelope } from '@patches/crypto';
import {
  establishInitiatorSession,
  establishResponderSession,
  isInitialEnvelopeHeader,
  splitInitialHeader,
  withInitialFraming,
} from './session-setup.js';
import {
  createInMemoryQuarantineStore,
  decodePayload,
  encodeChatPlaintext,
  epochToNumber,
  sessionIdFor,
  E2eeReceiveUnavailableError,
  E2EE_QUARANTINE_LIMIT_COPY,
  E2EE_RECEIVE_UNAVAILABLE_COPY,
  MAX_QUARANTINED_PER_DRAIN,
  type E2eeMailboxEnvelopeLike,
  type E2eeMailboxTransport,
  type E2eeSendTransport,
  type FanoutTarget,
  type InboxRow,
  type PollResult,
  type QuarantineReason,
  type QuarantineStore,
  type QuarantinedEnvelopeRecord,
} from './runtime.js';

export interface E2eeRuntimeOptions {
  readonly vault: RatchetSessionVault;
  readonly identity: LocalDeviceIdentity;
  readonly sendTransport: E2eeSendTransport;
  readonly mailboxTransport: E2eeMailboxTransport;
  /**
   * Clock for certificate and prekey validity windows. Injectable so tests can pin a
   * moment inside (or outside) a certificate's window; production omits it. Session
   * setup is the only place time is consulted — the ratchet itself is timeless.
   */
  readonly nowMs?: (() => number) | undefined;
  /**
   * Enrollment transport seam (issue #277): when present, `send`/`pollMailbox` refresh
   * this device's OWN stored roster (`refreshOwnRoster`) at most once per
   * `refreshIntervalMs`, instead of trusting the roster snapshot captured when this
   * runtime was constructed forever. Omitted, the runtime behaves exactly as before —
   * kept optional so existing callers/tests need no changes.
   */
  readonly transport?: EnrollmentTransport | undefined;
  /** Own-roster refresh cadence (issue #277). Defaults to 30 seconds; injectable for tests. */
  readonly refreshIntervalMs?: number | undefined;
  /**
   * Where quarantine notes for undecryptable envelopes are kept (issue #260). Defaults to a
   * process-lifetime in-memory store; a shell that wants the notes to survive a restart passes
   * its own. Notes are content-free by construction, so no adapter of this needs to be secret.
   */
  readonly quarantineStore?: QuarantineStore | undefined;
}

/** Default own-roster refresh cadence (issue #277) — matches the mailbox poll cadence
 * order of magnitude without adding a refresh round trip to every single send/receive. */
const DEFAULT_ROSTER_REFRESH_INTERVAL_MS = 30_000;

/** Prekey maintenance cadence (ADR 0020 §5, issue #278): at most once per this interval per
 * process, since a `GetPrekeyInventory` round trip on every single send would be wasteful and
 * the underlying thresholds (20 remaining, 7 days) tolerate this much slack trivially. */
const DEFAULT_PREKEY_MAINTENANCE_INTERVAL_MS = 10 * 60_000;

interface PreparedSession {
  readonly state: DoubleRatchetState;
  /** Present only when the next envelope is the session's initial (X3DH) message. */
  readonly setupPrefix?: Uint8Array | undefined;
  /** True when this call created the session (its first envelope must reach the peer). */
  readonly createdHere?: boolean | undefined;
}

export class E2eeSessionRuntime {
  private readonly vault: RatchetSessionVault;
  /** Mutable (issue #277): `ensureFreshOwnRoster` replaces this with the reloaded stored
   * identity whenever the served roster digest has moved forward. */
  private identity: LocalDeviceIdentity;
  private readonly sendTransport: E2eeSendTransport;
  private readonly mailboxTransport: E2eeMailboxTransport;
  private readonly nowMs: () => number;
  private readonly transport: EnrollmentTransport | undefined;
  private readonly refreshIntervalMs: number;
  private readonly quarantineStore: QuarantineStore;
  /** Epoch ms at which the next `refreshOwnRoster` call is due; 0 forces one immediately. */
  private nextRosterRefreshMs = 0;
  /** Epoch ms at which the next `maintainPrekeys` call is due; 0 forces one immediately
   * (issue #278). */
  private nextPrekeyMaintenanceMs = 0;
  /** True once a refresh has observed this device revoked (issue #277 comment). Sticky
   * for the life of this runtime instance until a later refresh observes it active again
   * (e.g. re-linked under a fresh roster) — never cleared by anything except a refresh. */
  private deviceRevoked = false;

  constructor(options: E2eeRuntimeOptions) {
    this.vault = options.vault;
    this.identity = options.identity;
    this.sendTransport = options.sendTransport;
    this.mailboxTransport = options.mailboxTransport;
    this.nowMs = options.nowMs ?? ((): number => Date.now());
    this.transport = options.transport;
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_ROSTER_REFRESH_INTERVAL_MS;
    this.quarantineStore = options.quarantineStore ?? createInMemoryQuarantineStore();
  }

  /**
   * The content-free notes for envelopes this device quarantined (issue #260), optionally
   * narrowed to one conversation, so a thread can still show the gap on a later poll that
   * quarantined nothing. Never carries ciphertext, keys, or any fragment of a body.
   */
  listQuarantined(conversationId?: string): Promise<readonly QuarantinedEnvelopeRecord[]> {
    return this.quarantineStore.list(conversationId);
  }

  /**
   * Re-syncs this device's own roster from the vault at most once per
   * `refreshIntervalMs` (issue #277) — a no-op when no `transport` was supplied, so a
   * caller that omits it gets exactly today's constructor-time-snapshot behavior. When
   * the served digest moved forward, reloads the full stored identity (fresh keys the
   * decode step re-verifies, not just the roster field) so every later X3DH in this
   * runtime binds the SAME digest a peer that just fetched it would.
   */
  private async ensureFreshOwnRoster(): Promise<void> {
    if (this.transport === undefined) return;
    const now = this.nowMs();
    if (now < this.nextRosterRefreshMs) return;
    this.nextRosterRefreshMs = now + this.refreshIntervalMs;
    const result = await refreshOwnRoster({
      actorId: this.identity.actorId,
      transport: this.transport,
      vault: this.vault,
      nowMs: this.nowMs,
    });
    if (result.changed) {
      const stored = await loadStoredEnrollment(this.vault, now);
      if (stored !== undefined) this.identity = stored.identity;
    }
    this.deviceRevoked = !result.selfActive;
  }

  /**
   * Replenishes one-time prekeys and rotates the signed prekey when due, at most once per
   * `DEFAULT_PREKEY_MAINTENANCE_INTERVAL_MS` (ADR 0020 §5, issue #278) — a no-op when no
   * `transport` was supplied, matching `ensureFreshOwnRoster`'s opt-in shape. Best-effort: a
   * failure here (a transient network error, a rate-limited node) must never block sending a
   * message — the next scheduled attempt, or the node's own drain-rate limits in the meantime,
   * cover a missed cycle.
   */
  private async ensurePrekeysMaintained(): Promise<void> {
    if (this.transport === undefined) return;
    const now = this.nowMs();
    if (now < this.nextPrekeyMaintenanceMs) return;
    this.nextPrekeyMaintenanceMs = now + DEFAULT_PREKEY_MAINTENANCE_INTERVAL_MS;
    try {
      await maintainPrekeys({
        identity: this.identity,
        transport: this.transport,
        vault: this.vault,
        nowMs: this.nowMs,
      });
    } catch {
      // See doc comment: best-effort by design, never surfaced to the sender.
    }
  }

  // ------------------------------- send -----------------------------------

  async send(conversationId: string, body: string, clientRequestId: string): Promise<void> {
    await this.ensureFreshOwnRoster();
    await this.ensurePrekeysMaintained();
    if (this.deviceRevoked) {
      throw new Error(E2EE_DEVICE_REVOKED_COPY);
    }
    const plan = await this.sendTransport.loadFanoutPlan(conversationId);
    const epoch = epochToNumber(plan.membershipEpoch);
    const selfKey = `${this.identity.actorId}\u0000${this.identity.deviceId}`;
    // v1 composes pairwise sessions for every active member device. The composer's own
    // device is excluded; the account's *other* devices stay in — they are how sent
    // history reaches them (ADR 0020 §7).
    const targets = plan.targets.filter(
      (target) => `${target.actorId}\u0000${target.deviceId}` !== selfKey,
    );
    const plaintext = encodeChatPlaintext(body);
    const openingKey = createFrankingOpeningKey();
    const context = {
      frankingProfile: E2EE_FRANKING_PROFILE_V1,
      conversationId,
      membershipEpoch: epoch,
      senderActorId: this.identity.actorId,
      senderDeviceId: this.identity.deviceId,
    };
    // One opening and one commitment per LOGICAL message, computed over the exact padded
    // bytes every envelope seals — `sealDeviceEnvelope` re-derives both and refuses to
    // ship an envelope that would disagree with them (ADR 0025 §2).
    const commitment = commitFranking(openingKey, context, plaintext);

    const stagedSessions: string[] = [];
    // Sessions created by THIS send. If the transport fails, they are deleted rather
    // than confirmed: their very first (X3DH-carrying) envelope never reached the peer,
    // so no later normal message could ever authenticate against them — recovery means
    // re-running session establishment, not adopting an unreadable chain.
    const createdSessions = new Set<string>();
    const envelopes: {
      recipientActorId: string;
      recipientDeviceId: string;
      encryptedHeader: Uint8Array;
      ciphertext: Uint8Array;
      openingCiphertext: Uint8Array;
      ciphertextDigest: Uint8Array;
    }[] = [];
    try {
      for (const target of targets) {
        const session = await this.ensureSendSession(conversationId, target);
        if (session.createdHere) {
          createdSessions.add(sessionIdFor(conversationId, target.actorId, target.deviceId));
        }
        const transition = sealDeviceEnvelope(session.state, {
          context,
          recipient: { recipientActorId: target.actorId, recipientDeviceId: target.deviceId },
          logicalMessageId: clientRequestId,
          plaintext,
          openingKey,
          commitment,
        });
        const header =
          session.setupPrefix === undefined
            ? transition.output.encryptedHeader
            : withInitialFraming(session.setupPrefix, transition.output.encryptedHeader);
        envelopes.push({
          recipientActorId: target.actorId,
          recipientDeviceId: target.deviceId,
          encryptedHeader: header,
          ciphertext: transition.output.ciphertext,
          openingCiphertext: new Uint8Array(0),
          ciphertextDigest: sha256Hash(transition.output.ciphertext),
        });
        // Durable BEFORE these bytes may leave (P13-006). If anything below throws, the
        // catch confirms every staged state so adoption — not a pending wedge — is the
        // recovery path (audit P1-1).
        await this.vault.stageSend(
          sessionIdFor(conversationId, target.actorId, target.deviceId),
          transition.state,
        );
        stagedSessions.push(sessionIdFor(conversationId, target.actorId, target.deviceId));
      }
      await this.sendTransport.sendEnvelopes({
        conversationId,
        clientRequestId,
        senderDeviceId: this.identity.deviceId,
        message: {
          // ADR 0025: the envelopes bind THIS id into their AD; the node must store and
          // return it verbatim or every recipient-side open fails authentication.
          logicalMessageId: clientRequestId,
          membershipEpoch: plan.membershipEpoch,
          frankingCommitment: commitment,
          frankingProfile: E2EE_FRANKING_PROFILE_V1,
          fanoutDigest: sha256Hash(
            canonicalFanoutTranscript({
              frankingProfile: E2EE_FRANKING_PROFILE_V1,
              frankingCommitment: commitment,
              deviceEnvelopes: envelopes,
            }),
          ),
          deviceEnvelopes: envelopes,
        },
      });
    } catch (error) {
      for (const sessionId of stagedSessions) {
        try {
          if (createdSessions.has(sessionId)) {
            // The initial (X3DH) envelope never reached this peer: drop the session so
            // the next send re-establishes from a fresh prekey claim.
            await this.vault.deleteSession(sessionId);
          } else {
            // Pre-existing session: adopt the staged state (audit P1-1) so the ratchet
            // stays ahead of anything sent and the next send flows normally.
            await this.vault.confirmSend(sessionId);
          }
        } catch {
          // Best-effort: the staged state also recovers via the next open's adoption.
        }
      }
      throw error;
    }
    for (const sessionId of stagedSessions) {
      await this.vault.confirmSend(sessionId);
    }
  }

  /**
   * Loads (or X3DH-establishes) the sending side of one device-pair session. Session
   * creation commits through `applyUpdate` before any envelope exists to send, so a
   * crash here leaves an unused-but-valid session, never a half-established one.
   *
   * `applyUpdate` consumes (zeroizes) the state handed to it, so the freshly created
   * session is read back from the vault rather than reused from memory — sealing must
   * happen against exactly the bytes that were durably committed.
   */
  private async ensureSendSession(
    conversationId: string,
    target: FanoutTarget,
  ): Promise<PreparedSession> {
    const sessionId = sessionIdFor(conversationId, target.actorId, target.deviceId);
    const existing = await this.vault.getSession(sessionId);
    if (existing !== undefined) return { state: existing, createdHere: false };
    const claimed = await this.sendTransport.claimPrekeyBundles({
      conversationId,
      actorIds: [target.actorId],
    });
    const peer = claimed.find(
      (candidate) => candidate.actorId === target.actorId && candidate.deviceId === target.deviceId,
    );
    if (peer === undefined) {
      throw new E2eeContractError('The node did not return a prekey bundle for a fanout target.');
    }
    const established = establishInitiatorSession({
      identity: this.identity,
      peerBundle: peer.bundle,
      peerRoster: peer.roster,
      nowMs: this.nowMs(),
    });
    await this.vault.applyUpdate(sessionId, established.state);
    const stored = await this.vault.getSession(sessionId);
    if (stored === undefined)
      throw new Error('Session vault did not persist a just-committed session.');
    return {
      state: stored,
      setupPrefix: established.setupPrefix,
      createdHere: true,
    };
  }

  // ------------------------------ receive ---------------------------------

  /**
   * Drains the device mailbox once, oldest first, until exhausted. Rows are returned in
   * delivery order; acknowledgement happens strictly after each envelope's receive-state
   * commit (ADR 0020 §4), batched once per drain. With `conversationId` given, only that
   * conversation's envelopes are processed (and acknowledged); everything else stays
   * queued for whichever thread opens next.
   *
   * Failure handling splits by cause (issue #260, revising B-193's blanket fail-stop):
   * a fault local to this device stops the drain unacknowledged, so nothing decryptable is
   * ever skipped, while an envelope this device can never open is quarantined — noted
   * content-free, surfaced as a `quarantined` row, acknowledged, and drained past — bounded
   * at `MAX_QUARANTINED_PER_DRAIN` per pass.
   */
  async pollMailbox(filter?: {
    readonly conversationId?: string | undefined;
  }): Promise<PollResult> {
    // Issue #277: keeps this device's own roster converging on the mailbox poll cadence
    // too, not only on send — the responder half of X3DH (`establishResponderSession`)
    // binds `identity.ownRoster` into the handshake it verifies exactly like the
    // initiator half does.
    await this.ensureFreshOwnRoster();
    const conversationFilter = filter?.conversationId;
    const rows: InboxRow[] = [];
    const acknowledged: string[] = [];
    let cursor = '';
    let error: string | undefined;
    let quarantinedThisDrain = 0;
    for (;;) {
      let page: Awaited<ReturnType<E2eeMailboxTransport['listMailboxPage']>>;
      try {
        // #152: ask the node to filter server-side when this poll is scoped to one
        // conversation, instead of paging the whole mailbox and discarding the rest below —
        // the discard loop stays as defense-in-depth against a transport that ignores the
        // filter (e.g. in tests), not as the primary filtering mechanism anymore.
        page = await this.mailboxTransport.listMailboxPage(cursor, conversationFilter);
      } catch {
        error = 'Could not fetch new encrypted messages.';
        break;
      }
      for (const envelope of page.envelopes) {
        if (conversationFilter !== undefined && envelope.conversationId !== conversationFilter) {
          // Not this thread's mail: leave it queued (unacknowledged) so its own
          // conversation drains it in order when opened.
          continue;
        }
        try {
          const row = await this.processEnvelope(envelope);
          if (row !== undefined) rows.push(row);
          acknowledged.push(envelope.envelopeId);
        } catch (caught) {
          if (isReplayDuplicate(caught)) {
            // Already processed and committed before a lost ack — safe to acknowledge
            // again so the mailbox drains; nothing is rendered twice.
            acknowledged.push(envelope.envelopeId);
            continue;
          }
          if (caught instanceof E2eeReceiveUnavailableError) {
            // The fault is this device's (vault, stored enrollment, a mailbox round trip),
            // not the envelope's, so the same envelope may open perfectly once it clears:
            // fail-stop WITHOUT acknowledging. Envelopes acknowledged earlier in this page
            // keep their commits; this one and the rest redeliver on a later poll.
            error = E2EE_RECEIVE_UNAVAILABLE_COPY;
            break;
          }
          // Issue #260: this envelope is undecryptable on this device and will be exactly as
          // undecryptable on every future poll, so the old unconditional fail-stop wedged the
          // whole mailbox forever behind one bad — possibly injected — envelope. Instead:
          // note it locally (content-free), surface a row, acknowledge past it, keep draining.
          if (quarantinedThisDrain >= MAX_QUARANTINED_PER_DRAIN) {
            error = E2EE_QUARANTINE_LIMIT_COPY;
            break;
          }
          const reason = quarantineReasonFor(caught);
          try {
            await this.quarantineStore.record({
              envelopeId: envelope.envelopeId,
              conversationId: envelope.conversationId,
              reason,
              atMs: this.nowMs(),
            });
          } catch {
            // The quarantine could not be recorded: leave the envelope unacknowledged rather
            // than skipping it with no local trace that anything was skipped at all.
            error = E2EE_RECEIVE_UNAVAILABLE_COPY;
            break;
          }
          quarantinedThisDrain += 1;
          rows.push({ kind: 'quarantined', id: envelope.envelopeId, reason });
          acknowledged.push(envelope.envelopeId);
        }
      }
      if (error !== undefined || page.nextCursor === '') break;
      cursor = page.nextCursor;
    }
    if (acknowledged.length > 0) {
      try {
        await this.mailboxTransport.acknowledge(acknowledged);
      } catch {
        // Acknowledgement is best-effort on the wire: unacked envelopes redeliver, and
        // the replay guard above turns that into a no-op rather than a duplicate row.
      }
    }
    return { rows, ...(error === undefined ? {} : { error }) };
  }

  /**
   * Runs one receive step whose failure would be a property of THIS DEVICE (vault I/O, the
   * stored enrollment record, a mailbox round trip) rather than of the envelope, and reports
   * it as `E2eeReceiveUnavailableError`. This classification is what keeps issue #260's
   * quarantine honest: only deterministic, envelope-caused failures are ever skipped past,
   * and a transient local fault still fail-stops the drain with nothing acknowledged.
   */
  private async localReceiveStep<T>(step: () => Promise<T>): Promise<T> {
    try {
      return await step();
    } catch (error) {
      // A replay is a property of the envelope, not of this device — the drain's own replay
      // branch acknowledges it, so it must never be rewritten into a local fault.
      if (error instanceof ReplayedMessageError) throw error;
      throw new E2eeReceiveUnavailableError();
    }
  }

  private async processEnvelope(envelope: E2eeMailboxEnvelopeLike): Promise<InboxRow | undefined> {
    const sentByViewer = envelope.senderActorId === this.identity.actorId;
    const senderLabel = sentByViewer ? 'you' : `@${envelope.senderActorId}`;
    if (
      envelope.recipientDeviceId !== this.identity.deviceId ||
      envelope.frankingTag?.profile === undefined ||
      envelope.frankingTag.profile === ''
    ) {
      return { kind: 'undisplayable', id: envelope.envelopeId };
    }
    const epoch = epochToNumber(envelope.membershipEpoch);
    const context = {
      frankingProfile: envelope.frankingTag.profile,
      conversationId: envelope.conversationId,
      membershipEpoch: epoch,
      senderActorId: envelope.senderActorId,
      senderDeviceId: envelope.senderDeviceId,
    } as const;
    const sessionId = sessionIdFor(
      envelope.conversationId,
      envelope.senderActorId,
      envelope.senderDeviceId,
    );
    const storedState = await this.localReceiveStep(() => this.vault.getSession(sessionId));

    let state: DoubleRatchetState;
    let message: { encryptedHeader: Uint8Array; ciphertext: Uint8Array };
    // Set only on the branch below that actually spends a one-time prekey; consumed after the
    // resulting state is durably committed (see the commit past `openDeviceEnvelope`).
    let consumedOneTimePreKeyId: number | undefined;
    if (isInitialEnvelopeHeader(envelope.encryptedHeader)) {
      const { setup, ratchetHeader } = splitInitialHeader(envelope.encryptedHeader);
      message = { encryptedHeader: ratchetHeader, ciphertext: envelope.ciphertext };
      if (storedState !== undefined) {
        // Redelivery of an initial message after its session was already committed.
        state = storedState;
      } else {
        const initiatorRoster = await this.localReceiveStep(() =>
          this.mailboxTransport.loadPeerRoster(setup.senderActorId),
        );
        // Issue #278: a rotated signed prekey may still be named by an initial message an
        // initiator sealed just before rotation reached them — `loadStoredEnrollment` (not the
        // in-memory `this.identity`, which never carries retained material) is the source of
        // truth for what is still retained.
        const storedForRetainedKeys = await this.localReceiveStep(() =>
          loadStoredEnrollment(this.vault, this.nowMs()),
        );
        const established = establishResponderSession({
          identity: this.identity,
          setup,
          initiatorRoster,
          nowMs: this.nowMs(),
          previousSignedPreKeys: storedForRetainedKeys?.previousSignedPreKeys,
        });
        state = established.state;
        consumedOneTimePreKeyId = established.consumedOneTimePreKeyId;
      }
    } else {
      if (storedState === undefined) {
        // No session yet and nothing to bootstrap from: never guess.
        return { kind: 'undisplayable', id: envelope.envelopeId };
      }
      state = storedState;
      message = { encryptedHeader: envelope.encryptedHeader, ciphertext: envelope.ciphertext };
    }

    let opened: RatchetTransition<OpenedDeviceEnvelope>;
    try {
      opened = openDeviceEnvelope(state, {
        context,
        recipient: {
          recipientActorId: this.identity.actorId,
          recipientDeviceId: this.identity.deviceId,
        },
        logicalMessageId: envelope.logicalMessageId,
        message,
        commitment: envelope.frankingCommitment,
      });
    } catch (error) {
      if (error instanceof ReplayedMessageError) throw error;
      // AEAD or franking failure: the plaintext was discarded inside
      // `openDeviceEnvelope`. ADR 0025 §4 — neutral placeholder, still acknowledged,
      // never rendered, never silent. Not committing the advanced state is safe: the
      // ratchet's skipped-key handling absorbs the consumed position on the next
      // delivery from this session.
      return { kind: 'unverifiable', id: envelope.envelopeId, senderLabel };
    }

    // Commit the receive-side advance BEFORE acknowledging (ADR 0020 §4).
    await this.localReceiveStep(() => this.vault.applyUpdate(sessionId, opened.state));

    // ADR 0020 §5: the one-time private key answers exactly one handshake. Removed only now,
    // strictly after the session commit above — a crash before that commit leaves the prekey in
    // place so the handshake can still be re-derived on retry; a crash after commit but before
    // this removal at worst leaves one already-spent key on disk, which the next attempt to use
    // it fails harmlessly (there is no un-derived session left for it to open).
    if (consumedOneTimePreKeyId !== undefined) {
      await this.consumeOneTimePreKey(consumedOneTimePreKeyId);
    }

    let payload: ReturnType<typeof decodePayload>;
    try {
      payload = decodePayload(opened.output.plaintext);
    } catch {
      return { kind: 'undisplayable', id: envelope.envelopeId };
    }
    if (payload.kind === 'chat') {
      return {
        kind: 'message',
        id: envelope.envelopeId,
        senderLabel,
        body: payload.body ?? '',
        sentByViewer,
      };
    }
    // History transfer: display-only provenance, parsed and labeled, never fed back
    // into any session state (ADR 0020 §7/§10).
    try {
      const transfer = parseHistoryTransfer(payload.record ?? new Uint8Array());
      return {
        kind: 'history',
        id: envelope.envelopeId,
        fromLabel: `@${transfer.fromActorId}`,
        entries: transfer.entries.map((entry) => ({
          senderLabel: `@${entry.senderActorId}`,
          body: new TextDecoder().decode(entry.plaintext),
        })),
      };
    } catch {
      return { kind: 'undisplayable', id: envelope.envelopeId };
    }
  }

  /**
   * Drops a spent one-time prekey from both the in-memory identity — so this runtime never
   * offers it to `establishResponderSession` again this process — and the vault-persisted
   * enrollment record, so it stays dropped across restarts (issue #153, ADR 0020 §5). Reloads
   * the stored record fresh rather than reusing an earlier snapshot, since
   * `ensurePrekeysMaintained`/`ensureFreshOwnRoster` may have written to it since this envelope's
   * handshake began. No stored record (never enrolled, or a vault carrying only session state)
   * is a no-op past the in-memory update — there is nothing durable to correct.
   */
  private async consumeOneTimePreKey(id: number): Promise<void> {
    this.identity = {
      ...this.identity,
      oneTimePreKeys: this.identity.oneTimePreKeys.filter((prekey) => prekey.id !== id),
    };
    await this.localReceiveStep(async () => {
      const stored = await loadStoredEnrollment(this.vault, this.nowMs());
      if (stored === undefined) return;
      await saveStoredEnrollment(this.vault, {
        ...stored,
        identity: {
          ...stored.identity,
          oneTimePreKeys: stored.identity.oneTimePreKeys.filter((prekey) => prekey.id !== id),
        },
      });
    });
  }
}

function isReplayDuplicate(error: unknown): boolean {
  return error instanceof ReplayedMessageError;
}

/**
 * Classifies an envelope-caused failure (issue #260) for the content-free quarantine note.
 * `E2eeContractError` covers every structural/contract check that runs before a ratchet step
 * (a bad membership epoch, an initial header naming prekeys or a device this side never had) —
 * anything else reaching this point already survived those checks and failed inside the
 * ratchet/AEAD machinery itself.
 */
function quarantineReasonFor(error: unknown): QuarantineReason {
  return error instanceof E2eeContractError ? 'malformed' : 'undecryptable';
}
