/**
 * Binds the web E2EE runtime's transport seams to `@patches/client`'s Connect clients
 * (the web analogue of the TUI's `app/e2ee-transports.ts`). Authentication is attached
 * centrally by `api/client.ts`'s interceptor — unlike the TUI, no per-call access token
 * is threaded here.
 *
 * Session setup (ADR 0033/0034): `@patches/crypto` owns the one identity transcript
 * family the node also signs and serves, so a peer's prekey bundle and roster claimed
 * here are re-verified with the same decoder/verifier the node used to accept them —
 * `claimPrekeyBundles` and `loadPeerRoster` are real RPC + verification chains, not a
 * fail-closed stub.
 */
import { Code, ConnectError } from '@connectrpc/connect';
import type { Client, Transport } from '@connectrpc/connect';
import type { E2eeService } from '@patches/proto/es';

import {
  bytesEqual,
  verifyMessagingRoot,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
  type VerifiedMessagingRoot,
  type VerifiedRosterSnapshot,
} from '@patches/crypto';
import { E2eeContractError } from '@patches/domain';
import type { LocalDeviceIdentity } from './local-identity.js';
import { loadPeerIdentityPin, savePeerIdentityPin, type PeerPinVaultAccess } from './vault.js';
import {
  type ClaimedPeerBundle,
  type E2eeMailboxTransport,
  type E2eeSendTransport,
  type FanoutPlan,
  type SendEnvelopesRequestLike,
} from './runtime.js';
import type { EnrollmentCapability, EnrollmentTransport } from './enrollment.js';

/** The slice of the web app's API surface these seams bind (structural so tests can
 * supply a mock without constructing a real Connect client). */
export interface E2eeApiSurface {
  readonly e2ee: Client<typeof E2eeService>;
}

const MAILBOX_PAGE_LIMIT = 50;

/**
 * Fetches and verifies one actor's messaging root + current device roster snapshot,
 * enforcing the client-side pinning contract (ADR 0033 §2/§3; review C1/C2):
 *
 *   * **Roster freshness (C1).** The vault pins the last-verified `(rosterSequence,
 *     rosterDigest)` per peer. A genuinely root-signed but *stale* roster — the node's
 *     cheapest way to make a revoked device look active again — is rejected: sequence may
 *     never go backwards, and the same sequence with a different digest is a fork.
 *   * **Root substitution (C2).** A served root that differs from the pinned one must be
 *     a planned rotation: countersigned by the *verified pinned* root, one generation
 *     later, different key (`verifyMessagingRoot` enforces all three). A brand-new
 *     self-signed root with no countersignature fails closed. First contact is TOFU —
 *     there is nothing to pin against yet.
 *
 * Verification success re-pins, so the pin always reflects bytes this client actually
 * verified.
 */
