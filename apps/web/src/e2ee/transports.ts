/**
 * Binds the web E2EE runtime's transport seams to `@patches/client`'s Connect clients
 * (the web analogue of the TUI's `app/e2ee-transports.ts`). Authentication is attached
 * centrally by `api/client.ts`'s interceptor — unlike the TUI, no per-call access token
 * is threaded here.
 *
 * Honesty note on session setup (ADR 0020 §5, B-124): X3DH verifies peer material
 * through `@patches/crypto`'s *crypto-native* transcript encoders, while the node stores
 * and serves the *node-canonical* encodings (`e2ee.codec.ts`; see
 * `./node-transcripts.ts`). Converting between them requires signatures this client
 * provably cannot mint — a peer's root signature needs the peer's root private key — so
 * until those encoders are unified in `@patches/domain` (the B-124 hoist), claiming peer
 * prekey bundles fails closed with the runtime's fixed copy instead of half-verifying.
 * Everything without that dependency — fanout plans, envelope submission, the mailbox,
 * acknowledgements, and this device's own roster — is bound for real.
 */
import { Code, ConnectError } from '@connectrpc/connect';
import type { Client, Transport } from '@connectrpc/connect';
import { E2eeService } from '@patches/proto/es';

import type { SignedDeviceRoster } from '@patches/crypto';
import type { LocalDeviceIdentity } from './local-identity.js';
import {
  E2eeSetupUnavailableError,
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

// ---------------------------------------------------------------------------
// Send/receive seams for the vault-backed runtime
// ---------------------------------------------------------------------------

export interface CreateWebE2eeTransportsOptions {
  readonly api: E2eeApiSurface;
  readonly identity: LocalDeviceIdentity;
}

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

    claimPrekeyBundles(): Promise<readonly ClaimedPeerBundle[]> {
      // See the module header: converting node-served bundle material into the
      // crypto-native shapes X3DH authenticates is impossible from this side alone.
      // Failing closed beats half-verifying (ADR 0020 §14.2); no inventory is consumed
      // (the claim RPC is never even issued).
      return Promise.reject(new E2eeSetupUnavailableError());
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

    loadPeerRoster(actorId: string): Promise<SignedDeviceRoster> {
      if (actorId !== identity.actorId) {
        // Peer chains are verified through the node-canonical bytes elsewhere; the
        // crypto-native roster X3DH demands cannot be derived for another actor.
        return Promise.reject(new E2eeSetupUnavailableError());
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
  readonly message: SendEnvelopesRequestLike['message'];
}

export interface E2eeConversationCreateTransport {
  createE2eeConversation(input: CreateE2eeConversationInput): Promise<{ conversationId: string }>;
}

export function bindConversationCreate(api: E2eeApiSurface): E2eeConversationCreateTransport {
  return {
    async createE2eeConversation(input) {
      const response = await api.e2ee.createE2eeConversation({
        clientRequestId: input.clientRequestId,
        senderDeviceId: input.senderDeviceId,
        recipientActorIds: [...input.recipientActorIds],
        message: {
          membershipEpoch: input.message.membershipEpoch,
          frankingCommitment: input.message.frankingCommitment,
          frankingProfile: input.message.frankingProfile,
          fanoutDigest: input.message.fanoutDigest,
          logicalMessageId: input.message.logicalMessageId,
          deviceEnvelopes: input.message.deviceEnvelopes.map((envelope) => ({
            recipientActorId: envelope.recipientActorId,
            recipientDeviceId: envelope.recipientDeviceId,
            encryptedHeader: envelope.encryptedHeader,
            ciphertext: envelope.ciphertext,
            openingCiphertext: envelope.openingCiphertext,
            ciphertextDigest: envelope.ciphertextDigest,
          })),
        },
      });
      return { conversationId: response.conversationId };
    },
  };
}

// ---------------------------------------------------------------------------
// Enrollment seam
// ---------------------------------------------------------------------------

export interface CreateWebEnrollmentTransportOptions {
  readonly api: E2eeApiSurface | (Pick<E2eeApiSurface, 'e2ee'> & { readonly transport?: Transport });
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
  };
}
