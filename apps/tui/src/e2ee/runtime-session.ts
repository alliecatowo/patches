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

import { parseHistoryTransfer } from './history-transfer.js';
import type { LocalDeviceIdentity } from './local-identity.js';
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
  decodePayload,
  encodeChatPlaintext,
  epochToNumber,
  sessionIdFor,
  type E2eeMailboxEnvelopeLike,
  type E2eeMailboxTransport,
  type E2eeSendTransport,
  type FanoutTarget,
  type InboxRow,
  type PollResult,
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
}

interface PreparedSession {
  readonly state: DoubleRatchetState;
  /** Present only when the next envelope is the session's initial (X3DH) message. */
  readonly setupPrefix?: Uint8Array | undefined;
  /** True when this call created the session (its first envelope must reach the peer). */
  readonly createdHere?: boolean | undefined;
}

export class E2eeSessionRuntime {
  private readonly vault: RatchetSessionVault;
  private readonly identity: LocalDeviceIdentity;
  private readonly sendTransport: E2eeSendTransport;
  private readonly mailboxTransport: E2eeMailboxTransport;
  private readonly nowMs: () => number;

  constructor(options: E2eeRuntimeOptions) {
    this.vault = options.vault;
    this.identity = options.identity;
    this.sendTransport = options.sendTransport;
    this.mailboxTransport = options.mailboxTransport;
    this.nowMs = options.nowMs ?? ((): number => Date.now());
  }

  // ------------------------------- send -----------------------------------

  async send(conversationId: string, body: string, clientRequestId: string): Promise<void> {
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
   */
  async pollMailbox(filter?: {
    readonly conversationId?: string | undefined;
  }): Promise<PollResult> {
    const conversationFilter = filter?.conversationId;
    const rows: InboxRow[] = [];
    const acknowledged: string[] = [];
    let cursor = '';
    let error: string | undefined;
    for (;;) {
      let page: Awaited<ReturnType<E2eeMailboxTransport['listMailboxPage']>>;
      try {
        page = await this.mailboxTransport.listMailboxPage(cursor);
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
            // Already processed and committed before a lost ack \u2014 safe to acknowledge
            // again so the mailbox drains; nothing is rendered twice.
            acknowledged.push(envelope.envelopeId);
            continue;
          }
          error = 'Envelope processing failed';
          break;
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
    const storedState = await this.vault.getSession(sessionId);

    let state: DoubleRatchetState;
    let message: { encryptedHeader: Uint8Array; ciphertext: Uint8Array };
    if (isInitialEnvelopeHeader(envelope.encryptedHeader)) {
      const { setup, ratchetHeader } = splitInitialHeader(envelope.encryptedHeader);
      message = { encryptedHeader: ratchetHeader, ciphertext: envelope.ciphertext };
      if (storedState !== undefined) {
        // Redelivery of an initial message after its session was already committed.
        state = storedState;
      } else {
        const initiatorRoster = await this.mailboxTransport.loadPeerRoster(setup.senderActorId);
        const established = establishResponderSession({
          identity: this.identity,
          setup,
          initiatorRoster,
          nowMs: this.nowMs(),
        });
        state = established.state;
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
    await this.vault.applyUpdate(sessionId, opened.state);

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
}

function isReplayDuplicate(error: unknown): boolean {
  return error instanceof ReplayedMessageError;
}
