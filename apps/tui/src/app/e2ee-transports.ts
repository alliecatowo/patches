/**
 * Binds the e2ee runtime's transport seams (B-101) to the shell's authenticated
 * `PatchesApi`, and implements the enrollment flow's transport seam (B-107).
 *
 * Session setup (ADR 0033/0034): `@patches/crypto` owns the one identity transcript
 * family the node also signs and serves, so a peer's prekey bundle and roster claimed
 * here are re-verified with the same decoder/verifier the node used to accept them —
 * `claimPrekeyBundles` and `loadPeerRoster` are real RPC + verification chains, not a
 * fail-closed stub.
 */
import { Code } from '@connectrpc/connect';
import {
  verifyMessagingRoot,
  verifyPreKeyBundle,
  verifyRosterSnapshot,
  type VerifiedMessagingRoot,
  type VerifiedRosterSnapshot,
} from '@patches/crypto';
import { E2eeContractError } from '@patches/domain';

import { grpcStatusCode } from '../api/errors.js';
import type { PatchesApi } from '../api/client.js';
import type { EnrollmentCapability, EnrollmentTransport } from '../e2ee/enrollment.js';
import type { LocalDeviceIdentity } from '../e2ee/local-identity.js';
import {
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
  | 'getDeviceRoster'
  | 'getE2eeConversationState'
  | 'claimPrekeyBundles'
  | 'sendEnvelopes'
  | 'listMailboxEnvelopes'
  | 'acknowledgeEnvelopes'
>;

/** Fetches and verifies one actor's messaging root + current device roster snapshot. */
async function loadVerifiedRoster(
  api: E2eeApiSurface,
  accessToken: () => Promise<string>,
  actorId: string,
  nowMs: number,
): Promise<VerifiedRosterSnapshot> {
  const token = await accessToken();
  const rootResponse = await api.getIdentityRoot({ actorId }, token);
  const wireRoot = rootResponse.identityRoot;
  if (wireRoot === undefined) {
    throw new E2eeContractError('That actor has no published messaging identity root.');
  }
  const root: VerifiedMessagingRoot = verifyMessagingRoot({
    rootBytes: wireRoot.rootBytes,
    selfSignature: wireRoot.selfSignature,
    nowMs,
  });
  const rosterResponse = await api.getDeviceRoster({ actorId }, token);
  const wireRoster = rosterResponse.roster;
  if (wireRoster === undefined) {
    throw new E2eeContractError('That actor has no published device roster.');
  }
  return verifyRosterSnapshot({
    rosterBytes: wireRoster.rosterBytes,
    rootSignature: wireRoster.rootSignature,
    root,
    certificates: rosterResponse.certificates.map((certificate) => ({
      certificateBytes: certificate.certificateBytes,
      rootSignature: certificate.rootSignature,
    })),
    nowMs,
  });
}

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

    async claimPrekeyBundles(request): Promise<readonly ClaimedPeerBundle[]> {
      const nowMs = Date.now();
      const rosterByActor = new Map<string, VerifiedRosterSnapshot>();
      for (const actorId of request.actorIds) {
        rosterByActor.set(
          actorId,
          await loadVerifiedRoster(api, options.accessToken, actorId, nowMs),
        );
      }
      const accessToken = await options.accessToken();
      const response = await api.claimPrekeyBundles(
        { conversationId: request.conversationId, actorIds: [...request.actorIds] },
        accessToken,
      );
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
        return { actorId: bundle.actorId, deviceId: bundle.deviceId, bundle: verified, roster };
      });
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

    loadPeerRoster(actorId: string): Promise<VerifiedRosterSnapshot> {
      if (actorId !== identity.actorId) {
        return loadVerifiedRoster(api, options.accessToken, actorId, Date.now());
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