async function loadVerifiedRoster(
  api: E2eeApiSurface,
  actorId: string,
  nowMs: number,
  pinVault: PeerPinVaultAccess,
  onPeerIdentityEvent?: (event: PeerIdentityEvent) => void,
): Promise<VerifiedRosterSnapshot> {
  const rootResponse = await api.e2ee.getIdentityRoot({ actorId });
  const wireRoot = rootResponse.identityRoot;
  if (wireRoot === undefined) {
    throw new E2eeContractError('That actor has no published messaging identity root.');
  }
  const pin = await loadPeerIdentityPin(pinVault, actorId);
  let root: VerifiedMessagingRoot;
  if (pin === undefined) {
    // First contact (TOFU): no anchor exists, so no rotation proof is checkable. The
    // `first-seen` identity event is the honest disclosure for this case, not a silently
    // accepted root.
    root = verifyMessagingRoot({
      rootBytes: wireRoot.rootBytes,
      selfSignature: wireRoot.selfSignature,
      nowMs,
    });
  } else {
    // Re-verify the pinned root bytes: `verifyMessagingRoot`'s branded result cannot be
    // constructed from a stored public key alone, so the pin stores the signed bytes.
    const pinnedRoot = verifyMessagingRoot({
      rootBytes: pin.rootBytes,
      selfSignature: pin.selfSignature,
      nowMs,
    });
    if (bytesEqual(wireRoot.rootBytes, pin.rootBytes)) {
      root = pinnedRoot;
    } else {
      root = verifyMessagingRoot({
        rootBytes: wireRoot.rootBytes,
        selfSignature: wireRoot.selfSignature,
        ...(wireRoot.previousRootSignature.length === 0
          ? {}
          : { previousRootSignature: wireRoot.previousRootSignature }),
        previousRoot: pinnedRoot,
        nowMs,
      });
      // A rotation that passed the countersignature check is verified against the peer's
      // previous key — worth showing, not just trusting silently.
      onPeerIdentityEvent?.({ kind: 'rotated', actorId });
    }
  }
  const rosterResponse = await api.e2ee.getDeviceRoster({ actorId });
  const wireRoster = rosterResponse.roster;
  if (wireRoster === undefined) {
    throw new E2eeContractError('That actor has no published device roster.');
  }
  const roster = verifyRosterSnapshot({
    rosterBytes: wireRoster.rosterBytes,
    rootSignature: wireRoster.rootSignature,
    root,
    certificates: rosterResponse.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });
  if (pin !== undefined) {
    if (roster.sequence < pin.rosterSequence) {
      throw new E2eeContractError(
        `Node served roster sequence ${String(roster.sequence)} below the pinned ${String(pin.rosterSequence)}; this is a rollback.`,
      );
    }
    if (
      roster.sequence === pin.rosterSequence &&
      !bytesEqual(roster.rosterDigest, pin.rosterDigest)
    ) {
      throw new E2eeContractError('Node served a different roster at the pinned sequence.');
    }
  }
  await savePeerIdentityPin(pinVault, actorId, {
    rootBytes: wireRoot.rootBytes,
    selfSignature: wireRoot.selfSignature,
    rosterSequence: roster.sequence,
    rosterDigest: roster.rosterDigest,
  });
  return roster;
}

// ---------------------------------------------------------------------------
// Send/receive seams for the vault-backed runtime
// ---------------------------------------------------------------------------

export interface CreateWebE2eeTransportsOptions {
  readonly api: E2eeApiSurface;
  readonly identity: LocalDeviceIdentity;
  /** The account's vault — peer identity pins live beside the ratchets (C1/C2). */
  readonly pinVault: PeerPinVaultAccess;
  /**
   * Identity-pinning lifecycle events for the thread-level verification surface (C2).
   * `first-seen` is TOFU first contact (identity not yet verifiable against a pin);
   * `rotated` is a rotation that *passed* the countersignature check. The TUI needs no
   * analogue: it surfaces identity through its safety-number screen and roster-change
   * copy already.
   */
  readonly onPeerIdentityEvent?: (event: PeerIdentityEvent) => void;
}

/** What the thread screen tells the user about a peer's pinned identity (C2). */
export type PeerIdentityEvent =
  | { readonly kind: 'first-seen'; readonly actorId: string }
  | { readonly kind: 'rotated'; readonly actorId: string };

