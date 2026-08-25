/**
 * Binds the e2ee runtime's transport seams (B-101) to the shell's authenticated
 * `PatchesApi`, and implements the enrollment flow's transport seam (B-107).
 *
 * Honesty note on session setup (ADR 0020 §5): X3DH verifies peer material through
 * `@patches/crypto`'s *crypto-native* transcript encoders, while the node stores and
 * serves the *node-canonical* encodings (`e2ee.codec.ts`; see `../e2ee/node-transcripts.ts`).
 * Converting between them requires signatures this client provably cannot mint — a peer's
 * root signature needs the peer's root private key — so until those encoders are unified
 * in `@packages/domain` (the hoist this enrollment flow documents), claiming peer prekey
 * bundles fails closed with the runtime's fixed copy instead of half-verifying. Everything
 * without that dependency — fanout plans, envelope submission, the mailbox,
 * acknowledgements, and this device's own roster — is bound for real.
 */
import { Code } from '@connectrpc/connect';
import type { SignedDeviceRoster } from '@patches/crypto';

import { grpcStatusCode } from '../api/errors.js';
import type { PatchesApi } from '../api/client.js';
import type { EnrollmentCapability, EnrollmentTransport } from '../e2ee/enrollment.js';
import type { LocalDeviceIdentity } from '../e2ee/local-identity.js';
import {
  E2eeSetupUnavailableError,
  type ClaimedPeerBundle,
  type E2eeMailboxTransport,
  type E2eeSendTransport,
  type FanoutPlan,
  type SendEnvelopesRequestLike,
} from '../e2ee/runtime.js';

/**
 * The slice of `PatchesApi` these seams bind. Taken verbatim (a `Pick`) rather than
 * re-declared structurally, so the real client always satisfies it and the two can
 * never drift.
 */
export type E2eeApiSurface = Pick<
  PatchesApi,
  | 'target'
  | 'getE2eeCapability'
  | 'getIdentityRoot'
  | 'publishIdentityRoot'
  | 'enrollDevice'
  | 'getE2eeConversationState'
  | 'sendEnvelopes'
  | 'listMailboxEnvelopes'
  | 'acknowledgeEnvelopes'
>;

const MAILBOX_PAGE_LIMIT = 50;

// ---------------------------------------------------------------------------
// Send/receive seams for the vault-backed runtime
// ---------------------------------------------------------------------------

export interface CreateE2eeTransportsOptions {
  readonly api: E2eeApiSurface;
  /** Resolves the current access token (refreshing as needed). */
  readonly accessToken: () => Promise<string>;
  readonly identity: LocalDeviceIdentity;
}

export function createE2eeTransports(
  options: CreateE2eeTransportsOptions,
): E2eeSendTransport & E2eeMailboxTransport {
  const { api, identity } = options;

  return {
    async loadFanoutPlan(conversationId: string): Promise<FanoutPlan> {
      const accessToken = await options.accessToken();
      const state = await api.getE2eeConversationState({ conversationId }, accessToken);
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
      // Failing closed beats half-verifying (ADR 0020 §14.2); no inventory is consumed.
      return Promise.reject(new E2eeSetupUnavailableError());
    },

    async sendEnvelopes(request: SendEnvelopesRequestLike): Promise<unknown> {
      const accessToken = await options.accessToken();
      return api.sendEnvelopes(
        {
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
        },
        accessToken,
      );
    },

    async listMailboxPage(cursor: string) {
      const accessToken = await options.accessToken();
      const response = await api.listMailboxEnvelopes(
        { deviceId: identity.deviceId, cursor, limit: MAILBOX_PAGE_LIMIT },
        accessToken,
      );
      return {
        envelopes: response.envelopes,
        nextCursor: response.page?.nextCursor ?? '',
      };
    },

    async acknowledge(envelopeIds: readonly string[]): Promise<void> {
      const accessToken = await options.accessToken();
      // Fresh mutable array: the wire init shape takes `string[]`, the runtime seam
      // hands us its readonly view.
      await api.acknowledgeEnvelopes(
        { deviceId: identity.deviceId, envelopeIds: [...envelopeIds] },
        accessToken,
      );
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
// Enrollment seam for the Accounts/Devices flows
// ---------------------------------------------------------------------------

export interface CreateEnrollmentTransportOptions {
  readonly api: E2eeApiSurface;
  readonly accessToken: () => Promise<string>;
}

/** Implements `EnrollmentTransport` over `PatchesApi`, including the one error mapping
 * the flow depends on: `GetIdentityRoot`'s NOT_FOUND means "no root published yet" (the
 * first-device bootstrap path), while any other failure surfaces instead of being read
 * as absence — a network blip must never look like an enrollable fresh account. */
export function createEnrollmentTransport(
  options: CreateEnrollmentTransportOptions,
): EnrollmentTransport {
  return {
    async getCapability(): Promise<EnrollmentCapability | undefined> {
      const response = await options.api.getE2eeCapability({});
      if (response.capability?.state === undefined) return undefined;
      return {
        state: response.capability.state,
        supportedProtocolVersions: [...(response.capability.supportedProtocolVersions ?? [])],
      };
    },

    async getIdentityRoot(actorId) {
      try {
        const accessToken = await options.accessToken();
        const response = await options.api.getIdentityRoot({ actorId }, accessToken);
        return response.identityRoot;
      } catch (error) {
        if (grpcStatusCode(error) === Code.NotFound) return undefined;
        throw error;
      }
    },

    async publishIdentityRoot(request) {
      const accessToken = await options.accessToken();
      await options.api.publishIdentityRoot(request, accessToken);
    },

    async enrollDevice(request) {
      const accessToken = await options.accessToken();
      await options.api.enrollDevice(request, accessToken);
    },
  };
}