export function createWebE2eeTransports(
  options: CreateWebE2eeTransportsOptions,
): E2eeSendTransport & E2eeMailboxTransport {
  const { api, identity } = options;

  return {
    async loadFanoutPlan(conversationId: string): Promise<FanoutPlan> {
      const state = await api.e2ee.getE2eeConversationState({ conversationId });
      return {
        conversationId,
        membershipEpoch: state.membershipEpoch,
        targets: (state.members ?? []).flatMap((member) =>
          // A member whose devices disagree on the protocol fails the whole send
          // downstream (the node re-checks too); excluding them here would silently
          // shrink the fanout, which is exactly what ADR 0020 §7 forbids.
          member.supportsE2eeV1 === false
            ? []
            : member.activeDeviceIds.map((deviceId) => ({ actorId: member.actorId, deviceId })),
        ),
      };
    },

    async claimPrekeyBundles(request): Promise<readonly ClaimedPeerBundle[]> {
      const nowMs = Date.now();
      const rosterByActor = new Map<string, VerifiedRosterSnapshot>();
      const firstSeen: string[] = [];
      for (const actorId of request.actorIds) {
        const pin = await loadPeerIdentityPin(options.pinVault, actorId);
        if (pin === undefined) firstSeen.push(actorId);
        rosterByActor.set(actorId, await loadVerifiedRoster(api, actorId, nowMs, options.pinVault));
      }
      for (const actorId of firstSeen) {
        options.onPeerIdentityEvent?.({ kind: 'first-seen', actorId });
      }
      const response = await api.e2ee.claimPrekeyBundles({
        conversationId: request.conversationId,
        actorIds: [...request.actorIds],
      });
      return response.bundles.map((bundle) => {
        const roster = rosterByActor.get(bundle.actorId);
        const certificate = bundle.deviceCertificate;
        const signedPrekey = bundle.signedPrekey;
        if (roster === undefined || certificate === undefined || signedPrekey === undefined) {
          throw new E2eeContractError('Claimed prekey bundle is missing required fields.');
        }
        const oneTimePreKey =
          bundle.oneTimePrekey === undefined || bundle.oneTimePrekeyExhausted
            ? undefined
            : { id: Number(bundle.oneTimePrekey.keyId), publicKey: bundle.oneTimePrekey.publicKey };
        const verified = verifyPreKeyBundle({
          bundleBytes: bundle.bundleBytes,
          deviceSignature: bundle.deviceSignature,
          certificateBytes: certificate.certificateBytes,
          certificateRootSignature: certificate.rootSignature,
          ...(oneTimePreKey === undefined ? {} : { oneTimePreKey }),
          roster,
          nowMs,
        });
        // M3: address envelopes with the *transcript-verified* ids, never the node's
        // convenience fields — a swapped wire deviceId would otherwise seal the envelope
        // for one device under another's keys (silent per-device delivery denial).
        return {
          actorId: verified.actorId,
          deviceId: verified.deviceId,
          bundle: verified,
          roster,
        };
      });
    },

    async sendEnvelopes(request: SendEnvelopesRequestLike): Promise<unknown> {
      return api.e2ee.sendEnvelopes({
        conversationId: request.conversationId,
        clientRequestId: request.clientRequestId,
        senderDeviceId: request.senderDeviceId,
        message: {
          logicalMessageId: request.message.logicalMessageId,
          membershipEpoch: request.message.membershipEpoch,
          frankingCommitment: request.message.frankingCommitment,
          frankingProfile: request.message.frankingProfile,
          fanoutDigest: request.message.fanoutDigest,
          // A fresh mutable array of plain envelopes — the runtime hands us its
          // readonly composition view, the wire wants its own mutable init shape.
          deviceEnvelopes: request.message.deviceEnvelopes.map((envelope) => ({
            recipientActorId: envelope.recipientActorId,
            recipientDeviceId: envelope.recipientDeviceId,
            encryptedHeader: envelope.encryptedHeader,
            ciphertext: envelope.ciphertext,
            openingCiphertext: envelope.openingCiphertext,
            ciphertextDigest: envelope.ciphertextDigest,
          })),
        },
      });
    },

    async listMailboxPage(cursor: string) {
      const response = await api.e2ee.listMailboxEnvelopes({
        deviceId: identity.deviceId,
        cursor,
        limit: MAILBOX_PAGE_LIMIT,
      });
      return {
        envelopes: response.envelopes,
        nextCursor: response.page?.nextCursor ?? '',
      };
    },

    async acknowledge(envelopeIds: readonly string[]): Promise<void> {
      // Fresh mutable array: the wire init shape takes `string[]`, the runtime seam
      // hands us its readonly view.
      await api.e2ee.acknowledgeEnvelopes({
        deviceId: identity.deviceId,
        envelopeIds: [...envelopeIds],
      });
    },

    loadPeerRoster(actorId: string): Promise<VerifiedRosterSnapshot> {
      if (actorId !== identity.actorId) {
        return loadVerifiedRoster(
          api,
          actorId,
          Date.now(),
          options.pinVault,
          options.onPeerIdentityEvent,
        );
      }
      // This device's own roster is locally held and root-signed by this vault.
      return Promise.resolve(identity.ownRoster);
    },
  };
}

// ---------------------------------------------------------------------------
// Conversation creation seam — see `web-e2ee.ts` for why creation fails closed
// ---------------------------------------------------------------------------

/** Structural shape of `CreateE2eeConversationRequest` the manager composes. */
export interface CreateE2eeConversationInput {
  readonly clientRequestId: string;
  readonly senderDeviceId: string;
  readonly recipientActorIds: readonly string[];
}

export interface E2eeConversationCreateTransport {
  createE2eeConversation(input: CreateE2eeConversationInput): Promise<{ conversationId: string }>;
}

export function bindConversationCreate(api: E2eeApiSurface): E2eeConversationCreateTransport {
  return {
    // ADR 0035: `CreateE2eeConversationRequest` no longer carries the first message —
    // the node reserves the conversation id, invisible until a real `SendEnvelopes`
    // lands into it, because the envelope AD binds a conversation id that used to not
    // exist yet when the client sealed it. So this seam takes no message at all: the
    // caller seals its envelopes against the id this returns and follows up with
    // `sendEnvelopes`. Composing that two-step send is the caller's job, not this
    // transport's.
    async createE2eeConversation(input) {
      const response = await api.e2ee.createE2eeConversation({
        clientRequestId: input.clientRequestId,
        senderDeviceId: input.senderDeviceId,
        recipientActorIds: [...input.recipientActorIds],
      });
      return { conversationId: response.conversationId };
    },
  };
}

// ---------------------------------------------------------------------------
// Enrollment seam
// ---------------------------------------------------------------------------

export interface CreateWebEnrollmentTransportOptions {
  readonly api:
    E2eeApiSurface | (Pick<E2eeApiSurface, 'e2ee'> & { readonly transport?: Transport });
}

/** Implements `EnrollmentTransport` over the Connect client, including the one error
 * mapping the flow depends on: `GetIdentityRoot`'s NOT_FOUND means "no root published
 * yet" (the first-device bootstrap path), while any other failure surfaces instead of
 * being read as absence — a network blip must never look like an enrollable fresh
 * account. */
export function createWebEnrollmentTransport(
  options: CreateWebEnrollmentTransportOptions,
): EnrollmentTransport {
  const api = options.api;
  return {
    async getCapability(): Promise<EnrollmentCapability | undefined> {
      const response = await api.e2ee.getE2eeCapability({});
      if (response.capability === undefined) return undefined;
      return {
        state: response.capability.state,
        supportedProtocolVersions: [...response.capability.supportedProtocolVersions],
      };
    },

    async getIdentityRoot(actorId) {
      try {
        const response = await api.e2ee.getIdentityRoot({ actorId });
        return response.identityRoot;
      } catch (error) {
        if (error instanceof ConnectError && error.code === Code.NotFound) return undefined;
        throw error;
      }
    },

    async publishIdentityRoot(request) {
      await api.e2ee.publishIdentityRoot(request);
    },

    async enrollDevice(request) {
      await api.e2ee.enrollDevice(request);
    },

    async getDeviceRoster(actorId) {
      const response = await api.e2ee.getDeviceRoster({ actorId });
      return { roster: response.roster, certificates: response.certificates };
    },

    async beginDeviceLink(request) {
      return api.e2ee.beginDeviceLink(request);
    },

    async listPendingDeviceLinks() {
      return api.e2ee.listPendingDeviceLinks({});
    },

    async cancelDeviceLink(linkId) {
      await api.e2ee.cancelDeviceLink({ linkId });
    },

    async revokeDevice(request) {
      await api.e2ee.revokeDevice(request);
    },

    // One-time prekey replenishment + signed-prekey rotation (ADR 0020 §5, issue #278).
    async getPrekeyInventory(deviceId) {
      return api.e2ee.getPrekeyInventory({ deviceId });
    },

    async uploadPrekeys(request) {
      return api.e2ee.uploadPrekeys(request);
    },
  };
}
